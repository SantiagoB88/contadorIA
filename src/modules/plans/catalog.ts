// Módulos que un plan de suscripción puede incluir. Inicio y Mi perfil están siempre.
// Sin dependencias del servidor: lo usan también el menú y los formularios.

export const MODULES = {
  MOVIMIENTOS: { label: "Movimientos", desc: "Ingresos del período y facturación acumulada", href: "/dashboard/movimientos" },
  CATEGORIA: { label: "Categoría", desc: "Categoría registrada, margen y sugerencia orientativa", href: "/dashboard/categoria" },
  DEUDAS: { label: "Deudas y vencimientos", desc: "Obligaciones y revisión de deuda del estudio", href: "/dashboard/deudas" },
  FACTURACION: { label: "Facturación", desc: "Hacer facturas, receptores y recurrentes", href: "/facturas" },
  DOCUMENTOS: { label: "Documentos", desc: "Constancias y archivos que comparte el estudio", href: "/documentos" },
  SOLICITUDES: { label: "Solicitudes al estudio", desc: "Consultas y pedidos con archivos", href: "/solicitudes" },
  WHATSAPP: { label: "Asistente de WhatsApp", desc: "Consultar y pedir cosas por WhatsApp", href: null },
} as const;

export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export const isModuleKey = (v: string): v is ModuleKey => (MODULE_KEYS as string[]).includes(v);

/** Lee la lista guardada en la base (JSON). Ignora claves desconocidas. */
export function parseModules(json: string): ModuleKey[] {
  try {
    const list = JSON.parse(json);
    return Array.isArray(list) ? MODULE_KEYS.filter((k) => list.includes(k)) : [];
  } catch {
    return [];
  }
}

/** Módulo que corresponde a una ruta de la web (para el menú). */
export function moduleForPath(path: string): ModuleKey | null {
  for (const key of MODULE_KEYS) {
    const href = MODULES[key].href;
    if (href && (path === href || path.startsWith(`${href}/`))) return key;
  }
  return null;
}
