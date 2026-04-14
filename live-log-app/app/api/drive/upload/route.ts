import { NextResponse } from "next/server";
import { createImage } from "@/lib/live-entry-utils";
import type { LiveEntryImage } from "@/lib/types";
import { readDriveSession } from "@/lib/server/drive-session";

type UploadRequestBody = {
  folderId?: string;
  image?: LiveEntryImage;
};

export async function POST(request: Request) {
  const session = await readDriveSession();

  if (!session.accessToken) {
    return NextResponse.json(
      { message: "Google Drive 連携がありません。Drive連携を更新してください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as UploadRequestBody | null;
  const folderId = body?.folderId?.trim() ?? "";
  const image = body?.image;

  if (!folderId) {
    return NextResponse.json(
      { message: "Google Drive の保存先フォルダが未設定です。Drive保存先を設定してください。" },
      { status: 400 }
    );
  }

  if (!image || !image.src?.startsWith("data:")) {
    return NextResponse.json(
      { message: "Drive へ送る元画像データが見つかりませんでした。" },
      { status: 400 }
    );
  }

  try {
    const blob = dataUrlToBlob(image.src);
    const fileName = sanitizeFileName(image.caption ?? "image", blob.type);
    const boundary = `live-log-${Math.random().toString(36).slice(2)}`;
    const metadata = { name: fileName, parents: [folderId] };
    const bodyBuffer = buildMultipartBody(boundary, metadata, blob);

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink,mimeType",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: bodyBuffer
      }
    );

    if (!response.ok) {
      const message = await readDriveErrorMessage(response);
      return NextResponse.json({ message }, { status: response.status });
    }

    const data = (await response.json()) as {
      id: string;
      webViewLink?: string;
      thumbnailLink?: string;
    };

    const driveWebUrl = data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`;
    const driveThumbnailUrl =
      data.thumbnailLink ?? `https://drive.google.com/thumbnail?id=${data.id}&sz=w1600`;

    return NextResponse.json({
      image: {
        ...createImage(driveThumbnailUrl, image.type, image.caption),
        id: image.id,
        driveFileId: data.id,
        driveWebUrl,
        driveThumbnailUrl
      }
    });
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

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);

  if (!match) {
    throw new Error("画像データの形式が不正です。");
  }

  const [, mimeType, base64] = match;
  return {
    type: mimeType,
    buffer: Buffer.from(base64, "base64")
  };
}

function buildMultipartBody(
  boundary: string,
  metadata: { name: string; parents: string[] },
  blob: { type: string; buffer: Buffer }
) {
  const head =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${blob.type || "image/jpeg"}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  return Buffer.concat([Buffer.from(head), blob.buffer, Buffer.from(tail)]);
}

function sanitizeFileName(value: string, mimeType: string) {
  const base = value.replace(/\.[^.]+$/, "").replace(/\s+/g, "-").replace(/[^\w.-]/g, "") || "image";
  const extension = mimeType === "image/png" ? "png" : "jpg";
  return `${base}.${extension}`;
}

async function readDriveErrorMessage(response: Response) {
  if (response.status === 401) {
    return "Google Drive 連携が切れています。Drive連携更新を押して、もう一度連携してください。";
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
