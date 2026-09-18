import { type ExecutionContext } from '@nestjs/common';
import type { MembershipService } from '../../modules/memberships/membership.service';
import { OrgScopeGuard } from './org-scope.guard';
import { UnauthorizedOrganizationAccessError } from '../errors';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OrgScopeGuard', () => {
  it('rejects a user who is not a member of the target organization (no cross-tenant access)', async () => {
    const memberships = {
      getRole: jest.fn().mockResolvedValue(null),
    } as unknown as MembershipService;
    const guard = new OrgScopeGuard(memberships);
    const request = { user: { id: 'user-1' }, params: { id: ORG_B }, headers: {} };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedOrganizationAccessError,
    );
    expect(memberships.getRole).toHaveBeenCalledWith('user-1', ORG_B);
  });

  it('attaches the org context with the resolved role when membership exists', async () => {
    const memberships = {
      getRole: jest.fn().mockResolvedValue('ACCOUNTANT'),
    } as unknown as MembershipService;
    const guard = new OrgScopeGuard(memberships);
    const request: Record<string, unknown> = {
      user: { id: 'user-1' },
      params: { organizationId: ORG_A },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.orgContext).toEqual({ organizationId: ORG_A, role: 'ACCOUNTANT' });
  });

  it('reads the organization id from the x-organization-id header when there is no route param', async () => {
    const memberships = {
      getRole: jest.fn().mockResolvedValue('VIEWER'),
    } as unknown as MembershipService;
    const guard = new OrgScopeGuard(memberships);
    const request = { user: { id: 'u' }, params: {}, headers: { 'x-organization-id': ORG_A } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });
});
