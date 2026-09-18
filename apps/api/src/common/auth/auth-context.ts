import type { OrgRole } from '@dashgobo/contracts';

/** Attached to the request by `JwtAuthGuard` once the access token is verified. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

/** Attached by `OrgScopeGuard` after the caller's membership in the target org is confirmed. */
export interface OrgContext {
  organizationId: string;
  role: OrgRole;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
    orgContext?: OrgContext;
  }
}
