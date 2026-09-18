import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  UnauthenticatedError,
  UnauthorizedOrganizationAccessError,
  ValidationError,
} from '../errors';
import { MembershipService } from '../../modules/memberships/membership.service';

const ORG_HEADER = 'x-organization-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the target organization for a request and confirms the caller is a
 * member of it. The org id is taken from the route param `:organizationId`
 * (only meaningful on the organizations resource itself, e.g. `GET
 * /organizations/:organizationId`) or the `x-organization-id` header — used by
 * every other tenant-scoped resource (`/customers`, `/products`, ...) so a
 * resource's own `:id` param is never mistaken for the organization id. Never
 * trusted from a request body. On success `req.orgContext = { organizationId, role }`.
 */
@Injectable()
export class OrgScopeGuard implements CanActivate {
  constructor(private readonly memberships: MembershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) throw new UnauthenticatedError();

    const organizationId = this.resolveOrgId(request);
    if (!organizationId) {
      throw new ValidationError([
        { path: 'organizationId', message: 'Organization id is required (route param or header)' },
      ]);
    }

    const role = await this.memberships.getRole(request.user.id, organizationId);
    if (!role) throw new UnauthorizedOrganizationAccessError(organizationId);

    request.orgContext = { organizationId, role };
    return true;
  }

  private resolveOrgId(request: Request): string | null {
    const params = request.params as Record<string, string | undefined>;
    const headerValue = request.headers[ORG_HEADER];
    const candidate =
      params['organizationId'] ?? (Array.isArray(headerValue) ? headerValue[0] : headerValue);
    return candidate && UUID_RE.test(candidate) ? candidate : null;
  }
}
