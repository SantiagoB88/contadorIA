import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthResult,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  ResetPasswordRequest,
} from '@dashgobo/contracts';
import {
  EmailAlreadyRegisteredError,
  ForbiddenError,
  InvalidCredentialsError,
  UnauthenticatedError,
} from '../../common/errors';
import type { AuthenticatedUser } from '../../common/auth/auth-context';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AppConfigService } from '../../config/config.module';
import { EMAIL_PROVIDER, type EmailProvider } from '../../infrastructure/email/email-provider.interface';
import { AuditService } from '../audit/audit.service';
import { MembershipService } from '../memberships/membership.service';
import { UserRepository } from '../users/user.repository';
import { OrganizationRepository } from '../organizations/organization.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { PasswordResetTokenRepository } from './password-reset-token.repository';
import { toPublicUser } from './auth.mapper';

const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'If that email is registered, a password reset link has been sent.';

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
    private readonly passwordResetTokens: PasswordResetTokenRepository,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
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

  /**
   * Always responds with the same generic message whether or not the email
   * is registered — this must never let a caller distinguish the two (no
   * account enumeration). Outside production, the raw reset link is also
   * returned in the response so the flow is usable without a real mailbox.
   */
  async forgotPassword(dto: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.status === 'DISABLED') {
      return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
    }

    const reset = this.tokens.generatePasswordResetToken();
    await this.passwordResetTokens.create({
      userId: user.id,
      tokenHash: reset.hash,
      expiresAt: reset.expiresAt,
    });

    const resetUrl = `${this.config.get('APP_URL')}/reset-password?token=${reset.token}`;
    await this.email.send({
      to: user.email,
      subject: 'Recuperar tu contraseña de DashGoBo',
      text: `Entrá a este link para elegir una contraseña nueva (vence en 1 hora): ${resetUrl}`,
    });

    await this.audit.record({
      action: 'FORGOT_PASSWORD_REQUESTED',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
    });

    return {
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
      ...(this.config.isProduction ? {} : { resetToken: reset.token, resetUrl }),
    };
  }

  async resetPassword(dto: ResetPasswordRequest): Promise<void> {
    const record = await this.passwordResetTokens.findByHash(
      this.tokens.hashPasswordResetToken(dto.token),
    );
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthenticatedError('Invalid or expired reset token');
    }

    const user = await this.users.findById(record.userId);
    if (!user) throw new UnauthenticatedError('Invalid or expired reset token');

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.users.updatePassword(user.id, passwordHash);
    await this.passwordResetTokens.markUsed(record.id);
    // A password reset invalidates every existing session, on every device —
    // whoever reset it might be recovering the account from an attacker.
    await this.refreshTokens.revokeAllForUser(user.id);

    await this.audit.record({
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
    });
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
