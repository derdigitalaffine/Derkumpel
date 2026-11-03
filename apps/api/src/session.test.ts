import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptCredentials, encryptCredentials } from './session.js';

describe('credential envelope', () => {
  it('round-trips credentials without plaintext token content', () => {
    const key = randomBytes(32);
    const value = { version: 1 as const, username: 'worker', password: 'secret-password', issuedAt: 123 };
    const token = encryptCredentials(value, key);
    expect(token).not.toContain('worker');
    expect(token).not.toContain('secret-password');
    expect(decryptCredentials(token, key)).toEqual(value);
  });

  it('rejects tampering', () => {
    const key = randomBytes(32);
    const token = encryptCredentials({ version: 1, username: 'a', password: 'b', issuedAt: 1 }, key);
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(() => decryptCredentials(tampered, key)).toThrow();
  });
});
