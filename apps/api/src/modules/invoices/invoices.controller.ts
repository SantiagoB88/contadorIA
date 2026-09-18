import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createInvoiceRequestSchema,
  invoiceListQuerySchema,
  type CreateInvoiceRequest,
  type Invoice,
  type InvoiceDetail,
  type InvoiceListQuery,
  type Paginated,
} from '@dashgobo/contracts';
import { ZodBody, ZodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentOrg } from '../../common/auth/current-org.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrgScopeGuard } from '../../common/auth/org-scope.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import type { AuthenticatedUser, OrgContext } from '../../common/auth/auth-context';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { InvoicesService } from './invoices.service';

/** Flat resource, tenant resolved from `x-organization-id` — same pattern as `/customers`. */
@ApiTags('invoices')
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('invoices')
@UseGuards(OrgScopeGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermission('invoice:read')
  @ApiOperation({ summary: 'List invoices (paginated, filterable by status/customer/type).' })
  list(
    @CurrentOrg() org: OrgContext,
    @Query(new ZodQuery(invoiceListQuerySchema)) query: InvoiceListQuery,
  ): Promise<Paginated<Invoice>> {
    return this.invoices.list(org.organizationId, query);
  }

  @Post()
  @RequirePermission('invoice:draft')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Create a DRAFT invoice. Server recomputes every amount — never trusts the client.',
  })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBody(createInvoiceRequestSchema)) dto: CreateInvoiceRequest,
  ): Promise<InvoiceDetail> {
    return this.invoices.create(org.organizationId, user.id, org.role, dto);
  }

  @Get(':id')
  @RequirePermission('invoice:read')
  @ApiOperation({ summary: 'Get an invoice with its line items.' })
  getById(
    @CurrentOrg() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceDetail> {
    return this.invoices.getById(org.organizationId, id);
  }

  @Post(':id/authorize')
  @RequirePermission('invoice:authorize')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Send the invoice to the InvoiceProvider (MockInvoiceProvider in the MVP).',
  })
  authorize(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceDetail> {
    return this.invoices.authorize(org.organizationId, user.id, id);
  }
}
