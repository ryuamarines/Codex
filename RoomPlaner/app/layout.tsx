import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoomPlaner",
  description: "RoomPlaner は間取り画像を下敷きにしながら、壁・窓・扉・家具の干渉を確認できる2Dレイアウトアプリです"
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
