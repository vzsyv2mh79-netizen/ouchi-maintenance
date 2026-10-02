import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: { "/api/manual-suggestions": ["./node_modules/pdfjs-dist/cmaps/**/*", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"] },
};

export default nextConfig;
