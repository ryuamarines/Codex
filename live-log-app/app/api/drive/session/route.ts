import { NextResponse } from "next/server";
import { clearDriveSession, readDriveSession, writeDriveSession } from "@/lib/server/drive-session";
import { verifyFirebaseRequest } from "@/lib/server/firebase-request-auth";
import { isReasonableAccessToken, rejectCrossOriginRequest } from "@/lib/server/request-security";

export async function GET(request: Request) {
  const user = await verifyFirebaseRequest(request);

  if (!user) {
    return NextResponse.json({ connected: false, savedAt: "" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const session = await readDriveSession(user.uid);
  return NextResponse.json({
    connected: session.connected,
    savedAt: session.savedAt
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginRequest(request);

  if (rejected) {
    return rejected;
  }

  const user = await verifyFirebaseRequest(request);

  if (!user) {
    return NextResponse.json({ message: "Google ログインを確認できませんでした。再ログインしてください。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { accessToken?: string } | null;
  const accessToken = body?.accessToken?.trim() ?? "";

  if (!isReasonableAccessToken(accessToken)) {
    return NextResponse.json({ message: "Drive セッション作成に必要な accessToken がありません。" }, { status: 400 });
  }

  const { savedAt } = await writeDriveSession(accessToken, user.uid);
  return NextResponse.json({ connected: true, savedAt });
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossOriginRequest(request);

  if (rejected) {
    return rejected;
  }

  await clearDriveSession();
  return NextResponse.json({ connected: false });
}
