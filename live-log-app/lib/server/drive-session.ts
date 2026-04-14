import { cookies } from "next/headers";

const DRIVE_ACCESS_TOKEN_COOKIE = "live-log-drive-access-token";
const DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE = "live-log-drive-access-token-saved-at";

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/"
  };
}

export async function readDriveSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(DRIVE_ACCESS_TOKEN_COOKIE)?.value ?? "";
  const savedAt = cookieStore.get(DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE)?.value ?? "";

  return {
    accessToken,
    savedAt,
    connected: Boolean(accessToken)
  };
}

export async function writeDriveSession(accessToken: string) {
  const cookieStore = await cookies();
  const savedAt = new Date().toISOString();

  cookieStore.set(DRIVE_ACCESS_TOKEN_COOKIE, accessToken, {
    ...baseCookieOptions(),
    maxAge: 60 * 60
  });
  cookieStore.set(DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE, savedAt, {
    ...baseCookieOptions(),
    maxAge: 60 * 60
  });

  return { savedAt };
}

export async function clearDriveSession() {
  const cookieStore = await cookies();
  cookieStore.delete(DRIVE_ACCESS_TOKEN_COOKIE);
  cookieStore.delete(DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE);
}
