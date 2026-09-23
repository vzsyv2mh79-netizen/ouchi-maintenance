import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "おうちメンテ",
    short_name: "おうちメンテ",
    description: "住まいと家電のお手入れを、ひとつに。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
  };
}
