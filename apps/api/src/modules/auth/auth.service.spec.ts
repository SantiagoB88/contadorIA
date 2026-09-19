import type { PasswordResetToken, RefreshToken, User } from '@prisma/client';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';
import type { RefreshTokenRepository } from './refresh-token.repository';
import type { PasswordResetTokenRepository } from './password-reset-token.repository';
import type { UserRepository } from '../users/user.repository';
import type { OrganizationRepository } from '../organizations/organization.repository';
import type { MembershipService } from '../memberships/membership.service';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AppConfigService } from '../../config/config.module';
import type { EmailProvider } from '../../infrastructure/email/email-provider.interface';
import {
  EmailAlreadyRegisteredError,
  ForbiddenError,
  InvalidCredentialsError,
  UnauthenticatedError,
} from '../../common/errors';

const now = Date.now();

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@example.com',
    passwordHash: 'hash',
    phone: null,
    status: 'ACTIVE',
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  };
}

function makeRefreshRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'rt-1',
    userId: 'user-1',
    tokenHash: 'hash-1',
    familyId: 'fam-1',
    userAgent: null,
    ip: null,
    expiresAt: new Date(now + 100_000),
    revokedAt: null,
    replacedByTokenId: null,
    createdAt: new Date(now),
    ...overrides,
  };
}

function makeResetTokenRow(overrides: Partial<PasswordResetToken> = {}): PasswordResetToken {
  return {
    id: 'prt-1',
    userId: 'user-1',
    tokenHash: 'reset-hash',
    expiresAt: new Date(now + 100_000),
    usedAt: null,
    createdAt: new Date(now),
    ...overrides,
  };
}

interface Mocks {
  prisma: PrismaService;
  users: jest.Mocked<Pick<UserRepository, 'findByEmail' | 'findById' | 'create' | 'updatePassword'>>;
  organizations: jest.Mocked<Pick<OrganizationRepository, 'create'>>;
  memberships: jest.Mocked<Pick<MembershipService, 'create' | 'listForUser'>>;
  passwords: jest.Mocked<Pick<PasswordService, 'hash' | 'verify'>>;
  tokens: jest.Mocked<
    Pick<
      TokenService,
      | 'signAccessToken'
      | 'generateRefreshToken'
      | 'hashRefreshToken'
      | 'generatePasswordResetToken'
      | 'hashPasswordResetToken'
    >
  >;
  refreshTokens: jest.Mocked<
    Pick<
      RefreshTokenRepository,
      'create' | 'findByHash' | 'markRotated' | 'revokeFamily' | 'revokeAllForUser'
    >
  >;
  passwordResetTokens: jest.Mocked<
    Pick<PasswordResetTokenRepository, 'create' | 'findByHash' | 'markUsed'>
  >;
  audit: jest.Mocked<Pick<AuditService, 'record'>>;
  config: { get: (key: string) => string; isProduction: boolean };
  email: jest.Mocked<Pick<EmailProvider, 'send'>>;
}

function build(): { service: AuthService; m: Mocks } {
  const m: Mocks = {
    prisma: {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
    } as unknown as PrismaService,
    users: {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue(makeUser()),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    },
    organizations: { create: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme' }) },
    memberships: {
      create: jest.fn().mockResolvedValue({ id: 'mem-1' }),
      listForUser: jest.fn().mockResolvedValue([]),
    },
    passwords: { hash: jest.fn().mockResolvedValue('hashed'), verify: jest.fn() },
    tokens: {
      signAccessToken: jest.fn().mockReturnValue({ token: 'access-jwt', expiresIn: 900 }),
      generateRefreshToken: jest.fn().mockReturnValue({
        token: 'refresh-raw',
        hash: 'refresh-hash',
        expiresAt: new Date(now + 100_000),
      }),
      hashRefreshToken: jest.fn((t: string) => `${t}-hash`),
      generatePasswordResetToken: jest.fn().mockReturnValue({
        token: 'reset-raw',
        hash: 'reset-hash',
        expiresAt: new Date(now + 3_600_000),
      }),
      hashPasswordResetToken: jest.fn((t: string) => `${t}-hash`),
    },
    refreshTokens: {
      create: jest.fn().mockResolvedValue(makeRefreshRow({ id: 'rt-new' })),
      findByHash: jest.fn(),
      markRotated: jest.fn().mockResolvedValue(undefined),
      revokeFamily: jest.fn().mockResolvedValue(1),
      revokeAllForUser: jest.fn().mockResolvedValue(1),
    },
    passwordResetTokens: {
      create: jest.fn().mockResolvedValue(makeResetTokenRow()),
      findByHash: jest.fn(),
      markUsed: jest.fn().mockResolvedValue(undefined),
    },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
    config: {
      get: (key: string) => (key === 'APP_URL' ? 'http://localhost:3000' : 'x'),
      isProduction: false,
    },
    email: { send: jest.fn().mockResolvedValue(undefined) },
  };

  const service = new AuthService(
    m.prisma,
    m.users as unknown as UserRepository,
    m.organizations as unknown as OrganizationRepository,
    m.memberships as unknown as MembershipService,
    m.passwords as unknown as PasswordService,
    m.tokens as unknown as TokenService,
    m.refreshTokens as unknown as RefreshTokenRepository,
    m.passwordResetTokens as unknown as PasswordResetTokenRepository,
    m.audit as unknown as AuditService,
    m.config as unknown as AppConfigService,
    m.email,
  );
  return { service, m };
}

const ctx = { ip: '127.0.0.1', userAgent: 'jest' };

describe('AuthService.register', () => {
  it('rejects an email that is already registered', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(makeUser());

    await expect(
      service.register(
        {
          firstName: 'A',
          lastName: 'B',
          email: 'demo@example.com',
          password: 'xxxxxxxx',
          organizationName: 'Acme',
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('creates user + org + OWNER membership in a transaction and issues a session', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(null);

    const result = await service.register(
      {
        firstName: 'A',
        lastName: 'B',
        email: 'demo@example.com',
        password: 'xxxxxxxx',
        organizationName: 'Acme',
      },
      ctx,
    );

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(m.memberships.create).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      'OWNER',
      expect.anything(),
    );
    expect(m.refreshTokens.create).toHaveBeenCalled();
    expect(result.auth.accessToken).toBe('access-jwt');
    expect(result.refreshToken).toBe('refresh-raw');
  });
});

describe('AuthService.login', () => {
  it('throws InvalidCredentialsError on a wrong password', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(makeUser());
    m.passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: 'demo@example.com', password: 'nope' }, ctx),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('still runs a dummy verify when the email does not exist', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(null);
    m.passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'nope' }, ctx),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(m.passwords.verify).toHaveBeenCalledTimes(1);
  });

  it('refuses a disabled account', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(makeUser({ status: 'DISABLED' }));
    m.passwords.verify.mockResolvedValue(true);

    await expect(
      service.login({ email: 'demo@example.com', password: 'ok' }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('issues a session on success', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(makeUser());
    m.passwords.verify.mockResolvedValue(true);

    const result = await service.login({ email: 'demo@example.com', password: 'ok' }, ctx);
    expect(result.auth.accessToken).toBe('access-jwt');
    expect(m.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN' }));
  });
});

describe('AuthService.refresh', () => {
  it('rotates the token and issues a new access token', async () => {
    const { service, m } = build();
    m.refreshTokens.findByHash.mockResolvedValue(makeRefreshRow());
    m.users.findById.mockResolvedValue(makeUser());

    const result = await service.refresh('refresh-raw', ctx);

    expect(m.refreshTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1' }),
    );
    expect(m.refreshTokens.markRotated).toHaveBeenCalledWith('rt-1', 'rt-new');
    expect(result.accessToken).toBe('access-jwt');
  });

  it('detects reuse of an already-revoked token and revokes the whole family', async () => {
    const { service, m } = build();
    m.refreshTokens.findByHash.mockResolvedValue(makeRefreshRow({ revokedAt: new Date(now - 1) }));

    await expect(service.refresh('refresh-raw', ctx)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(m.refreshTokens.revokeFamily).toHaveBeenCalledWith('fam-1');
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFRESH_REUSE_DETECTED' }),
    );
  });

  it('rejects an expired token', async () => {
    const { service, m } = build();
    m.refreshTokens.findByHash.mockResolvedValue(makeRefreshRow({ expiresAt: new Date(now - 1) }));

    await expect(service.refresh('refresh-raw', ctx)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an unknown token', async () => {
    const { service, m } = build();
    m.refreshTokens.findByHash.mockResolvedValue(null);

    await expect(service.refresh('whatever', ctx)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe('AuthService.logout', () => {
  it('is a no-op when no token is presented', async () => {
    const { service, m } = build();
    await service.logout(undefined);
    expect(m.refreshTokens.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes the family for a known token', async () => {
    const { service, m } = build();
    m.refreshTokens.findByHash.mockResolvedValue(makeRefreshRow());

    await service.logout('refresh-raw');
    expect(m.refreshTokens.revokeFamily).toHaveBeenCalledWith('fam-1');
  });
});

describe('AuthService.forgotPassword', () => {
  it('returns the same generic message for an unknown email and sends nothing', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(null);

    const result = await service.forgotPassword({ email: 'ghost@example.com' });

    expect(result.message).toMatch(/if that email is registered/i);
    expect(result.resetToken).toBeUndefined();
    expect(m.email.send).not.toHaveBeenCalled();
  });

  it('creates a reset token and includes it in the response outside production', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(makeUser());

    const result = await service.forgotPassword({ email: 'demo@example.com' });

    expect(m.passwordResetTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', tokenHash: 'reset-hash' }),
    );
    expect(m.email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'demo@example.com' }));
    expect(result.resetToken).toBe('reset-raw');
  });

  it('never includes the reset token in the response in production', async () => {
    const { service, m } = build();
    m.users.findByEmail.mockResolvedValue(makeUser());
    m.config.isProduction = true;

    const result = await service.forgotPassword({ email: 'demo@example.com' });

    expect(result.resetToken).toBeUndefined();
    expect(result.resetUrl).toBeUndefined();
  });
});

describe('AuthService.resetPassword', () => {
  it('rejects an unknown token', async () => {
    const { service, m } = build();
    m.passwordResetTokens.findByHash.mockResolvedValue(null);

    await expect(
      service.resetPassword({ token: 'whatever', newPassword: 'newpassword123' }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an already-used token', async () => {
    const { service, m } = build();
    m.passwordResetTokens.findByHash.mockResolvedValue(makeResetTokenRow({ usedAt: new Date(now) }));

    await expect(
      service.resetPassword({ token: 'reset-raw', newPassword: 'newpassword123' }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an expired token', async () => {
    const { service, m } = build();
    m.passwordResetTokens.findByHash.mockResolvedValue(
      makeResetTokenRow({ expiresAt: new Date(now - 1) }),
    );

    await expect(
      service.resetPassword({ token: 'reset-raw', newPassword: 'newpassword123' }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('updates the password, marks the token used, and revokes every session', async () => {
    const { service, m } = build();
    m.passwordResetTokens.findByHash.mockResolvedValue(makeResetTokenRow());
    m.users.findById.mockResolvedValue(makeUser());

    await service.resetPassword({ token: 'reset-raw', newPassword: 'newpassword123' });

    expect(m.users.updatePassword).toHaveBeenCalledWith('user-1', 'hashed');
    expect(m.passwordResetTokens.markUsed).toHaveBeenCalledWith('prt-1');
    expect(m.refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(m.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSWORD_RESET' }));
  });
});
