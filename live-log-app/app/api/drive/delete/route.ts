import { NextResponse } from "next/server";
import { readDriveSession } from "@/lib/server/drive-session";

export async function POST(request: Request) {
  const session = await readDriveSession();

  if (!session.accessToken) {
    return NextResponse.json(
      { message: "Google Drive 連携がありません。Drive連携を更新してください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as { fileId?: string } | null;
  const fileId = body?.fileId?.trim() ?? "";

  if (!fileId) {
    return NextResponse.json({ message: "削除対象の Drive ファイル ID がありません。" }, { status: 400 });
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });

  if (!response.ok) {
    return NextResponse.json({ message: await readDriveErrorMessage(response) }, { status: response.status });
  }

  return NextResponse.json({ ok: true });
}

async function readDriveErrorMessage(response: Response) {
  if (response.status === 401) {
    return "Google Drive 連携が切れています。Drive連携更新を押して、もう一度連携してください。";
  }

  if (response.status === 403) {
    return "Google Drive 画像の削除権限がありません。";
  }

  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    if (payload.error?.message) {
      return `Google Drive 画像の削除に失敗しました: ${payload.error.message}`;
    }
  } catch {
    // ignore
  }

  return "Google Drive 画像の削除に失敗しました。";
}
