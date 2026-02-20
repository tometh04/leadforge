import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deshabilitar Turbopack en producción — causa MIDDLEWARE_INVOCATION_FAILED en Vercel
  experimental: {},
  serverExternalPackages: ['@whiskeysockets/baileys'],
};

export default nextConfig;
