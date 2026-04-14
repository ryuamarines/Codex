import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "対話ログ整理アプリ",
  description: "ChatGPT の会話ログや個人メモをローカルで整理・検索するアプリ"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
