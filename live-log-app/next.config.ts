import type { NextConfig } from "next";

const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()"
  }
];

const firebaseAuthHeaders = securityHeaders.filter((header) => header.key !== "X-Frame-Options");

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: "/__/auth/:path*",
        headers: firebaseAuthHeaders
      },
      {
        source: "/((?!__/auth(?:/|$)).*)",
        headers: securityHeaders
      }
    ];
  },
  async rewrites() {
    if (!firebaseProjectId) {
      return [];
    }

    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseProjectId}.firebaseapp.com/__/auth/:path*`
      }
    ];
  }
};

export default nextConfig;
