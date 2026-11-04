import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import webPush from 'web-push';
import { normalizePreferences, PushRegistry, safeEvent, validPushEndpoint, verifyEventToken } from './push.js';

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

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

  it('persists only device subscriptions, reassigns shared endpoints and deduplicates events', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'derkumpel-push-test-'));
    temporary.push(dir);
    const file = join(dir, 'push.json');
    const keys = webPush.generateVAPIDKeys();
    const registry = new PushRegistry(file, { subject: 'mailto:test@example.org', publicKey: keys.publicKey, privateKey: keys.privateKey });
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } };
    registry.register(11, subscription, normalizePreferences(null));
    expect(registry.owns(11, subscription.endpoint)).toBe(true);
    registry.register(12, subscription, normalizePreferences({ comment: false }));
    expect(registry.owns(11, subscription.endpoint)).toBe(false);
    expect(registry.owns(12, subscription.endpoint)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).entries[0].preferences.comment).toBe(false);
    registry.unregister(12, subscription.endpoint);
    const event = { event_id: 'issue-100-status-11', issue_id: 100, kind: 'status' as const, user_ids: [12] };
    expect(await registry.dispatch(event)).toMatchObject({ delivered: 0, failed: 0, duplicate: false });
    expect(await registry.dispatch(event)).toMatchObject({ duplicate: true });
  });

  it('checks the token without matching prefixes or empty values', () => {
    const secret = 'one-strong-random-32-character-secret';
    expect(verifyEventToken(secret, secret)).toBe(true);
    expect(verifyEventToken(secret.slice(0, 14), secret)).toBe(false);
    expect(verifyEventToken('', secret)).toBe(false);
  });
});
