import { JwtService } from '@nestjs/jwt';
import type { AppConfigService } from '../../config/config.module';
import { TokenService } from './token.service';
import { UnauthenticatedError } from '../../common/errors';

const CONFIG: Record<string, string | number> = {
  JWT_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 2_592_000,
};

function makeService(): TokenService {
  const config = { get: (key: string) => CONFIG[key] } as unknown as AppConfigService;
  return new TokenService(new JwtService(), config);
}

describe('TokenService', () => {
  const user = { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', email: 'demo@example.com' };

  it('signs and verifies an access token round-trip', () => {
    const service = makeService();
    const { token, expiresIn } = service.signAccessToken(user);

    expect(expiresIn).toBe(900);
    const claims = service.verifyAccessToken(token);
    expect(claims).toEqual({ sub: user.id, email: user.email });
  });

  it('rejects a token signed with a different secret', () => {
    const service = makeService();
    const forged = new JwtService().sign({ sub: user.id, email: user.email }, { secret: 'wrong' });
    expect(() => service.verifyAccessToken(forged)).toThrow(UnauthenticatedError);
  });

  it('generates an opaque refresh token with a deterministic peppered hash', () => {
    const service = makeService();
    const generated = service.generateRefreshToken();

    expect(generated.token).not.toEqual(generated.hash);
    expect(service.hashRefreshToken(generated.token)).toBe(generated.hash);
    expect(generated.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
