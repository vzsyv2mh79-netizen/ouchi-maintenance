import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "おうちメンテ",
  description: "住まいと家電のお手入れを、ひとつに。",
  applicationName: "おうちメンテ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "おうちメンテ", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f4f5f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
