import { describe, expect, it } from 'vitest';
import { normalizePreferences, safeEvent, validPushEndpoint, verifyEventToken } from './push.js';

describe('push security boundary', () => {
  it('accepts only a well-formed event and removes duplicate recipients', () => {
    const input = { event_id: 'issue:456:status:1', issue_id: 456, kind: 'status', user_ids: [2, 2, 3] };
    expect(safeEvent(input)).toEqual({ ...input, user_ids: [2, 3] });
    expect(safeEvent({ ...input, issue_id: -1 })).toBeUndefined();
    expect(safeEvent({ ...input, user_ids: ['not-an-id'] })).toBeUndefined();
    expect(safeEvent({ ...input, kind: 'admin' })).toBeUndefined();
    expect(safeEvent({ ...input, user_ids: Array.from({ length: 201 }, (_, i) => i + 1) })).toBeUndefined();
  });

  it('uses safe default preferences and honors explicit opt-outs', () => {
    expect(normalizePreferences(null).assignment).toBe(true);
    expect(normalizePreferences({ dates: false, comment: false })).toEqual({
      assignment: true, status: true, comment: false, priority: true, dates: false,
    });
  });

  it('never accepts arbitrary push endpoints, HTTP or embedded credentials', () => {
    expect(validPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(validPushEndpoint('https://web.push.apple.com/q/abc')).toBe(true);
    expect(validPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xyz')).toBe(true);
    expect(validPushEndpoint('https://evil.example/steal')).toBe(false);
    expect(validPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(validPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/abc')).toBe(false);
  });

  it('checks the token without matching prefixes or empty values', () => {
    const secret = 'one-strong-random-32-character-secret';
    expect(verifyEventToken(secret, secret)).toBe(true);
    expect(verifyEventToken(secret.slice(0, 14), secret)).toBe(false);
    expect(verifyEventToken('', secret)).toBe(false);
  });
});
