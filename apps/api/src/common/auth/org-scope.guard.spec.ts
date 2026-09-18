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
    const request = { user: { id: 'user-1' }, params: { organizationId: ORG_B }, headers: {} };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedOrganizationAccessError,
    );
    expect(memberships.getRole).toHaveBeenCalledWith('user-1', ORG_B);
  });

  it('ignores a generic :id route param (e.g. a customer id) and falls back to the header', async () => {
    // Regression guard: on routes like GET /customers/:id, `:id` is the
    // customer's id, not the organization's — it must never be read as one.
    const memberships = {
      getRole: jest.fn().mockResolvedValue('OWNER'),
    } as unknown as MembershipService;
    const guard = new OrgScopeGuard(memberships);
    const customerId = '33333333-3333-4333-8333-333333333333';
    const request: Record<string, unknown> = {
      user: { id: 'user-1' },
      params: { id: customerId },
      headers: { 'x-organization-id': ORG_A },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(memberships.getRole).toHaveBeenCalledWith('user-1', ORG_A);
    expect(request.orgContext).toEqual({ organizationId: ORG_A, role: 'OWNER' });
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
