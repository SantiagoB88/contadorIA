import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { InvoiceType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  AuthorizeInvoiceInput,
  AuthorizeInvoiceResult,
  InvoiceProvider,
  ProviderInvoiceRecord,
} from './invoice-provider.interface';

const CAE_EXPIRATION_DAYS = 10;
const AUTHORIZED_STATUSES = ['AUTHORIZED', 'PAID'] as const;

/**
 * Stand-in for ARCA (AFIP electronic invoicing) during the MVP. Numbering is
 * derived from our own DB instead of asking the fiscal authority for the
 * "last CAE" — `ArcaInvoiceProvider` will replace that one call, nothing else
 * in the codebase needs to change.
 */
@Injectable()
export class MockInvoiceProvider implements InvoiceProvider {
  constructor(private readonly prisma: PrismaService) {}

  async authorizeInvoice(input: AuthorizeInvoiceInput): Promise<AuthorizeInvoiceResult> {
    const lastNumber = await this.getLastAuthorizedInvoice(
      input.organizationId,
      input.pointOfSale,
      input.invoiceType,
    );
    const caeExpiration = new Date();
    caeExpiration.setDate(caeExpiration.getDate() + CAE_EXPIRATION_DAYS);

    return {
      invoiceNumber: lastNumber + 1,
      cae: this.generateFakeCae(),
      caeExpiration,
      externalId: `MOCK-${randomUUID()}`,
    };
  }

  async getInvoice(externalId: string): Promise<ProviderInvoiceRecord | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { externalId },
      select: { externalId: true, invoiceNumber: true, cae: true, caeExpiration: true },
    });
    if (!invoice?.externalId || !invoice.invoiceNumber || !invoice.cae || !invoice.caeExpiration) {
      return null;
    }
    return {
      externalId: invoice.externalId,
      invoiceNumber: invoice.invoiceNumber,
      cae: invoice.cae,
      caeExpiration: invoice.caeExpiration,
    };
  }

  async getLastAuthorizedInvoice(
    organizationId: string,
    pointOfSale: number,
    invoiceType: InvoiceType,
  ): Promise<number> {
    const last = await this.prisma.invoice.findFirst({
      where: {
        organizationId,
        pointOfSale,
        invoiceType,
        status: { in: [...AUTHORIZED_STATUSES] },
      },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    return last?.invoiceNumber ?? 0;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- interface is async for real providers
  async validateCredentials(_organizationId: string): Promise<boolean> {
    return true;
  }

  /** 14 numeric digits, matching the shape of a real AFIP CAE — not a valid one. */
  private generateFakeCae(): string {
    let cae = '';
    for (let i = 0; i < 14; i += 1) {
      cae += randomInt(0, 10).toString();
    }
    return cae;
  }
}
