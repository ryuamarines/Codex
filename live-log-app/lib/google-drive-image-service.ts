import type { LiveEntryImage } from "@/lib/types";
import { getFirebaseAuth } from "@/lib/firebase/client";

export const DRIVE_FOLDER_ID_KEY = "live-log-drive-folder-id";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function firebaseAuthorizedFetch(input: string, init: RequestInit = {}) {
  const auth = getFirebaseAuth();

  if (!auth) {
    throw new Error("Google ログインが設定されていません。");
  }

  await auth.authStateReady();
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Google ログインが必要です。");
  }

  let response: Response | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const idToken = await user.getIdToken(attempt > 0);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${idToken}`);
    response = await fetch(input, {
      ...init,
      headers
    });

    if (response.status !== 401 || attempt > 0) {
      return response;
    }
  }

  return response as Response;
}

export function isDriveAccessTokenStale(savedAt: string) {
  if (!savedAt) {
    return false;
  }

  const parsed = new Date(savedAt);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const ageMs = Date.now() - parsed.getTime();
  return ageMs >= 45 * 60 * 1000;
}

export async function readDriveSessionStatus() {
  const response = await firebaseAuthorizedFetch("/api/drive/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      connected: false,
      savedAt: ""
    };
  }

  return (await response.json()) as {
    connected: boolean;
    savedAt: string;
  };
}

export async function createDriveSession(accessToken: string) {
  const response = await firebaseAuthorizedFetch("/api/drive/session", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ accessToken })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Google Drive 連携に失敗しました。");
  }

  return (await response.json()) as {
    connected: boolean;
    savedAt: string;
  };
}

export async function clearDriveSession() {
  await fetch("/api/drive/session", {
    method: "DELETE",
    credentials: "same-origin"
  });
}

export function readDriveFolderId(storage: Storage) {
  return storage.getItem(DRIVE_FOLDER_ID_KEY) ?? "";
}

export function saveDriveFolderId(storage: Storage, value: string) {
  const normalized = normalizeDriveFolderInput(value);

  if (!normalized) {
    storage.removeItem(DRIVE_FOLDER_ID_KEY);
    return "";
  }

  storage.setItem(DRIVE_FOLDER_ID_KEY, normalized);
  return normalized;
}

export function clearDriveFolderId(storage: Storage) {
  storage.removeItem(DRIVE_FOLDER_ID_KEY);
}

export function normalizeDriveFolderInput(value: string) {
  const input = value.trim();

  if (!input) {
    return "";
  }

  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);

  if (folderMatch) {
    return folderMatch[1];
  }

  const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  if (idMatch) {
    return idMatch[1];
  }

  return input;
}

type UploadLocalImageToDriveOptions = {
  folderId: string;
  image: LiveEntryImage;
  onStatus?(message: string): void;
};

export async function uploadLocalImageToDrive({
  folderId,
  image,
  onStatus
}: UploadLocalImageToDriveOptions) {
  onStatus?.("Google Drive のアップロードを準備しています...");
  const blob = dataUrlToBlob(image.src);

  if (!ALLOWED_IMAGE_MIME_TYPES.has(blob.type)) {
    throw new Error("Google Drive に保存できる画像形式は JPEG / PNG / WebP / GIF です。");
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("画像データが大きすぎます。8MB以下の画像で試してください。");
  }

  const response = await firebaseAuthorizedFetch("/api/drive/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      folderId,
      caption: image.caption,
      mimeType: blob.type,
      byteLength: blob.size
    })
  });

  const payload = (await response.json().catch(() => null)) as
    | { uploadUrl?: string; message?: string }
    | null;

  if (!response.ok || !payload?.uploadUrl) {
    throw new Error(payload?.message ?? "Google Drive への画像保存に失敗しました。");
  }

  onStatus?.("Google Drive に画像を保存しています...");
  const uploadResponse = await fetch(payload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": blob.type
    },
    body: blob
  });
  const driveFile = (await uploadResponse.json().catch(() => null)) as
    | {
        id?: string;
        webViewLink?: string;
        thumbnailLink?: string;
        error?: { message?: string };
      }
    | null;

  if (!uploadResponse.ok || !driveFile?.id) {
    throw new Error(
      driveFile?.error?.message
        ? `Google Drive 保存に失敗しました: ${driveFile.error.message}`
        : "Google Drive への画像保存に失敗しました。もう一度試してください。"
    );
  }

  const driveWebUrl = driveFile.webViewLink ?? `https://drive.google.com/file/d/${driveFile.id}/view`;
  const driveThumbnailUrl =
    driveFile.thumbnailLink ?? `https://drive.google.com/thumbnail?id=${driveFile.id}&sz=w1600`;

  return {
    ...image,
    src: driveThumbnailUrl,
    storageStatus: "cloud" as const,
    uploadError: undefined,
    driveFileId: driveFile.id,
    driveWebUrl,
    driveThumbnailUrl
  };
}

export async function deleteDriveImage(fileId: string) {
  const response = await firebaseAuthorizedFetch("/api/drive/delete", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fileId })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Google Drive 画像の削除に失敗しました。");
  }
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);

  if (!match) {
    throw new Error("画像データの形式が不正です。");
  }

  const [, rawMimeType, base64] = match;

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error("画像データの形式が不正です。");
  }

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: rawMimeType.toLowerCase() });
  } catch {
    throw new Error("画像データの形式が不正です。");
  }
}
