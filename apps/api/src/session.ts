import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type CredentialEnvelope = {
  version: 1;
  username: string;
  password: string;
  issuedAt: number;
};

const ALGORITHM = 'aes-256-gcm';

function b64url(value: Buffer): string {
  return value.toString('base64url');
}

export function encryptCredentials(value: CredentialEnvelope, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from('derkumpel-session-v1'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${b64url(iv)}.${b64url(ciphertext)}.${b64url(tag)}`;
}

export function decryptCredentials(token: string, key: Buffer): CredentialEnvelope {
  const [ivPart, cipherPart, tagPart] = token.split('.');
  if (!ivPart || !cipherPart || !tagPart) throw new Error('invalid session token');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAAD(Buffer.from('derkumpel-session-v1'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(cipherPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(plaintext) as CredentialEnvelope;
  if (parsed.version !== 1 || !parsed.username || !parsed.password || !Number.isFinite(parsed.issuedAt)) {
    throw new Error('invalid session payload');
  }
  return parsed;
}
