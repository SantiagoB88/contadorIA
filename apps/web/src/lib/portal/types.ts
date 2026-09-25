/**
 * Domain types for the client portal (obligations, payments, receipts,
 * documents, messages). None of this is backed by the real API yet — see
 * mock-service.ts. Amounts are integer minor units (centavos), same
 * convention as the real invoicing domain, so `formatMoney()` works unchanged.
 */

export type PortalStatus =
  | 'PENDING'
  | 'DUE_SOON'
  | 'OVERDUE'
  | 'PAID'
  | 'IN_PROCESS'
  | 'ACTION_REQUIRED'
  | 'ANSWERED'
  | 'CLOSED';

export interface Obligation {
  id: string;
  concept: string;
  agency: string;
  period: string;
  dueDate: string;
  amount: number;
  currency: string;
  status: PortalStatus;
  paidAt: string | null;
  receiptId: string | null;
}

export interface Payment {
  id: string;
  concept: string;
  period: string;
  date: string;
  amount: number;
  currency: string;
  status: PortalStatus;
  receiptId: string | null;
}

export type ReceiptType = 'OBLIGATION_PAYMENT' | 'OTHER';

export interface Receipt {
  id: string;
  concept: string;
  period: string;
  date: string;
  type: ReceiptType;
}

export type DocumentCategory =
  | 'IMPUESTOS'
  | 'DECLARACIONES_JURADAS'
  | 'COMPROBANTES_PAGO'
  | 'FACTURACION'
  | 'SUELDOS'
  | 'BANCOS'
  | 'OTROS';

export type DocumentSource = 'CLIENT' | 'STUDIO';

export interface PortalDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  source: DocumentSource;
  uploadedAt: string;
  sizeLabel: string;
}

export type AttentionCtaType = 'UPLOAD_DOCUMENT' | 'VIEW_OBLIGATION' | 'PAY' | 'REPLY';
export type AttentionIcon = 'document' | 'obligation' | 'payment' | 'message';

export interface AttentionItem {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  icon: AttentionIcon;
  cta: { type: AttentionCtaType; label: string; href?: string; obligationId?: string };
}

export interface ConsultationMessage {
  id: string;
  author: 'CLIENT' | 'STUDIO';
  text: string;
  sentAt: string;
}

export interface Consultation {
  id: string;
  subject: string;
  status: PortalStatus;
  updatedAt: string;
  messages: ConsultationMessage[];
}

export interface MonthSummary {
  totalDue: number;
  totalDueCount: number;
  nextObligation: Obligation | null;
  paidThisMonth: number;
  paidThisMonthCount: number;
  attentionCount: number;
}
