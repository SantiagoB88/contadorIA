import {
  MOCK_ATTENTION_ITEMS,
  MOCK_CONSULTATIONS,
  MOCK_DOCUMENTS,
  MOCK_OBLIGATIONS,
  MOCK_PAYMENTS,
  MOCK_RECEIPTS,
} from './mock-data';
import { deriveStatus, toIsoDate } from './status';
import type {
  AttentionItem,
  Consultation,
  ConsultationMessage,
  DocumentCategory,
  Obligation,
  Payment,
  PortalDocument,
  PortalStatus,
  Receipt,
} from './types';

/**
 * Stand-in for a real API client. Every call has a small artificial delay so
 * the UI exercises real loading states, and returns fresh copies so callers
 * can't mutate the shared mock dataset by accident. `documents` and
 * `consultations` are mutable module state (session-only) so uploads and
 * replies feel real without a backend — see uploadDocument/sendMessage.
 */
const LATENCY_MS = 350;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function withDerivedStatus<T extends { dueDate: string; status: PortalStatus }>(item: T): T {
  return { ...item, status: deriveStatus(item.dueDate, item.status) };
}

export interface ObligationFilters {
  status?: PortalStatus | 'ALL';
  period?: string | 'ALL';
}

export async function fetchObligations(filters: ObligationFilters = {}): Promise<Obligation[]> {
  let data = MOCK_OBLIGATIONS.map(withDerivedStatus);
  if (filters.status && filters.status !== 'ALL') {
    data = data.filter((o) => o.status === filters.status);
  }
  if (filters.period && filters.period !== 'ALL') {
    data = data.filter((o) => o.period === filters.period);
  }
  return delay(data);
}

export async function fetchPayments(): Promise<Payment[]> {
  return delay([...MOCK_PAYMENTS]);
}

export async function fetchReceipts(): Promise<Receipt[]> {
  return delay([...MOCK_RECEIPTS]);
}

export async function fetchAttentionItems(): Promise<AttentionItem[]> {
  return delay([...MOCK_ATTENTION_ITEMS]);
}

let documents = [...MOCK_DOCUMENTS];

export interface DocumentFilters {
  category?: DocumentCategory | 'ALL';
}

export async function fetchDocuments(filters: DocumentFilters = {}): Promise<PortalDocument[]> {
  let data = documents;
  if (filters.category && filters.category !== 'ALL') {
    data = data.filter((d) => d.category === filters.category);
  }
  return delay([...data]);
}

export async function uploadDocument(input: {
  name: string;
  category: DocumentCategory;
}): Promise<PortalDocument> {
  const doc: PortalDocument = {
    id: `doc-${Date.now()}`,
    name: input.name,
    category: input.category,
    source: 'CLIENT',
    uploadedAt: toIsoDate(new Date()),
    sizeLabel: '—',
  };
  documents = [doc, ...documents];
  return delay(doc);
}

let consultations = [...MOCK_CONSULTATIONS];

export async function fetchConsultations(): Promise<Consultation[]> {
  return delay([...consultations]);
}

export async function createConsultation(input: { subject: string; text: string }): Promise<Consultation> {
  const message: ConsultationMessage = {
    id: `m-${Date.now()}`,
    author: 'CLIENT',
    text: input.text,
    sentAt: toIsoDate(new Date()),
  };
  const consultation: Consultation = {
    id: `c-${Date.now()}`,
    subject: input.subject,
    status: 'PENDING',
    updatedAt: message.sentAt,
    messages: [message],
  };
  consultations = [consultation, ...consultations];
  return delay(consultation);
}

export async function replyToConsultation(consultationId: string, text: string): Promise<Consultation> {
  const message: ConsultationMessage = {
    id: `m-${Date.now()}`,
    author: 'CLIENT',
    text,
    sentAt: toIsoDate(new Date()),
  };
  consultations = consultations.map((c) =>
    c.id === consultationId
      ? { ...c, messages: [...c.messages, message], updatedAt: message.sentAt, status: 'PENDING' }
      : c,
  );
  const updated = consultations.find((c) => c.id === consultationId);
  if (!updated) throw new Error(`Consultation ${consultationId} not found`);
  return delay(updated);
}
