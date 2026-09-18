import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DashboardSummary } from '@dashgobo/contracts';
import { CurrentOrg } from '../../common/auth/current-org.decorator';
import { OrgScopeGuard } from '../../common/auth/org-scope.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import type { OrgContext } from '../../common/auth/auth-context';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('dashboard')
@UseGuards(OrgScopeGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermission('report:read')
  @ApiOperation({
    summary:
      'Billing this month, pending invoices, active customers, revenue chart, recent activity.',
  })
  summary(@CurrentOrg() org: OrgContext): Promise<DashboardSummary> {
    return this.dashboard.getSummary(org.organizationId);
  }
}
