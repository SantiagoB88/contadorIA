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
  createProductRequestSchema,
  productListQuerySchema,
  type CreateProductRequest,
  type Paginated,
  type Product,
  type ProductListQuery,
  updateProductRequestSchema,
  type UpdateProductRequest,
} from '@dashgobo/contracts';
import { ZodBody, ZodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentOrg } from '../../common/auth/current-org.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrgScopeGuard } from '../../common/auth/org-scope.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import type { AuthenticatedUser, OrgContext } from '../../common/auth/auth-context';
import { ProductsService } from './products.service';

/** Flat resource, tenant resolved from `x-organization-id` — same pattern as `/customers`. */
@ApiTags('products')
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('products')
@UseGuards(OrgScopeGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'List products/services (paginated, sortable, searchable).' })
  list(
    @CurrentOrg() org: OrgContext,
    @Query(new ZodQuery(productListQuerySchema)) query: ProductListQuery,
  ): Promise<Paginated<Product>> {
    return this.products.list(org.organizationId, query);
  }

  @Post()
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Create a product or service.' })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBody(createProductRequestSchema)) dto: CreateProductRequest,
  ): Promise<Product> {
    return this.products.create(org.organizationId, user.id, dto);
  }

  @Get(':id')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Get a product.' })
  getById(@CurrentOrg() org: OrgContext, @Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.getById(org.organizationId, id);
  }

  @Patch(':id')
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Update a product (including toggling `active`).' })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateProductRequestSchema)) dto: UpdateProductRequest,
  ): Promise<Product> {
    return this.products.update(org.organizationId, user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermission('product:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a product.' })
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.products.remove(org.organizationId, user.id, id);
  }
}
