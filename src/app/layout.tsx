import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  preload: false,
});

export const metadata: Metadata = {
  title: "病院のサイバー問診アシスタント",
  description: "その「はい」、本当に大丈夫？ サイバーセキュリティ対策を、質問に答えながらもう一度確かめる",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${notoSansJp.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
