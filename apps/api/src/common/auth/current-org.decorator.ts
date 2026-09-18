import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ForbiddenError } from '../errors';
import type { OrgContext } from './auth-context';

/** The resolved organization context, guaranteed present behind `OrgScopeGuard`. */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.orgContext) {
      throw new ForbiddenError('Organization context is required for this route');
    }
    return request.orgContext;
  },
);
