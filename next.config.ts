import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No hay ESLint configurado todavía; los tipos se validan con `npm run typecheck`.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default nextConfig;
