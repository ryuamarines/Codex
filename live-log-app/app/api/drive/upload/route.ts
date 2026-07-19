import { NextResponse } from "next/server";
import { readDriveSession } from "@/lib/server/drive-session";
import { verifyFirebaseRequest } from "@/lib/server/firebase-request-auth";
import { isSafeGoogleDriveId, rejectCrossOriginRequest } from "@/lib/server/request-security";

type UploadRequestBody = {
  folderId?: string;
  caption?: string;
  mimeType?: string;
  byteLength?: number;
};

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const rejected = rejectCrossOriginRequest(request);

  if (rejected) {
    return rejected;
  }

  const user = await verifyFirebaseRequest(request);

  if (!user) {
    return NextResponse.json(
      { message: "Google ログインを確認できませんでした。再ログインしてください。" },
      { status: 401 }
    );
  }

  const session = await readDriveSession(user.uid);

  if (!session.accessToken) {
    return NextResponse.json(
      { message: "Google Drive 連携がありません。Drive連携を更新してください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as UploadRequestBody | null;
  const folderId = body?.folderId?.trim() ?? "";
  const mimeType = body?.mimeType?.trim().toLowerCase() ?? "";
  const byteLength = body?.byteLength ?? 0;

  if (!folderId || !isSafeGoogleDriveId(folderId)) {
    return NextResponse.json(
      { message: "Google Drive の保存先フォルダが未設定です。Drive保存先を設定してください。" },
      { status: 400 }
    );
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { message: "Google Drive に保存できる画像形式は JPEG / PNG / WebP / GIF です。" },
      { status: 415 }
    );
  }

  if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { message: "画像データが大きすぎます。8MB以下の画像で試してください。" },
      { status: 413 }
    );
  }

  try {
    const fileName = sanitizeFileName(body?.caption ?? "image", mimeType);
    const metadata = { name: fileName, parents: [folderId] };

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,thumbnailLink,mimeType",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(byteLength)
        },
        body: JSON.stringify(metadata)
      }
    );

    if (!response.ok) {
      const message = await readDriveErrorMessage(response);
      return NextResponse.json({ message }, { status: response.status });
    }

    const uploadUrl = response.headers.get("location") ?? "";

    if (!isSafeGoogleUploadUrl(uploadUrl)) {
      return NextResponse.json(
        { message: "Google Drive のアップロード先を確認できませんでした。もう一度試してください。" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { uploadUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Google Drive への画像保存に失敗しました。時間を置いて再試行してください。"
      },
      { status: 500 }
    );
  }
}

function sanitizeFileName(value: string, mimeType: string) {
  const base = value.replace(/\.[^.]+$/, "").replace(/\s+/g, "-").replace(/[^\w.-]/g, "") || "image";
  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : "jpg";
  return `${base}.${extension}`;
}

function isSafeGoogleUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.googleapis.com" &&
      url.pathname === "/upload/drive/v3/files" &&
      url.searchParams.get("uploadType") === "resumable" &&
      Boolean(url.searchParams.get("upload_id"))
    );
  } catch {
    return false;
  }
}

async function readDriveErrorMessage(response: Response) {
  if (response.status === 401) {
    return "Google Drive 連携が切れています。ログインと同期で Drive連携更新 を押して、もう一度連携してください。";
  }

  if (response.status === 403) {
    return "Google Drive への保存権限がありません。Drive保存先か権限を確認してください。";
  }

  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    if (payload.error?.message) {
      return `Google Drive 保存に失敗しました: ${payload.error.message}`;
    }
  } catch {
    // ignore
  }

  return "Google Drive への画像保存に失敗しました。時間を置いて再試行してください。";
}
