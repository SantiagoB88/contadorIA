import { createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { accessTokenClaimsSchema, type AccessTokenClaims } from '@dashgobo/contracts';
import { AppConfigService } from '../../config/config.module';
import { UnauthenticatedError } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/auth/auth-context';

export interface IssuedAccessToken {
  token: string;
  expiresIn: number;
}

export interface GeneratedRefreshToken {
  /** The opaque value handed to the client (cookie). Never stored. */
  token: string;
  /** Peppered hash persisted in the DB for lookup. */
  hash: string;
  expiresAt: Date;
}

const REFRESH_TOKEN_BYTES = 48;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccessToken(user: AuthenticatedUser): IssuedAccessToken {
    const expiresIn = this.config.get('JWT_ACCESS_TTL');
    const claims: AccessTokenClaims = { sub: user.id, email: user.email };
    const token = this.jwt.sign(claims, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn,
    });
    return { token, expiresIn };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const payload: unknown = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') });
      return accessTokenClaimsSchema.parse(payload);
    } catch {
      throw new UnauthenticatedError('Invalid or expired access token');
    }
  }

  generateRefreshToken(): GeneratedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.get('JWT_REFRESH_TTL') * 1000);
    return { token, hash: this.hashRefreshToken(token), expiresAt };
  }

  /** HMAC-SHA256 with the refresh secret as pepper: a DB leak alone can't be replayed. */
  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.config.get('JWT_REFRESH_SECRET')).update(token).digest('hex');
  }
}
