import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "おうちメンテ",
    short_name: "おうちメンテ",
    description: "住まいと家電のお手入れを、ひとつに。",
    id: "/",
    start_url: "/",
    scope: "/",
    lang: "ja",
    icons: [{ src: "/icons/ivory-v1/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/ivory-v1/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/ivory-v1/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
  };
}
