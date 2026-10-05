import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: { "/api/manual-suggestions": ["./.manual-assets/**/*"] },
};

export default nextConfig;
