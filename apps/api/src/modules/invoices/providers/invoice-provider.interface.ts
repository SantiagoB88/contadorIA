import type { InvoiceType } from '@prisma/client';

/**
 * Abstraction over whoever actually authorizes a fiscal invoice. The MVP uses
 * `MockInvoiceProvider`; `ArcaInvoiceProvider` (real AFIP/ARCA integration —
 * certificates, WSAA/WSFE, real CAE) is a drop-in replacement later. Nothing
 * in `InvoicesService` knows which one is wired up — see
 * `docs/architecture.md`.
 */
export interface AuthorizeInvoiceInput {
  organizationId: string;
  invoiceType: InvoiceType;
  pointOfSale: number;
  subtotal: bigint;
  taxes: bigint;
  total: bigint;
  currency: string;
  customerDocumentType: string;
  customerDocumentNumber: string;
}

export interface AuthorizeInvoiceResult {
  invoiceNumber: number;
  cae: string;
  caeExpiration: Date;
  externalId: string;
}

export interface ProviderInvoiceRecord {
  externalId: string;
  invoiceNumber: number;
  cae: string;
  caeExpiration: Date;
}

export const INVOICE_PROVIDER = Symbol('INVOICE_PROVIDER');

export interface InvoiceProvider {
  authorizeInvoice(input: AuthorizeInvoiceInput): Promise<AuthorizeInvoiceResult>;
  getInvoice(externalId: string): Promise<ProviderInvoiceRecord | null>;
  getLastAuthorizedInvoice(
    organizationId: string,
    pointOfSale: number,
    invoiceType: InvoiceType,
  ): Promise<number>;
  validateCredentials(organizationId: string): Promise<boolean>;
}
