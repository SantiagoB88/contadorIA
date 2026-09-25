import { addDays, toIsoDate } from './status';
import type {
  AttentionItem,
  Consultation,
  Obligation,
  Payment,
  PortalDocument,
  Receipt,
} from './types';

const now = new Date();
const iso = (offsetDays: number) => toIsoDate(addDays(now, offsetDays));

/**
 * Due/paid dates are generated relative to "today" (not fixed calendar
 * dates) so the demo always shows a believable mix of overdue / due-soon /
 * pending obligations no matter when it's viewed.
 */
export const MOCK_OBLIGATIONS: Obligation[] = [
  {
    id: 'ob-1',
    concept: 'IVA',
    agency: 'AFIP',
    period: 'Agosto 2026',
    dueDate: iso(2),
    amount: 18_543_000,
    currency: 'ARS',
    status: 'PENDING',
    paidAt: null,
    receiptId: null,
  },
  {
    id: 'ob-2',
    concept: 'Ingresos Brutos',
    agency: 'ARBA',
    period: 'Agosto 2026',
    dueDate: iso(5),
    amount: 8_200_000,
    currency: 'ARS',
    status: 'PENDING',
    paidAt: null,
    receiptId: null,
  },
  {
    id: 'ob-3',
    concept: 'Autónomos',
    agency: 'AFIP',
    period: 'Septiembre 2026',
    dueDate: iso(12),
    amount: 5_800_000,
    currency: 'ARS',
    status: 'PENDING',
    paidAt: null,
    receiptId: null,
  },
  {
    id: 'ob-4',
    concept: 'Cargas Sociales',
    agency: 'AFIP',
    period: 'Agosto 2026',
    dueDate: iso(-3),
    amount: 4_200_000,
    currency: 'ARS',
    status: 'PENDING',
    paidAt: null,
    receiptId: null,
  },
  {
    id: 'ob-5',
    concept: 'Ganancias',
    agency: 'AFIP',
    period: 'Agosto 2026',
    dueDate: iso(20),
    amount: 12_000_000,
    currency: 'ARS',
    status: 'PENDING',
    paidAt: null,
    receiptId: null,
  },
  {
    id: 'ob-6',
    concept: 'IVA',
    agency: 'AFIP',
    period: 'Julio 2026',
    dueDate: iso(-25),
    amount: 17_500_000,
    currency: 'ARS',
    status: 'PAID',
    paidAt: iso(-5),
    receiptId: 'rec-1',
  },
  {
    id: 'ob-7',
    concept: 'Ingresos Brutos',
    agency: 'ARBA',
    period: 'Julio 2026',
    dueDate: iso(-28),
    amount: 8_000_000,
    currency: 'ARS',
    status: 'PAID',
    paidAt: iso(-6),
    receiptId: 'rec-2',
  },
  {
    id: 'ob-8',
    concept: 'Autónomos',
    agency: 'AFIP',
    period: 'Julio 2026',
    dueDate: iso(-15),
    amount: 5_800_000,
    currency: 'ARS',
    status: 'ACTION_REQUIRED',
    paidAt: null,
    receiptId: null,
  },
];

export const MOCK_PAYMENTS: Payment[] = [
  {
    id: 'pay-1',
    concept: 'IVA',
    period: 'Julio 2026',
    date: iso(-5),
    amount: 17_500_000,
    currency: 'ARS',
    status: 'PAID',
    receiptId: 'rec-1',
  },
  {
    id: 'pay-2',
    concept: 'Ingresos Brutos',
    period: 'Julio 2026',
    date: iso(-6),
    amount: 8_000_000,
    currency: 'ARS',
    status: 'PAID',
    receiptId: 'rec-2',
  },
  {
    id: 'pay-3',
    concept: 'Ganancias',
    period: 'Julio 2026',
    date: iso(-1),
    amount: 12_000_000,
    currency: 'ARS',
    status: 'IN_PROCESS',
    receiptId: null,
  },
  {
    id: 'pay-4',
    concept: 'Cargas Sociales',
    period: 'Agosto 2026',
    date: iso(-3),
    amount: 4_200_000,
    currency: 'ARS',
    status: 'OVERDUE',
    receiptId: null,
  },
];

export const MOCK_RECEIPTS: Receipt[] = [
  { id: 'rec-1', concept: 'IVA', period: 'Julio 2026', date: iso(-5), type: 'OBLIGATION_PAYMENT' },
  {
    id: 'rec-2',
    concept: 'Ingresos Brutos',
    period: 'Julio 2026',
    date: iso(-6),
    type: 'OBLIGATION_PAYMENT',
  },
];

export const MOCK_DOCUMENTS: PortalDocument[] = [
  {
    id: 'doc-1',
    name: 'Extracto bancario - Julio 2026.pdf',
    category: 'BANCOS',
    source: 'CLIENT',
    uploadedAt: iso(-10),
    sizeLabel: '1.2 MB',
  },
  {
    id: 'doc-2',
    name: 'Comprobante pago Autónomos - Junio 2026.pdf',
    category: 'COMPROBANTES_PAGO',
    source: 'CLIENT',
    uploadedAt: iso(-9),
    sizeLabel: '340 KB',
  },
  {
    id: 'doc-3',
    name: 'Liquidación IVA - Agosto 2026.pdf',
    category: 'DECLARACIONES_JURADAS',
    source: 'STUDIO',
    uploadedAt: iso(-2),
    sizeLabel: '890 KB',
  },
  {
    id: 'doc-4',
    name: 'Recibos de sueldo - Agosto 2026.pdf',
    category: 'SUELDOS',
    source: 'STUDIO',
    uploadedAt: iso(-3),
    sizeLabel: '2.1 MB',
  },
  {
    id: 'doc-5',
    name: 'Comprobante IVA Julio 2026.pdf',
    category: 'COMPROBANTES_PAGO',
    source: 'STUDIO',
    uploadedAt: iso(-5),
    sizeLabel: '210 KB',
  },
];

export const MOCK_ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: 'att-1',
    title: 'Falta comprobante de pago de Autónomos',
    description: 'Subí el comprobante para que podamos acreditar el pago de julio.',
    dueDate: null,
    icon: 'document',
    cta: { type: 'UPLOAD_DOCUMENT', label: 'Subir documento' },
  },
  {
    id: 'att-2',
    title: 'Necesitamos los extractos bancarios de agosto',
    description: 'Para continuar con la conciliación bancaria del mes.',
    dueDate: iso(5),
    icon: 'document',
    cta: { type: 'UPLOAD_DOCUMENT', label: 'Subir documento' },
  },
  {
    id: 'att-3',
    title: 'Tenés una obligación vencida',
    description: 'Cargas Sociales de agosto venció hace unos días.',
    dueDate: iso(-3),
    icon: 'obligation',
    cta: { type: 'PAY', label: 'Pagar', obligationId: 'ob-4' },
  },
];

export const MOCK_CONSULTATIONS: Consultation[] = [
  {
    id: 'c-1',
    subject: 'Consulta sobre monotributo vs. responsable inscripto',
    status: 'ANSWERED',
    updatedAt: iso(-2),
    messages: [
      { id: 'm-1', author: 'CLIENT', text: '¿Nos conviene pasar a responsable inscripto este año?', sentAt: iso(-3) },
      {
        id: 'm-2',
        author: 'STUDIO',
        text: 'Con la facturación actual todavía no conviene, lo vemos en la próxima revisión trimestral.',
        sentAt: iso(-2),
      },
    ],
  },
  {
    id: 'c-2',
    subject: '¿Cuándo vence la próxima presentación de IIBB?',
    status: 'PENDING',
    updatedAt: iso(-1),
    messages: [{ id: 'm-3', author: 'CLIENT', text: '¿Cuándo vence la próxima presentación de IIBB?', sentAt: iso(-1) }],
  },
];
