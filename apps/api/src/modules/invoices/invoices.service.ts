import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateInvoiceRequest,
  Invoice,
  InvoiceDetail,
  InvoiceItemInput,
  InvoiceListQuery,
  OrgRole,
  Paginated,
} from '@dashgobo/contracts';
import { buildPaginationMeta, roleHasPermission } from '@dashgobo/contracts';
import {
  CustomerNotFoundError,
  ForbiddenError,
  InvalidInvoiceStateError,
  InvoiceAlreadyAuthorizedError,
  InvoiceNotFoundError,
  InvoiceProviderError,
  ProductNotFoundError,
} from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { CustomerRepository } from '../customers/customer.repository';
import { ProductRepository } from '../products/product.repository';
import { OrganizationRepository } from '../organizations/organization.repository';
import { computeInvoiceTotals, type ResolvedInvoiceItem } from './domain/invoice-calculator';
import { canTransition } from './domain/invoice-state-machine';
import { InvoiceRepository } from './invoice.repository';
import { toInvoiceDetailDto, toInvoiceDto } from './invoice.mapper';
import { INVOICE_PROVIDER, type InvoiceProvider } from './providers/invoice-provider.interface';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly repo: InvoiceRepository,
    private readonly customers: CustomerRepository,
    private readonly products: ProductRepository,
    private readonly organizations: OrganizationRepository,
    @Inject(INVOICE_PROVIDER) private readonly provider: InvoiceProvider,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: InvoiceListQuery): Promise<Paginated<Invoice>> {
    const { data, totalItems } = await this.repo.list(organizationId, query);
    return {
      data: data.map(toInvoiceDto),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async getById(organizationId: string, id: string): Promise<InvoiceDetail> {
    const row = await this.repo.findById(organizationId, id);
    if (!row) throw new InvoiceNotFoundError(id);
    return toInvoiceDetailDto(row);
  }

  async create(
    organizationId: string,
    userId: string,
    role: OrgRole,
    dto: CreateInvoiceRequest,
  ): Promise<InvoiceDetail> {
    const customer = await this.customers.findById(organizationId, dto.customerId);
    if (!customer) throw new CustomerNotFoundError(dto.customerId);

    const canOverridePrice = roleHasPermission(role, 'invoice:override_price');
    const resolvedItems: ResolvedInvoiceItem[] = [];
    for (const itemInput of dto.items) {
      resolvedItems.push(await this.resolveItem(organizationId, itemInput, canOverridePrice));
    }

    const computed = computeInvoiceTotals(resolvedItems);
    const currency = dto.currency ?? (await this.resolveDefaultCurrency(organizationId));

    const row = await this.repo.createDraft(organizationId, {
      customerId: dto.customerId,
      invoiceType: dto.invoiceType,
      pointOfSale: dto.pointOfSale,
      currency,
      notes: dto.notes,
      computed,
    });

    await this.audit.record({
      action: 'CREATE_INVOICE',
      entity: 'Invoice',
      entityId: row.id,
      organizationId,
      userId,
      metadata: { total: computed.total.toString(), items: resolvedItems.length },
    });

    return toInvoiceDetailDto(row);
  }

  async authorize(organizationId: string, userId: string, id: string): Promise<InvoiceDetail> {
    const invoice = await this.repo.findById(organizationId, id);
    if (!invoice) throw new InvoiceNotFoundError(id);

    if (invoice.status === 'AUTHORIZED' || invoice.status === 'PAID') {
      throw new InvoiceAlreadyAuthorizedError(id);
    }
    if (!canTransition(invoice.status, 'PENDING')) {
      throw new InvalidInvoiceStateError(invoice.status, 'AUTHORIZED');
    }

    const claimed = await this.repo.markPending(id, invoice.status);
    if (!claimed) {
      // Lost a race with a concurrent authorize call on the same invoice.
      throw new InvoiceAlreadyAuthorizedError(id);
    }

    // Looked up ignoring soft-delete: the customer may have been deactivated
    // after the draft was created, which must not block authorizing it.
    const customer = await this.customers.findAny(organizationId, invoice.customerId);
    if (!customer) throw new CustomerNotFoundError(invoice.customerId);

    try {
      const result = await this.provider.authorizeInvoice({
        organizationId,
        invoiceType: invoice.invoiceType,
        pointOfSale: invoice.pointOfSale,
        subtotal: invoice.subtotal,
        taxes: invoice.taxes,
        total: invoice.total,
        currency: invoice.currency,
        customerDocumentType: customer.documentType,
        customerDocumentNumber: customer.documentNumber,
      });

      const authorized = await this.repo.markAuthorized(id, result);
      await this.audit.record({
        action: 'AUTHORIZE_INVOICE',
        entity: 'Invoice',
        entityId: id,
        organizationId,
        userId,
        metadata: { invoiceNumber: result.invoiceNumber, cae: result.cae },
      });
      return toInvoiceDetailDto(authorized);
    } catch (err) {
      await this.repo.markError(id);
      throw new InvoiceProviderError('The invoice provider failed to authorize this invoice', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async resolveItem(
    organizationId: string,
    input: InvoiceItemInput,
    canOverridePrice: boolean,
  ): Promise<ResolvedInvoiceItem> {
    if (!input.productId) {
      // Schema guarantees description/unitPrice/taxRate are present here.
      if (!canOverridePrice) {
        throw new ForbiddenError('Your role cannot add a manually priced item to an invoice');
      }
      return {
        productId: null,
        description: input.description as string,
        quantity: input.quantity,
        unitPrice: BigInt(input.unitPrice as number),
        taxRate: input.taxRate as number,
      };
    }

    const product = await this.products.findById(organizationId, input.productId);
    if (!product) throw new ProductNotFoundError(input.productId);

    const catalogUnitPrice = product.unitPrice;
    const catalogTaxRate = product.taxRate.toNumber();

    const unitPrice = input.unitPrice !== undefined ? BigInt(input.unitPrice) : catalogUnitPrice;
    if (unitPrice !== catalogUnitPrice && !canOverridePrice) {
      throw new ForbiddenError(`Your role cannot override the price of "${product.name}"`);
    }

    const taxRate = input.taxRate ?? catalogTaxRate;
    if (taxRate !== catalogTaxRate && !canOverridePrice) {
      throw new ForbiddenError(`Your role cannot override the tax rate of "${product.name}"`);
    }

    return {
      productId: product.id,
      description: input.description ?? product.name,
      quantity: input.quantity,
      unitPrice,
      taxRate,
    };
  }

  private async resolveDefaultCurrency(organizationId: string): Promise<string> {
    const organization = await this.organizations.findById(organizationId);
    return organization?.defaultCurrency ?? 'ARS';
  }
}
