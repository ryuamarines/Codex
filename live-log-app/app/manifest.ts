import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Live Log",
    short_name: "Live Log",
    description: "ライブ体験を後から辿るための個人アーカイブ",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f3eb",
    theme_color: "#a34d2d",
    lang: "ja",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/maskable-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
