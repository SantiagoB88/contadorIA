import { z } from 'zod';

/**
 * Organization roles. Mirrors the `OrgRole` enum in the Prisma schema — keep the
 * two in sync. Ordered from most to least privileged.
 */
export const ORG_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR', 'VIEWER'] as const;

export const orgRoleSchema = z.enum(ORG_ROLES);
export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * Coarse-grained permissions checked by the API (§47). The matrix below is the
 * single source of truth; guards and the frontend both derive from it.
 */
export const PERMISSIONS = [
  'organization:read',
  'organization:update',
  'organization:manage_members',
  'customer:read',
  'customer:write',
  'product:read',
  'product:write',
  'invoice:read',
  'invoice:draft',
  'invoice:write',
  'invoice:authorize',
  'invoice:override_price',
  'payment:read',
  'payment:write',
  'report:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER_PERMS: readonly Permission[] = [...PERMISSIONS];

// ADMIN: everything except owner-only member management.
const ADMIN_PERMS: readonly Permission[] = PERMISSIONS.filter(
  (p) => p !== 'organization:manage_members',
);

const ACCOUNTANT_PERMS: readonly Permission[] = [
  'organization:read',
  'customer:read',
  'customer:write',
  'product:read',
  'product:write',
  'invoice:read',
  'invoice:draft',
  'invoice:write',
  'invoice:authorize',
  'invoice:override_price',
  'payment:read',
  'payment:write',
  'report:read',
];

const OPERATOR_PERMS: readonly Permission[] = [
  'organization:read',
  'customer:read',
  'customer:write',
  'product:read',
  'invoice:read',
  'invoice:draft',
  'payment:read',
];

const VIEWER_PERMS: readonly Permission[] = [
  'organization:read',
  'customer:read',
  'product:read',
  'invoice:read',
  'payment:read',
  'report:read',
];

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: OWNER_PERMS,
  ADMIN: ADMIN_PERMS,
  ACCOUNTANT: ACCOUNTANT_PERMS,
  OPERATOR: OPERATOR_PERMS,
  VIEWER: VIEWER_PERMS,
};

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
