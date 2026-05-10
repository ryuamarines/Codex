import { NextResponse } from "next/server";

const GOOGLE_DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_ACCESS_TOKEN_LENGTH = 4096;

export function rejectCrossOriginRequest(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return null;
  }

  let requestOrigin = "";

  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return NextResponse.json({ message: "不正なリクエストです。ページを再読み込みしてください。" }, { status: 403 });
  }

  if (origin !== requestOrigin) {
    return NextResponse.json({ message: "不正なリクエストです。ページを再読み込みしてください。" }, { status: 403 });
  }

  return null;
}

export function isSafeGoogleDriveId(value: string) {
  return GOOGLE_DRIVE_ID_PATTERN.test(value);
}

export function isReasonableAccessToken(value: string) {
  return value.length > 0 && value.length <= MAX_ACCESS_TOKEN_LENGTH && !/[\s]/.test(value);
}
