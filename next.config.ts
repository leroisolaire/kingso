import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/documents/[id]/process': ['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default nextConfig;
