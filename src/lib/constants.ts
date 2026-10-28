export const ROLES = { ADMIN: "ADMIN", CLIENTE: "CLIENTE" } as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ACCESS_STATUS = { APROBADO: "APROBADO", REVOCADO: "REVOCADO" } as const;

export const REQUEST_STATUS = { PENDIENTE: "PENDIENTE", APROBADO: "APROBADO", RECHAZADO: "RECHAZADO" } as const;

export const TOKEN_TYPE = { VERIFICAR_CORREO: "VERIFICAR_CORREO", RESTABLECER_CLAVE: "RESTABLECER_CLAVE" } as const;

export const INVOICE_STATUS = {
  VERIFICADO: "VERIFICADO",
  BORRADOR: "BORRADOR",
  EN_PROCESO: "EN_PROCESO",
  SIMULADO: "SIMULADO",
  RECHAZADO: "RECHAZADO",
} as const;

// Solo estos estados suman en los indicadores. Borradores, en proceso y rechazos quedan fuera.
// SIMULADO solo existe en el ambiente DEMO y las consultas siempre filtran por ambiente: nunca se mezcla con datos reales.
export const COUNTED_INVOICE_STATUSES: string[] = [INVOICE_STATUS.VERIFICADO, INVOICE_STATUS.SIMULADO];

export const INVOICE_SOURCE = {
  DATOS_FICTICIOS: "DATOS_FICTICIOS",
  CARGA_MANUAL: "CARGA_MANUAL",
  FACTURADOR: "FACTURADOR",
} as const;

export const SOURCE_LABEL: Record<string, string> = {
  DATOS_FICTICIOS: "Datos ficticios de demo",
  CARGA_MANUAL: "Cargado por el estudio",
  FACTURADOR: "Facturador (simulación)",
};

export const STATUS_LABEL: Record<string, string> = {
  VERIFICADO: "Verificado",
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  SIMULADO: "Emitida (simulación)",
  RECHAZADO: "Rechazada",
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  CUIT: "CUIT",
  DNI: "DNI",
  SIN_IDENTIFICAR: "Sin identificar",
};

export const TAX_CONDITION_LABEL: Record<string, string> = {
  CONSUMIDOR_FINAL: "Consumidor final",
  RESPONSABLE_INSCRIPTO: "Responsable inscripto",
  MONOTRIBUTO: "Monotributista",
  EXENTO: "Exento",
};

export const DEMO_POINT_OF_SALE = 1;
export const MONOTRIBUTO_INVOICE_TYPE = "C";

export const APP_MODE = process.env.APP_MODE ?? "DEMO";

export const SESSION_COOKIE = "cs_session";
export const SESSION_DAYS = 7;

// Categorías del monotributo que admite la escala (los límites salen de cada versión de escala).
export const CATEGORY_CODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

export const SCALE_STATUS = { DEMO: "DEMO", VALIDADA: "VALIDADA" } as const;

export const OBLIGATION_STATUS = {
  PENDIENTE: "PENDIENTE",
  PAGO_INFORMADO: "PAGO_INFORMADO",
  PAGO_VERIFICADO: "PAGO_VERIFICADO",
  ANULADA: "ANULADA",
} as const;

export const OBLIGATION_STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  PAGO_INFORMADO: "Pago informado (sin verificar)",
  PAGO_VERIFICADO: "Pago verificado por el estudio",
  ANULADA: "Anulada",
};

export const DEBT_REVIEW_STATUS = { REVISADA: "REVISADA", PENDIENTE_REVISION: "PENDIENTE_REVISION" } as const;

export const STUDY_SOURCE = "Cargado por el estudio";
