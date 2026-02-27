import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "いつでも道場くん",
  description: "いつでも道場くん",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
