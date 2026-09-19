import { stableHash } from './stable-hash';

describe('stableHash', () => {
  it('hashes a bodyless request (undefined) without throwing', () => {
    expect(() => stableHash(undefined)).not.toThrow();
    expect(stableHash(undefined)).toEqual(expect.any(String));
  });

  it('hashes objects with different key order to the same value', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it('hashes semantically different payloads to different values', () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
    expect(stableHash(undefined)).not.toBe(stableHash(null));
  });
});
