import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, roleHasPermission } from './roles';

describe('role permission matrix', () => {
  it('grants OWNER every permission', () => {
    expect(roleHasPermission('OWNER', 'organization:manage_members')).toBe(true);
    expect(roleHasPermission('OWNER', 'invoice:authorize')).toBe(true);
  });

  it('keeps member management owner-only', () => {
    expect(roleHasPermission('ADMIN', 'organization:manage_members')).toBe(false);
    expect(roleHasPermission('ACCOUNTANT', 'organization:manage_members')).toBe(false);
  });

  it('limits OPERATOR to drafts, not authorization or price overrides', () => {
    expect(roleHasPermission('OPERATOR', 'invoice:draft')).toBe(true);
    expect(roleHasPermission('OPERATOR', 'invoice:authorize')).toBe(false);
    expect(roleHasPermission('OPERATOR', 'invoice:override_price')).toBe(false);
  });

  it('makes VIEWER strictly read-only', () => {
    const writeish = ROLE_PERMISSIONS.VIEWER.filter((p) => !p.endsWith(':read'));
    expect(writeish).toEqual([]);
  });
});
