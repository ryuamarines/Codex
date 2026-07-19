import { cookies } from "next/headers";

const COOKIE_PREFIX = process.env.NODE_ENV === "production" ? "__Host-" : "";
const DRIVE_ACCESS_TOKEN_COOKIE = `${COOKIE_PREFIX}live-log-drive-access-token`;
const DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE = `${COOKIE_PREFIX}live-log-drive-access-token-saved-at`;
const DRIVE_USER_ID_COOKIE = `${COOKIE_PREFIX}live-log-drive-user-id`;
const LEGACY_COOKIE_NAMES = [
  "live-log-drive-access-token",
  "live-log-drive-access-token-saved-at",
  "live-log-drive-user-id"
];

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/"
  };
}

export async function readDriveSession(expectedUserId: string) {
  const cookieStore = await cookies();
  const userId = cookieStore.get(DRIVE_USER_ID_COOKIE)?.value ?? "";
  const accessToken = cookieStore.get(DRIVE_ACCESS_TOKEN_COOKIE)?.value ?? "";
  const savedAt = cookieStore.get(DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE)?.value ?? "";
  const belongsToUser = Boolean(expectedUserId) && userId === expectedUserId;

  return {
    accessToken: belongsToUser ? accessToken : "",
    savedAt: belongsToUser ? savedAt : "",
    connected: belongsToUser && Boolean(accessToken)
  };
}

export async function writeDriveSession(accessToken: string, userId: string) {
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
  cookieStore.set(DRIVE_USER_ID_COOKIE, userId, {
    ...baseCookieOptions(),
    maxAge: 60 * 60
  });

  return { savedAt };
}

export async function clearDriveSession() {
  const cookieStore = await cookies();
  cookieStore.set(DRIVE_ACCESS_TOKEN_COOKIE, "", {
    ...baseCookieOptions(),
    maxAge: 0
  });
  cookieStore.set(DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE, "", {
    ...baseCookieOptions(),
    maxAge: 0
  });
  cookieStore.set(DRIVE_USER_ID_COOKIE, "", {
    ...baseCookieOptions(),
    maxAge: 0
  });

  for (const name of LEGACY_COOKIE_NAMES) {
    if (name === DRIVE_ACCESS_TOKEN_COOKIE || name === DRIVE_ACCESS_TOKEN_SAVED_AT_COOKIE || name === DRIVE_USER_ID_COOKIE) {
      continue;
    }

    cookieStore.set(name, "", {
      ...baseCookieOptions(),
      maxAge: 0
    });
  }
}
