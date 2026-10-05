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
    icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" }],
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
  };
}
