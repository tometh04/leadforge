import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las vars server-only se leen desde .env.local directamente en los lib/claude/client.ts
  // No es necesario exponerlas aquí
};

export default nextConfig;
