import type { LiveEntryImage } from "@/lib/types";

export const DRIVE_FOLDER_ID_KEY = "live-log-drive-folder-id";

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
  const response = await fetch("/api/drive/session", {
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
  const response = await fetch("/api/drive/session", {
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
  onStatus?.("Google Drive に画像を保存しています...");

  const response = await fetch("/api/drive/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ folderId, image })
  });

  const payload = (await response.json().catch(() => null)) as
    | { image?: LiveEntryImage; message?: string }
    | null;

  if (!response.ok || !payload?.image) {
    throw new Error(payload?.message ?? "Google Drive への画像保存に失敗しました。");
  }

  return payload.image;
}

export async function deleteDriveImage(fileId: string) {
  const response = await fetch("/api/drive/delete", {
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
