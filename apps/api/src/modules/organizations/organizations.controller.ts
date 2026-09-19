import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createOrganizationRequestSchema,
  updateOrganizationRequestSchema,
  type CreateOrganizationRequest,
  type Organization,
  type OrganizationSummary,
  type UpdateOrganizationRequest,
} from '@dashgobo/contracts';
import { ZodBody } from '../../common/validation/zod-validation.pipe';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrgScopeGuard } from '../../common/auth/org-scope.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/auth/auth-context';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List the organizations the current user belongs to.' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<OrganizationSummary[]> {
    return this.organizations.listForUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new organization; the creator becomes its OWNER.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBody(createOrganizationRequestSchema)) dto: CreateOrganizationRequest,
  ): Promise<Organization> {
    return this.organizations.createForUser(user.id, dto);
  }

  @Get(':organizationId')
  @UseGuards(OrgScopeGuard)
  @ApiOperation({ summary: 'Get one organization (caller must be a member).' })
  getById(@Param('organizationId', ParseUUIDPipe) organizationId: string): Promise<Organization> {
    return this.organizations.getById(organizationId);
  }

  @Patch(':organizationId')
  @UseGuards(OrgScopeGuard, PermissionsGuard)
  @RequirePermission('organization:update')
  @ApiOperation({ summary: 'Update organization/fiscal data (OWNER/ADMIN only).' })
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBody(updateOrganizationRequestSchema)) dto: UpdateOrganizationRequest,
  ): Promise<Organization> {
    return this.organizations.update(organizationId, user.id, dto);
  }
}
