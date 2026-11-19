import { APP_MODE } from "./constants";
import { usesBundledDemo } from "./vercel-demo";

/**
 * Herramientas abiertas de la demo: la bandeja de correos de prueba (/dev/correos) sin iniciar sesión y la lista de
 * usuarios de ejemplo con su contraseña en Ingresar. Solo en modo DEMO y:
 * - en la demo de Vercel (datos de ejemplo, pública a propósito);
 * - en la compu (`npm run dev`);
 * - o con PUBLIC_DEMO_TOOLS=1 (pruebas automáticas sobre la versión compilada).
 * En un servidor propio (por ejemplo, el piloto en el VPS) quedan cerradas: ahí hay datos y números reales, y en esa
 * bandeja hay enlaces para confirmar correos y recuperar contraseñas. /dev/correos lo ve solo un administrador.
 */
export function publicDemoTools(): boolean {
  if (APP_MODE !== "DEMO") return false;
  return usesBundledDemo || process.env.NODE_ENV !== "production" || process.env.PUBLIC_DEMO_TOOLS === "1";
}
