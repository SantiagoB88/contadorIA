import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UnauthenticatedError } from '../errors';
import type { AuthenticatedUser } from './auth-context';

/** The authenticated user, guaranteed present behind `JwtAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) throw new UnauthenticatedError();
    return request.user;
  },
);
