import { NextResponse } from "next/server";
import { clearDriveSession, readDriveSession, writeDriveSession } from "@/lib/server/drive-session";
import { isReasonableAccessToken, rejectCrossOriginRequest } from "@/lib/server/request-security";

export async function GET() {
  const session = await readDriveSession();
  return NextResponse.json({
    connected: session.connected,
    savedAt: session.savedAt
  });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginRequest(request);

  if (rejected) {
    return rejected;
  }

  const body = (await request.json().catch(() => null)) as { accessToken?: string } | null;
  const accessToken = body?.accessToken?.trim() ?? "";

  if (!isReasonableAccessToken(accessToken)) {
    return NextResponse.json({ message: "Drive セッション作成に必要な accessToken がありません。" }, { status: 400 });
  }

  const { savedAt } = await writeDriveSession(accessToken);
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
