import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No hay ESLint configurado todavía; los tipos se validan con `npm run typecheck`.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // Permite compilar en otra carpeta (NEXT_DIST_DIR) sin pisar la de `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
