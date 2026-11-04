import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import webPush from 'web-push';

export const PUSH_KINDS = ['assignment', 'status', 'comment', 'priority', 'dates'] as const;
export type PushKind = typeof PUSH_KINDS[number];
export type PushPreferences = Record<PushKind, boolean>;
export type PushSubscriptionData = webPush.PushSubscription;
export type PushEvent = { event_id: string; issue_id: number; kind: PushKind; user_ids: number[] };

const defaults: PushPreferences = { assignment: true, status: true, comment: true, priority: true, dates: true };
const labels: Record<PushKind, string> = {
  assignment: 'Neuer Auftrag zugewiesen', status: 'Status geändert',
  comment: 'Neuer Kommentar', priority: 'Priorität geändert', dates: 'Termin geändert',
};
type Entry = { userId: number; subscription: PushSubscriptionData; preferences: PushPreferences; createdAt: number };
type Store = { entries: Entry[]; recentEvents: string[] };

export function safeEvent(value: unknown): PushEvent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<PushEvent>;
  if (typeof raw.event_id !== 'string' || !/^[a-zA-Z0-9:_-]{8,120}$/.test(raw.event_id)) return undefined;
  if (!Number.isSafeInteger(raw.issue_id) || (raw.issue_id ?? 0) < 1) return undefined;
  if (!PUSH_KINDS.includes(raw.kind as PushKind)) return undefined;
  if (!Array.isArray(raw.user_ids) || raw.user_ids.length > 200 ||
    raw.user_ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return undefined;
  return { event_id: raw.event_id, issue_id: raw.issue_id!, kind: raw.kind!, user_ids: [...new Set(raw.user_ids)] };
}

export function validPushEndpoint(raw: string): boolean {
  try {
    if (raw.length > 2048) return false;
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'push.services.mozilla.com' ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host === 'wns.notify.windows.com' || host.endsWith('.notify.windows.com');
  } catch { return false; }
}

export function validSubscription(raw: unknown): raw is PushSubscriptionData {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Partial<PushSubscriptionData>;
  return typeof data.endpoint === 'string' && validPushEndpoint(data.endpoint) &&
    !!data.keys && typeof data.keys.p256dh === 'string' &&
    typeof data.keys.auth === 'string' &&
    /^[A-Za-z0-9_-]{70,120}$/.test(data.keys.p256dh) &&
    /^[A-Za-z0-9_-]{18,45}$/.test(data.keys.auth);
}

export function normalizePreferences(value: unknown): PushPreferences {
  if (!value || typeof value !== 'object') return { ...defaults };
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(PUSH_KINDS.map((kind) => [kind, raw[kind] !== false])) as PushPreferences;
}

export function verifyEventToken(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Only push endpoints and per-device settings; never credentials or issue data. */
export class PushRegistry {
  private store: Store;
  private busy = false;

  constructor(private readonly file: string, private readonly vapid: {
    subject: string; publicKey: string; privateKey: string;
  }) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.store = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Store : { entries: [], recentEvents: [] };
    if (!Array.isArray(this.store.entries) || !Array.isArray(this.store.recentEvents)) throw new Error('Invalid push store data');
    webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  }

  private persist() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.store), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, this.file);
  }

  register(userId: number, subscription: PushSubscriptionData, preferences: PushPreferences): void {
    // One endpoint belongs to exactly one Redmine user; switching accounts reassigns it.
    this.store.entries = this.store.entries.filter((item) => item.subscription.endpoint !== subscription.endpoint);
    this.store.entries.push({ userId, subscription, preferences, createdAt: Date.now() });
    const mine = this.store.entries.filter((item) => item.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
    if (mine.length > 8) {
      const evicted = new Set(mine.slice(0, mine.length - 8).map((entry) => entry.subscription.endpoint));
      this.store.entries = this.store.entries.filter((item) => !evicted.has(item.subscription.endpoint));
    }
    if (this.store.entries.length > 1000) throw new Error('Push registry capacity exceeded');
    this.persist();
  }

  unregister(userId: number, endpoint: string): void {
    this.store.entries = this.store.entries.filter((entry) => entry.userId !== userId || entry.subscription.endpoint !== endpoint);
    this.persist();
  }

  owns(userId: number, endpoint: string): boolean {
    return this.store.entries.some((entry) => entry.userId === userId && entry.subscription.endpoint === endpoint);
  }

  /** Idempotent delivery. Never includes issue subject, description or private comments in lock-screen payload. */
  async dispatch(event: PushEvent): Promise<{ delivered: number; failed: number; duplicate: boolean }> {
    if (this.store.recentEvents.includes(event.event_id)) return { delivered: 0, failed: 0, duplicate: true };
    if (this.busy) throw new Error('Push delivery busy');
    this.busy = true;
    try {
      const recipients = new Set(event.user_ids);
      const targets = this.store.entries.filter((entry) => recipients.has(entry.userId) && entry.preferences[event.kind]);
      const expired: string[] = [];
      let delivered = 0;
      let failed = 0;
      const payload = JSON.stringify({
        title: 'DerKumpel',
        body: `${labels[event.kind]} · Ticket #${event.issue_id}`,
        url: `/issues/${event.issue_id}`,
        tag: `issue-${event.issue_id}`,
      });
      for (let start = 0; start < targets.length; start += 8) {
        await Promise.all(targets.slice(start, start + 8).map(async (entry) => {
          try {
            await webPush.sendNotification(entry.subscription, payload, {
              TTL: 3600, timeout: 5000, urgency: 'normal', topic: `issue-${event.issue_id}`,
            });
            delivered += 1;
          } catch (err) {
            failed += 1;
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) expired.push(entry.subscription.endpoint);
          }
        }));
      }
      if (expired.length) {
        const dead = new Set(expired);
        this.store.entries = this.store.entries.filter((entry) => !dead.has(entry.subscription.endpoint));
      }
      // Persist the deduplication marker only after successful delivery. An event
      // with temporary push-provider errors must be retried by the Redmine job.
      if (failed === 0) {
        this.store.recentEvents.push(event.event_id);
        this.store.recentEvents = this.store.recentEvents.slice(-500);
      }
      this.persist();
      return { delivered, failed, duplicate: false };
    } finally { this.busy = false; }
  }
}
