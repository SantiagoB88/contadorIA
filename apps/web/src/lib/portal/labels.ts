import type { DocumentCategory } from './types';

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  IMPUESTOS: 'Impuestos',
  DECLARACIONES_JURADAS: 'Declaraciones juradas',
  COMPROBANTES_PAGO: 'Comprobantes de pago',
  FACTURACION: 'Facturación',
  SUELDOS: 'Sueldos',
  BANCOS: 'Bancos',
  OTROS: 'Otros',
};

export const DOCUMENT_CATEGORY_OPTIONS = Object.entries(DOCUMENT_CATEGORY_LABELS) as [
  DocumentCategory,
  string,
][];
