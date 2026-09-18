import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { IdempotencyKeyRepository } from '../../common/idempotency/idempotency-key.repository';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceRepository } from './invoice.repository';
import { INVOICE_PROVIDER } from './providers/invoice-provider.interface';
import { MockInvoiceProvider } from './providers/mock-invoice-provider';

@Module({
  imports: [MembershipsModule, CustomersModule, ProductsModule, OrganizationsModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceRepository,
    IdempotencyKeyRepository,
    IdempotencyInterceptor,
    MockInvoiceProvider,
    // Fase 5 wires the mock; swapping to ArcaInvoiceProvider later is a
    // one-line change here — nothing else in the module knows the difference.
    { provide: INVOICE_PROVIDER, useExisting: MockInvoiceProvider },
  ],
})
export class InvoicesModule {}
