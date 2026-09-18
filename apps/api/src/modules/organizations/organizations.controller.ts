import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createOrganizationRequestSchema,
  type CreateOrganizationRequest,
  type Organization,
  type OrganizationSummary,
} from '@dashgobo/contracts';
import { ZodBody } from '../../common/validation/zod-validation.pipe';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrgScopeGuard } from '../../common/auth/org-scope.guard';
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

  @Get(':id')
  @UseGuards(OrgScopeGuard)
  @ApiOperation({ summary: 'Get one organization (caller must be a member).' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Organization> {
    return this.organizations.getById(id);
  }
}
