import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createCustomerRequestSchema,
  customerListQuerySchema,
  type CreateCustomerRequest,
  type Customer,
  type CustomerDetail,
  type CustomerListQuery,
  type Paginated,
  updateCustomerRequestSchema,
  type UpdateCustomerRequest,
} from '@dashgobo/contracts';
import { ZodBody, ZodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentOrg } from '../../common/auth/current-org.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrgScopeGuard } from '../../common/auth/org-scope.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import type { AuthenticatedUser, OrgContext } from '../../common/auth/auth-context';
import { CustomersService } from './customers.service';

/**
 * Flat resource, tenant resolved from `x-organization-id` (see `OrgScopeGuard`)
 * rather than nested under `/organizations/:id` — matches the rest of the API
 * (§15) and is what the future WhatsApp bot will send too.
 */
@ApiTags('customers')
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('customers')
@UseGuards(OrgScopeGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'List customers (paginated, sortable, searchable).' })
  list(
    @CurrentOrg() org: OrgContext,
    @Query(new ZodQuery(customerListQuerySchema)) query: CustomerListQuery,
  ): Promise<Paginated<Customer>> {
    return this.customers.list(org.organizationId, query);
  }

  @Post()
  @RequirePermission('customer:write')
  @ApiOperation({ summary: 'Create a customer.' })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBody(createCustomerRequestSchema)) dto: CreateCustomerRequest,
  ): Promise<Customer> {
    return this.customers.create(org.organizationId, user.id, dto);
  }

  @Get(':id')
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'Get a customer with invoicing stats.' })
  getById(
    @CurrentOrg() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerDetail> {
    return this.customers.getById(org.organizationId, id);
  }

  @Patch(':id')
  @RequirePermission('customer:write')
  @ApiOperation({ summary: 'Update a customer.' })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateCustomerRequestSchema)) dto: UpdateCustomerRequest,
  ): Promise<Customer> {
    return this.customers.update(org.organizationId, user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermission('customer:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate (soft-delete) a customer.' })
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.customers.remove(org.organizationId, user.id, id);
  }
}
