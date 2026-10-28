export const ROLES = { ADMIN: "ADMIN", CLIENTE: "CLIENTE" } as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ACCESS_STATUS = { APROBADO: "APROBADO", REVOCADO: "REVOCADO" } as const;

export const REQUEST_STATUS = { PENDIENTE: "PENDIENTE", APROBADO: "APROBADO", RECHAZADO: "RECHAZADO" } as const;

export const TOKEN_TYPE = { VERIFICAR_CORREO: "VERIFICAR_CORREO", RESTABLECER_CLAVE: "RESTABLECER_CLAVE" } as const;

export const INVOICE_STATUS = { VERIFICADO: "VERIFICADO", BORRADOR: "BORRADOR", RECHAZADO: "RECHAZADO" } as const;

// Solo estos estados suman en los indicadores. Borradores y rechazos quedan fuera.
export const COUNTED_INVOICE_STATUSES: string[] = [INVOICE_STATUS.VERIFICADO];

export const INVOICE_SOURCE = { DATOS_FICTICIOS: "DATOS_FICTICIOS", CARGA_MANUAL: "CARGA_MANUAL" } as const;

export const SOURCE_LABEL: Record<string, string> = {
  DATOS_FICTICIOS: "Datos ficticios de demo",
  CARGA_MANUAL: "Cargado por el estudio",
};

export const STATUS_LABEL: Record<string, string> = {
  VERIFICADO: "Verificado",
  BORRADOR: "Borrador",
  RECHAZADO: "Rechazado",
};

export const APP_MODE = process.env.APP_MODE ?? "DEMO";

export const SESSION_COOKIE = "cs_session";
export const SESSION_DAYS = 7;
