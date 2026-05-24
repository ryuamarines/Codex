import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = process.env.NEXT_PUBLIC_CANONICAL_HOST ?? "live-log-web.vercel.app";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  const isLocalHost = host === "localhost" || host === "127.0.0.1";

  if (!host || isLocalHost || host === CANONICAL_HOST || !host.endsWith(".vercel.app")) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.protocol = "https";
  url.hostname = CANONICAL_HOST;
  url.port = "";

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon.svg|icon.svg|maskable-icon.svg).*)"]
};
