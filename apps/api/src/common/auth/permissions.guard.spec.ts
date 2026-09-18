import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@dashgobo/contracts';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { ForbiddenError } from '../errors';

function contextWith(role: string | undefined, handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ orgContext: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  function handlerRequiring(...perms: Permission[]) {
    class Ctrl {
      @RequirePermission(...perms)
      handle() {}
    }
    return new Ctrl().handle;
  }

  it('allows a role that has the required permission', () => {
    const handler = handlerRequiring('customer:write');
    expect(guard.canActivate(contextWith('ADMIN', handler))).toBe(true);
  });

  it('blocks a role that lacks the required permission', () => {
    const handler = handlerRequiring('customer:write');
    expect(() => guard.canActivate(contextWith('VIEWER', handler))).toThrow(ForbiddenError);
  });

  it('blocks invoice authorization for OPERATOR', () => {
    const handler = handlerRequiring('invoice:authorize');
    expect(() => guard.canActivate(contextWith('OPERATOR', handler))).toThrow(ForbiddenError);
  });

  it('passes through when no permission metadata is present', () => {
    const handler = () => {};
    expect(guard.canActivate(contextWith('VIEWER', handler))).toBe(true);
  });
});
