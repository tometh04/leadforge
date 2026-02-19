import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deshabilitar Turbopack en producción — causa MIDDLEWARE_INVOCATION_FAILED en Vercel
  experimental: {},
};

export default nextConfig;
