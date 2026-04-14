import type { Metadata } from "next";
import type { Viewport } from "next";
import { CanonicalHostRedirect } from "@/components/canonical-host-redirect";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Log",
  description: "個人用のライブ参加記録アプリ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Live Log",
    statusBarStyle: "default"
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#a34d2d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <CanonicalHostRedirect />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
