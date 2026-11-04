import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import webpush from 'web-push';
import type { AppConfig } from './config.js';
import type { CredentialEnvelope } from './session.js';
import { fetchMyWork, redmineJson, RedmineError } from './redmine.js';
import {
  compareIssue, firstEnabledEvent, notificationText, prefsFromUnknown, toSnapshot,
  type IssueChange, type IssueSnapshot, type PushEventKind, type PushPreferences,
} from './push-events.js';

export type BrowserSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
type SubscriptionRow = {
  endpoint: string; user_id: number; p256dh: string; auth: string;
  preferences: string; last_test_at: number;
};
type UserRow = { user_id: number; credentials: string; initialized: number };
type SnapshotRow = {
  user_id: number; issue_id: number; updated_on: string; status_id: number;
  priority_id: number; start_date: string | null; due_date: string | null;
};
type NotificationPayload = {
  title: string; body: string; url: string; tag: string; icon: string;
};

const HOSTS = [
  'fcm.googleapis.com', 'updates.push.services.mozilla.com',
  'web.push.apple.com', 'push.services.mozilla.com',
];

export function validateSubscription(raw: unknown): BrowserSubscription {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid push subscription');
  const input = raw as Partial<BrowserSubscription>;
  const url = new URL(input.endpoint ?? '');
  const hostname = url.hostname.toLowerCase();
  const trusted = HOSTS.includes(hostname) || hostname.endsWith('.push.apple.com') ||
    hostname.endsWith('.push.services.mozilla.com') || hostname.endsWith('.notify.windows.com');
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
    !trusted || url.toString().length > 2048) {
    throw new Error('Untrusted push service endpoint');
  }
  if (!input.keys || !/^[A-Za-z0-9_-]{40,128}$/.test(input.keys.p256dh ?? '') ||
    !/^[A-Za-z0-9_-]{12,64}$/.test(input.keys.auth ?? '')) throw new Error('Invalid push encryption keys');
  return { endpoint: url.toString(), keys: { p256dh: input.keys.p256dh, auth: input.keys.auth } };
}

export class PushService {
  private readonly db: DatabaseSync;
  private polling = false;
  private interval?: NodeJS.Timeout;

  constructor(private readonly config: AppConfig, private readonly log: { warn: (data: unknown) => void }) {
    if (!config.push.enabled) throw new Error('Push is not enabled');
    mkdirSync(dirname(config.push.dbPath), { recursive: true });
    this.db = new DatabaseSync(config.push.dbPath);
    if (config.push.dbPath !== ':memory:') chmodSync(config.push.dbPath, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS push_users (
        user_id INTEGER PRIMARY KEY,
        credentials TEXT NOT NULL,
        initialized INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES push_users(user_id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        preferences TEXT NOT NULL,
        last_test_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS push_sub_user ON push_subscriptions(user_id);
      CREATE TABLE IF NOT EXISTS push_issues (
        user_id INTEGER NOT NULL REFERENCES push_users(user_id) ON DELETE CASCADE,
        issue_id INTEGER NOT NULL,
        updated_on TEXT NOT NULL,
        status_id INTEGER NOT NULL,
        priority_id INTEGER NOT NULL,
        start_date TEXT,
        due_date TEXT,
        PRIMARY KEY (user_id, issue_id)
      );
    `);
    webpush.setVapidDetails(config.push.contact, config.push.vapidPublicKey, config.push.vapidPrivateKey);
  }

  private seal(userId: number, creds: CredentialEnvelope): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.config.push.key, iv);
    cipher.setAAD(Buffer.from(`derkumpel-push-user-v1:${userId}`));
    const payload = Buffer.concat([cipher.update(JSON.stringify({ username: creds.username, password: creds.password }), 'utf8'), cipher.final()]);
    return [iv, payload, cipher.getAuthTag()].map((item) => item.toString('base64url')).join('.');
  }

  private open(userId: number, encrypted: string): CredentialEnvelope {
    const parts = encrypted.split('.');
    if (parts.length !== 3) throw new Error('Invalid encrypted push credentials');
    const decipher = createDecipheriv('aes-256-gcm', this.config.push.key, Buffer.from(parts[0]!, 'base64url'));
    decipher.setAAD(Buffer.from(`derkumpel-push-user-v1:${userId}`));
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[1]!, 'base64url')), decipher.final()]).toString('utf8');
    const data = JSON.parse(plaintext) as { username?: string; password?: string };
    if (!data.username || !data.password) throw new Error('Invalid stored push login');
    return { version: 1, username: data.username, password: data.password, issuedAt: Date.now() };
  }

  subscribe(userId: number, creds: CredentialEnvelope, raw: unknown, preferences: unknown): void {
    const sub = validateSubscription(raw);
    const encrypted = this.seal(userId, creds);
    const prefs = JSON.stringify(prefsFromUnknown(preferences));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO push_users (user_id,credentials) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET credentials=excluded.credentials')
        .run(userId, encrypted);
      this.db.prepare(`INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth,preferences)
        VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,preferences=excluded.preferences`)
        .run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, prefs);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  status(userId: number, endpoint: string): { registered: boolean; preferences: PushPreferences } {
    const row = this.db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?').get(endpoint, userId) as SubscriptionRow | undefined;
    return { registered: Boolean(row), preferences: row ? prefsFromUnknown(JSON.parse(row.preferences)) : prefsFromUnknown(null) };
  }

  updatePreferences(userId: number, endpoint: string, preferences: unknown): boolean {
    const result = this.db.prepare('UPDATE push_subscriptions SET preferences=? WHERE endpoint=? AND user_id=?')
      .run(JSON.stringify(prefsFromUnknown(preferences)), endpoint, userId);
    return result.changes > 0;
  }

  unsubscribe(userId: number, endpoint: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(endpoint, userId);
    this.cleanupOrphans();
  }

  private cleanupOrphans(): void {
    this.db.exec('DELETE FROM push_users WHERE user_id NOT IN (SELECT DISTINCT user_id FROM push_subscriptions)');
  }

  private subscriptions(userId: number): SubscriptionRow[] {
    return this.db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(userId) as unknown as SubscriptionRow[];
  }

  private async send(row: SubscriptionRow, payload: NotificationPayload): Promise<boolean> {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(payload), { TTL: 3600, urgency: 'normal', timeout: 10_000 });
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        this.unsubscribe(row.user_id, row.endpoint);
      } else {
        this.log.warn({ message: 'Web Push delivery failed', status: status ?? 'unknown' });
      }
      return false;
    }
  }

  async sendTest(userId: number, endpoint: string): Promise<boolean> {
    const row = this.db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?').get(endpoint, userId) as SubscriptionRow | undefined;
    if (!row) return false;
    if (Date.now() - row.last_test_at < 60_000) throw new Error('Push-Test nur einmal pro Minute möglich');
    this.db.prepare('UPDATE push_subscriptions SET last_test_at=? WHERE endpoint=?').run(Date.now(), endpoint);
    return this.send(row, { title: 'DerKumpel · Test', body: 'Push-Benachrichtigungen sind auf diesem Gerät eingerichtet.',
      url: '/settings', tag: 'derkumpel-test', icon: '/derkumpel-icon-192-v2.png' });
  }

  start(): void {
    // One worker per Compose deployment. Each opted-in user is polled as themselves, not as an admin.
    const run = () => void this.tick();
    setTimeout(run, 15_000).unref();
    this.interval = setInterval(run, this.config.push.pollIntervalMs);
    this.interval.unref();
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.db.close();
  }

  private async tick(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const users = this.db.prepare('SELECT * FROM push_users').all() as unknown as UserRow[];
      for (const row of users) {
        try { await this.pollUser(row); }
        catch (error) {
          if (error instanceof RedmineError && error.status === 401) {
            // A changed Redmine password must invalidate ongoing push access.
            this.db.prepare('DELETE FROM push_users WHERE user_id=?').run(row.user_id);
          } else {
            this.log.warn({ message: 'Push poll skipped (Redmine unavailable or permission changed)', userId: row.user_id });
          }
        }
      }
    } finally { this.polling = false; }
  }

  private async pollUser(user: UserRow): Promise<void> {
    const creds = this.open(user.user_id, user.credentials);
    const remote = await fetchMyWork(this.config, creds, 'open');
    if (remote.user.id !== user.user_id) throw new RedmineError(401, 'Redmine identity changed');
    const before = this.db.prepare('SELECT * FROM push_issues WHERE user_id=?').all(user.user_id) as unknown as SnapshotRow[];
    const index = new Map(before.map((item) => [item.issue_id, {
      issueId: item.issue_id, updatedOn: item.updated_on, statusId: item.status_id,
      priorityId: item.priority_id, startDate: item.start_date, dueDate: item.due_date,
    } satisfies IssueSnapshot]));
    const subs = this.subscriptions(user.user_id);
    const seen = new Set<number>();
    const outbound: Array<{ issueId: number; kinds: PushEventKind[] }> = [];
    const commentWanted = subs.some((item) => prefsFromUnknown(JSON.parse(item.preferences)).comment);

    for (const issueRaw of remote.issues) {
      const issue = issueRaw as unknown as IssueChange;
      if (!Number.isInteger(issue.id) || !issue.updated_on || !issue.status?.id || !issue.priority?.id) continue;
      seen.add(issue.id);
      const prev = index.get(issue.id);
      let hasOtherComment = false;
      if (prev && commentWanted && prev.updatedOn !== issue.updated_on) {
        try {
          const response = await redmineJson<{ issue: { journals?: Array<{ notes?: string; created_on: string; user?: { id: number } }> } }>(
            this.config, creds, `/issues/${issue.id}.json?include=journals`);
          hasOtherComment = (response.issue.journals ?? []).some((journal) =>
            Boolean(journal.notes?.trim()) && journal.user?.id !== user.user_id &&
            Date.parse(journal.created_on) > Date.parse(prev.updatedOn));
        } catch {
          // A specific journal may no longer be visible; never bypass Redmine roles.
        }
      }
      const kinds = compareIssue(prev, issue, hasOtherComment);
      if (user.initialized && kinds.length > 0) outbound.push({ issueId: issue.id, kinds });
      const next = toSnapshot(issue);
      this.db.prepare(`INSERT INTO push_issues (user_id,issue_id,updated_on,status_id,priority_id,start_date,due_date)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,issue_id) DO UPDATE SET
        updated_on=excluded.updated_on,status_id=excluded.status_id,priority_id=excluded.priority_id,
        start_date=excluded.start_date,due_date=excluded.due_date`)
        .run(user.user_id, next.issueId, next.updatedOn, next.statusId, next.priorityId, next.startDate, next.dueDate);
    }
    for (const old of before) if (!seen.has(old.issue_id)) {
      // A ticket that was just closed disappears from "open" immediately. Recheck only
      // with this user's Redmine rights; notify on closure only if they remain assigned.
      if (user.initialized && subs.some((sub) => prefsFromUnknown(JSON.parse(sub.preferences)).status)) {
        try {
          const result = await redmineJson<{ issue: {
            id: number; status: { id: number }; assigned_to?: { id: number };
            closed_on?: string; updated_on: string;
          } }>(this.config, creds, `/issues/${old.issue_id}.json`);
          const ticket = result.issue;
          const assignee = ticket.assigned_to?.id;
          const stillAssigned = assignee === user.user_id ||
            (remote.user.groups ?? []).some((group) => group.id === assignee);
          if (ticket.closed_on && stillAssigned && ticket.status.id !== old.status_id) {
            outbound.push({ issueId: old.issue_id, kinds: ['status'] });
          }
        } catch {
          // 403/404 => user no longer sees this issue; never disclose it in a push.
        }
      }
      this.db.prepare('DELETE FROM push_issues WHERE user_id=? AND issue_id=?').run(user.user_id, old.issue_id);
    }
    if (!user.initialized) this.db.prepare('UPDATE push_users SET initialized=1 WHERE user_id=?').run(user.user_id);
    for (const change of outbound.slice(0, 25)) {
      for (const sub of subs) {
        const kind = firstEnabledEvent(change.kinds, prefsFromUnknown(JSON.parse(sub.preferences)));
        if (!kind) continue;
        await this.send(sub, { ...notificationText(kind),
          url: `/issues/${change.issueId}`, tag: `derkumpel-issue-${change.issueId}`,
          icon: '/derkumpel-icon-192-v2.png' });
      }
    }
  }
}
