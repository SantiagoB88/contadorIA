import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthResult, LoginRequest, MeResponse, RegisterRequest } from '@dashgobo/contracts';
import {
  EmailAlreadyRegisteredError,
  ForbiddenError,
  InvalidCredentialsError,
  UnauthenticatedError,
} from '../../common/errors';
import type { AuthenticatedUser } from '../../common/auth/auth-context';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MembershipService } from '../memberships/membership.service';
import { UserRepository } from '../users/user.repository';
import { OrganizationRepository } from '../organizations/organization.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { toPublicUser } from './auth.mapper';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface SessionResult {
  auth: AuthResult;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RefreshedSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// Constant hash used to keep login timing similar whether or not the email exists.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0Nq0m1I8m3m4Q6b1nQm9m0Zk9Zk9Zk9Zk9Zk9Zk9Zk';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterRequest, ctx: RequestContext): Promise<SessionResult> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new EmailAlreadyRegisteredError();

    // Hash before opening the transaction — Argon2 is deliberately slow and
    // should not hold a DB connection.
    const passwordHash = await this.passwords.hash(dto.password);

    const { user } = await this.prisma.$transaction(async (tx) => {
      const createdUser = await this.users.create(
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          passwordHash,
          phone: dto.phone,
        },
        tx,
      );
      const org = await this.organizations.create({ name: dto.organizationName }, tx);
      await this.memberships.create(createdUser.id, org.id, 'OWNER', tx);
      await this.audit.record(
        { action: 'REGISTER', entity: 'User', entityId: createdUser.id, userId: createdUser.id },
        tx,
      );
      await this.audit.record(
        {
          action: 'CREATE_ORGANIZATION',
          entity: 'Organization',
          entityId: org.id,
          organizationId: org.id,
          userId: createdUser.id,
          metadata: { name: org.name, viaRegistration: true },
        },
        tx,
      );
      return { user: createdUser };
    });

    const session = await this.issueSession({ id: user.id, email: user.email }, ctx);
    const memberships = await this.memberships.listForUser(user.id);
    return {
      auth: {
        accessToken: session.accessToken,
        tokenType: 'Bearer',
        expiresIn: session.expiresIn,
        user: toPublicUser(user),
        memberships,
      },
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
    };
  }

  async login(dto: LoginRequest, ctx: RequestContext): Promise<SessionResult> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      await this.passwords.verify(DUMMY_HASH, dto.password);
      throw new InvalidCredentialsError();
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, dto.password);
    if (!passwordOk) throw new InvalidCredentialsError();
    if (user.status === 'DISABLED') throw new ForbiddenError('This account is disabled');

    const session = await this.issueSession({ id: user.id, email: user.email }, ctx);
    const memberships = await this.memberships.listForUser(user.id);
    await this.audit.record({
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      metadata: { ip: ctx.ip ?? null },
    });

    return {
      auth: {
        accessToken: session.accessToken,
        tokenType: 'Bearer',
        expiresIn: session.expiresIn,
        user: toPublicUser(user),
        memberships,
      },
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
    };
  }

  async refresh(rawToken: string | undefined, ctx: RequestContext): Promise<RefreshedSession> {
    if (!rawToken) throw new UnauthenticatedError('Missing refresh token');

    const record = await this.refreshTokens.findByHash(this.tokens.hashRefreshToken(rawToken));
    if (!record) throw new UnauthenticatedError('Invalid refresh token');

    if (record.revokedAt) {
      await this.refreshTokens.revokeFamily(record.familyId);
      await this.audit.record({
        action: 'REFRESH_REUSE_DETECTED',
        entity: 'RefreshToken',
        entityId: record.id,
        userId: record.userId,
        metadata: { familyId: record.familyId, ip: ctx.ip ?? null },
      });
      throw new UnauthenticatedError('Refresh token reuse detected');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthenticatedError('Refresh token expired');
    }

    const user = await this.users.findById(record.userId);
    if (!user || user.status === 'DISABLED') {
      await this.refreshTokens.revokeFamily(record.familyId);
      throw new UnauthenticatedError('Account is no longer active');
    }

    const next = this.tokens.generateRefreshToken();
    const created = await this.refreshTokens.create({
      userId: user.id,
      tokenHash: next.hash,
      familyId: record.familyId,
      expiresAt: next.expiresAt,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });
    await this.refreshTokens.markRotated(record.id, created.id);

    const access = this.tokens.signAccessToken({ id: user.id, email: user.email });
    await this.audit.record({
      action: 'TOKEN_REFRESH',
      entity: 'RefreshToken',
      entityId: created.id,
      userId: user.id,
      metadata: { familyId: record.familyId },
    });

    return {
      accessToken: access.token,
      tokenType: 'Bearer',
      expiresIn: access.expiresIn,
      refreshToken: next.token,
      refreshExpiresAt: next.expiresAt,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.refreshTokens.findByHash(this.tokens.hashRefreshToken(rawToken));
    if (!record) return;
    await this.refreshTokens.revokeFamily(record.familyId);
    await this.audit.record({
      action: 'LOGOUT',
      entity: 'RefreshToken',
      entityId: record.id,
      userId: record.userId,
      metadata: { familyId: record.familyId },
    });
  }

  async me(user: AuthenticatedUser): Promise<MeResponse> {
    const row = await this.users.findById(user.id);
    if (!row) throw new UnauthenticatedError();
    const memberships = await this.memberships.listForUser(user.id);
    return { user: toPublicUser(row), memberships };
  }

  private async issueSession(
    user: AuthenticatedUser,
    ctx: RequestContext,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshExpiresAt: Date;
  }> {
    const access = this.tokens.signAccessToken(user);
    const refresh = this.tokens.generateRefreshToken();
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: refresh.hash,
      familyId: randomUUID(),
      expiresAt: refresh.expiresAt,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });
    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }
}
