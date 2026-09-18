import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UnauthenticatedError } from '../errors';
import { TokenService } from '../../modules/auth/token.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global guard. Every route requires a valid `Authorization: Bearer <accessToken>`
 * unless explicitly marked `@Public()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request.headers.authorization);
    if (!token) throw new UnauthenticatedError('Missing bearer token');

    const claims = this.tokens.verifyAccessToken(token);
    request.user = { id: claims.sub, email: claims.email };
    return true;
  }

  private extractBearer(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
