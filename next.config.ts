import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    // Clés = motifs picomatch : les crochets de [id] doivent être échappés
    '/api/documents/\\[id\\]/process': ['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default nextConfig;
