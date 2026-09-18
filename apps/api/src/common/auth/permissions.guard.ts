import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Permission, roleHasPermission } from '@dashgobo/contracts';
import { ForbiddenError } from '../errors';
import { REQUIRED_PERMISSIONS_KEY } from './require-permission.decorator';

/**
 * Enforces `@RequirePermission(...)` against `req.orgContext.role` using the
 * shared role→permission matrix. Must run after `OrgScopeGuard`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const role = request.orgContext?.role;
    if (!role) {
      throw new ForbiddenError('Organization context is required for this route');
    }

    const missing = required.filter((permission) => !roleHasPermission(role, permission));
    if (missing.length > 0) {
      throw new ForbiddenError(`Your role (${role}) lacks permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
