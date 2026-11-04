import { describe, expect, it } from 'vitest';
import { validateSubscription } from './push.js';

const keys = { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) };
describe('push subscription security boundaries', () => {
  it('accepts a real HTTPS web push provider', () => {
    expect(validateSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/token', keys }).endpoint)
      .toBe('https://fcm.googleapis.com/fcm/send/token');
    expect(validateSubscription({ endpoint: 'https://web.push.apple.com/QAAabc', keys }).keys.auth).toBe(keys.auth);
  });
  it('blocks SSRF targets, untrusted providers and non-HTTPS endpoints', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/foo',
      'https://127.0.0.1:443/',
      'https://localhost/admin',
      'https://fcm.googleapis.com.evil.invalid/',
      'https://fcm.googleapis.com:8443/',
      'https://username:password@fcm.googleapis.com/foo',
    ]) expect(() => validateSubscription({ endpoint, keys })).toThrow();
  });
  it('requires actual browser encryption keys', () => {
    expect(() => validateSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/foo', keys: { p256dh: '', auth: '' } })).toThrow();
  });
});
