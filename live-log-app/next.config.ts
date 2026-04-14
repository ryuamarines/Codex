import path from "node:path";
import type { NextConfig } from "next";

const isStaticHostingBuild = process.env.BUILD_TARGET === "static";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.join(__dirname),
  ...(isStaticHostingBuild
    ? {
        output: "export",
        trailingSlash: false
      }
    : {})
};

export default nextConfig;
