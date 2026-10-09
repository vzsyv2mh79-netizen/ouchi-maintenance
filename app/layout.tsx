import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { RegisterOffline } from "@/components/install-controls";

export const metadata: Metadata = {
  title: "おうちメンテ",
  description: "住まいと家電のお手入れを、ひとつに。",
  applicationName: "おうちメンテ",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/black-v2/192", apple: "/icons/black-v2/192" },
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
    <html lang="ja" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){var p="system";try{var v=localStorage.getItem("ouchi-theme");if(v==="light"||v==="dark")p=v}catch(e){}document.documentElement.dataset.themePreference=p;document.documentElement.dataset.theme=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"})()` }} /></head>
      <body><ThemeProvider><RegisterOffline />{children}</ThemeProvider></body>
    </html>
  );
}
