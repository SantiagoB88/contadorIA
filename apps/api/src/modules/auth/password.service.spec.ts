import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password to an argon2id string and verifies it', async () => {
    const hash = await service.hash('correct horse battery staple');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(service.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });
});
