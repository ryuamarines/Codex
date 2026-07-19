import { verify } from "node:crypto";

const FIREBASE_CERTIFICATES_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const MAX_TOKEN_LENGTH = 16_384;
const CLOCK_SKEW_SECONDS = 300;
const DEFAULT_CERTIFICATE_TTL_MS = 60 * 60 * 1000;

type FirebaseTokenHeader = {
  alg?: unknown;
  kid?: unknown;
};

export type FirebaseTokenClaims = {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  auth_time?: unknown;
  user_id?: unknown;
};

type CertificateCache = {
  expiresAt: number;
  certificates: Record<string, string>;
};

let certificateCache: CertificateCache | null = null;

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  const token = match?.[1] ?? "";

  return token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : "";
}

function decodeJsonSegment<T>(segment: string): T | null {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function readCertificateTtl(response: Response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAge = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1];
  const parsedMaxAge = Number(maxAge);

  return Number.isFinite(parsedMaxAge) && parsedMaxAge > 0
    ? parsedMaxAge * 1000
    : DEFAULT_CERTIFICATE_TTL_MS;
}

async function fetchCertificates(forceRefresh = false) {
  if (!forceRefresh && certificateCache && certificateCache.expiresAt > Date.now()) {
    return certificateCache.certificates;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(FIREBASE_CERTIFICATES_URL, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Firebase certificate request failed: ${response.status}`);
    }

    const certificates = (await response.json()) as Record<string, string>;
    certificateCache = {
      certificates,
      expiresAt: Date.now() + readCertificateTtl(response)
    };
    return certificates;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function validateFirebaseTokenClaims(
  claims: FirebaseTokenClaims,
  projectId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== "string" ||
    claims.sub.length === 0 ||
    claims.sub.length > 128 ||
    typeof claims.exp !== "number" ||
    claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS ||
    typeof claims.iat !== "number" ||
    claims.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    typeof claims.auth_time !== "number" ||
    claims.auth_time > nowSeconds + CLOCK_SKEW_SECONDS ||
    (typeof claims.user_id === "string" && claims.user_id !== claims.sub)
  ) {
    return null;
  }

  return claims.sub;
}

export async function verifyFirebaseRequest(request: Request) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  const token = readBearerToken(request);

  if (!projectId || !token) {
    return null;
  }

  const segments = token.split(".");

  if (segments.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment<FirebaseTokenHeader>(encodedHeader);
  const claims = decodeJsonSegment<FirebaseTokenClaims>(encodedPayload);

  if (
    !header ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    header.kid.length === 0 ||
    header.kid.length > 200 ||
    !claims
  ) {
    return null;
  }

  try {
    let certificates = await fetchCertificates();
    let certificate = certificates[header.kid];

    if (!certificate) {
      certificates = await fetchCertificates(true);
      certificate = certificates[header.kid];
    }

    if (!certificate) {
      return null;
    }

    const signature = Buffer.from(encodedSignature, "base64url");
    const isSignatureValid = verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      certificate,
      signature
    );

    if (!isSignatureValid) {
      return null;
    }

    const uid = validateFirebaseTokenClaims(claims, projectId);
    return uid ? { uid } : null;
  } catch {
    return null;
  }
}
