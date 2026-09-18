import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@dashgobo/contracts';

export const REQUIRED_PERMISSIONS_KEY = 'dashgobo:requiredPermissions';

/**
 * Require one or more permissions (from the shared RBAC matrix) in the resolved
 * organization context. Use together with `OrgScopeGuard` + `PermissionsGuard`.
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
