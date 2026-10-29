import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No hay ESLint configurado todavía; los tipos se validan con `npm run typecheck`.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // Permite compilar en otra carpeta (NEXT_DIST_DIR) sin pisar la de `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Adjuntos: hasta 3 archivos de 10 MB por envío (el servidor vuelve a validar tamaño, tipo y contenido).
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
  // Vercel acepta hasta 4,5 MB por envío: ahí el límite es 4 MB en total. Se fija al compilar y lo ven servidor y pantallas.
  env: {
    NEXT_PUBLIC_MAX_FILE_MB: process.env.VERCEL ? "4" : "10",
    NEXT_PUBLIC_MAX_UPLOAD_MB: process.env.VERCEL ? "4" : "30",
  },
  // Demo en Vercel: la base y los archivos de ejemplo viajan dentro del deploy (ver scripts/vercel-prepare.mjs).
  outputFileTracingIncludes: { "/**": ["./prisma/demo.db", "./demo-storage/**/*"] },
};

export default nextConfig;
