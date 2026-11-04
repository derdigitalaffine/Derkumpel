import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppConfig } from './config.js';
import type { PushEvent, PushKind, PushRegistry } from './push.js';

/** Admin API credentials stay server-side. Requests never follow redirects. */
export interface RedminePollApi {
  get<T>(path: string, impersonate?: string): Promise<T>;
}
type Ref = { id: number; name?: string };
type UserRecord = { id: number; login?: string; status?: number; groups?: Ref[] };
type Journal = {
  id: number; created_on: string; user?: Ref; notes?: string; private_notes?: boolean;
  details?: Array<{ property?: string; name?: string }>;
};
type Issue = {
  id: number; created_on?: string; updated_on?: string;
  assigned_to?: Ref; author?: Ref; journals?: Journal[];
};
type PollState = { startedAt: string; cursor: string };
type Candidate = { event: PushEvent; actor?: number; privateJournalId?: number };
type Delivery = Pick<PushRegistry, 'subscribedUserIds' | 'dispatch'>;

function timestamp(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  return Date.parse(value);
}

export function derivePollEvents(issue: Issue, from: number, until: number): Candidate[] {
  if (!Number.isSafeInteger(issue.id) || issue.id <= 0) return [];
  const created = timestamp(issue.created_on);
  if (Number.isFinite(created) && created >= from && created <= until) {
    return issue.assigned_to
      ? [{ event: { event_id: 'poll-create-' + issue.id + '-assigned', issue_id: issue.id, kind: 'assignment', user_ids: [] }, actor: issue.author?.id }]
      : [];
  }
  const result: Candidate[] = [];
  for (const journal of issue.journals ?? []) {
    const time = timestamp(journal.created_on);
    if (!Number.isSafeInteger(journal.id) || !Number.isFinite(time) || time < from || time > until) continue;
    const kinds = new Set<PushKind>();
    for (const detail of journal.details ?? []) {
      if (detail.property !== 'attr') continue;
      if (detail.name === 'assigned_to_id') kinds.add('assignment');
      if (detail.name === 'status_id') kinds.add('status');
      if (detail.name === 'priority_id') kinds.add('priority');
      if (detail.name === 'start_date' || detail.name === 'due_date') kinds.add('dates');
    }
    if (journal.notes?.trim()) kinds.add('comment');
    for (const kind of kinds) {
      result.push({
        event: {
          event_id: 'poll-' + issue.id + '-' + journal.id + '-' + kind,
          issue_id: issue.id,
          kind,
          user_ids: [],
        },
        actor: journal.user?.id,
        privateJournalId: kind === 'comment' && journal.private_notes ? journal.id : undefined,
      });
    }
  }
  return result;
}

/** Enforces Redmine's own permissions with admin-only X-Redmine-Switch-User. */
export async function authorizedRecipients(
  issue: Issue,
  candidate: Candidate,
  subscribed: number[],
  api: RedminePollApi,
  users: Map<number, UserRecord | null>,
  verifiedUsers: Set<number> = new Set(),
  issueViews: Map<string, Set<number> | null> = new Map(),
): Promise<number[]> {
  if (!issue.assigned_to || !Number.isSafeInteger(issue.assigned_to.id)) return [];
  const recipients: number[] = [];
  for (const id of subscribed) {
    if (id === candidate.actor) continue;
    let user = users.get(id);
    if (user === undefined) {
      try {
        const response = await api.get<{ user: UserRecord }>('/users/' + id + '.json?include=groups');
        user = response.user?.id === id && response.user.status === 1 && typeof response.user.login === 'string'
          ? response.user : null;
      } catch (error) {
        if (error instanceof RedminePollHttpError && [404, 412].includes(error.status)) user = null;
        else throw error;
      }
      users.set(id, user);
    }
    if (!user?.login) continue;
    const isAssignee = issue.assigned_to.id === id ||
      (user.groups ?? []).some((group) => group.id === issue.assigned_to?.id);
    if (!isAssignee) continue;

    // Verify impersonation once per recipient per polling cycle. If a reverse
    // proxy ignores this header, no push must be sent using administrator rights.
    if (!verifiedUsers.has(id)) {
      const current = await api.get<{ user: { id: number } }>('/users/current.json', user.login);
      if (current.user?.id !== id) throw new Error('Redmine API did not honor user impersonation; push polling halted');
      verifiedUsers.add(id);
    }

    const viewKey = issue.id + ':' + id;
    let journalIds = issueViews.get(viewKey);
    if (journalIds === undefined) {
      try {
        const visible = await api.get<{ issue: Issue }>('/issues/' + issue.id + '.json?include=journals', user.login);
        journalIds = visible.issue?.id === issue.id
          ? new Set((visible.issue.journals ?? []).map((journal) => journal.id)) : null;
      } catch (error) {
        if (error instanceof RedminePollHttpError && [403, 404, 412].includes(error.status)) journalIds = null;
        else throw error;
      }
      issueViews.set(viewKey, journalIds);
    }
    if (!journalIds) continue;
    if (candidate.privateJournalId !== undefined && !journalIds.has(candidate.privateJournalId)) continue;
    recipients.push(id);
  }
  return recipients;
}

export class RedminePollHttpError extends Error {
  constructor(public readonly status: number) {
    super('Redmine REST polling request failed (' + status + ')');
  }
}

export function createRedminePollApi(config: AppConfig): RedminePollApi {
  const base = config.redmineBaseUrl;
  const key = config.push.pollingApiKey;
  return {
    async get<T>(path: string, impersonate?: string): Promise<T> {
      const url = new URL(path, base);
      if (url.origin !== base.origin || !url.pathname.startsWith('/')) throw new Error('Invalid Redmine REST URL');
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Redmine-API-Key': key,
      };
      if (impersonate) headers['X-Redmine-Switch-User'] = impersonate;
      const response = await fetch(url, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(config.redmineTimeoutMs),
      });
      if (!response.ok) throw new RedminePollHttpError(response.status);
      if (Number(response.headers.get('content-length') ?? 0) > 4 * 1024 * 1024)
        throw new Error('Redmine polling response exceeds size limit');
      const body = await response.text();
      if (body.length > 4 * 1024 * 1024) throw new Error('Redmine polling response exceeds size limit');
      return JSON.parse(body) as T;
    },
  };
}

export class RedminePushPoller {
  private state: PollState | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private working = false;
  private validatedAdmin = false;

  constructor(
    private readonly registry: Delivery,
    private readonly api: RedminePollApi,
    private readonly stateFile: string,
    private readonly intervalSeconds: number,
    private readonly log: (message: string) => void,
    private readonly now: () => number = () => Date.now(),
  ) {
    mkdirSync(dirname(stateFile), { recursive: true, mode: 0o700 });
    if (existsSync(stateFile)) {
      const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as PollState;
      if (!Number.isFinite(timestamp(parsed.startedAt)) || !Number.isFinite(timestamp(parsed.cursor)))
        throw new Error('Invalid persistent Redmine polling cursor');
      this.state = parsed;
    }
  }

  private persist(): void {
    if (!this.state) return;
    const temp = this.stateFile + '.tmp';
    writeFileSync(temp, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(temp, this.stateFile);
  }

  private async requireAdmin(): Promise<void> {
    if (this.validatedAdmin) return;
    // /users.json is admin-only in Redmine 5; a regular account must fail closed.
    const check = await this.api.get<{ users: UserRecord[] }>('/users.json?limit=1');
    if (!Array.isArray(check.users)) throw new Error('Redmine polling requires an administrator API key');
    this.validatedAdmin = true;
  }

  async runOnce(): Promise<number> {
    if (this.working) return 0;
    this.working = true;
    try {
      await this.requireAdmin();
      const now = this.now();
      if (!this.state) {
        const startedAt = new Date(now).toISOString();
        this.state = { startedAt, cursor: startedAt };
        this.persist(); // Bootstrap: no flood of old ticket events.
        return 0;
      }
      const cutoff = now - 8_000;
      if (cutoff <= timestamp(this.state.cursor)) return 0;
      // Web Push is best-effort. After a very long outage or a switch away from
      // polling, skip stale notifications rather than replaying days of changes.
      if (now - timestamp(this.state.cursor) > 12 * 3_600_000) {
        const boundary = new Date(now).toISOString();
        this.state = { startedAt: boundary, cursor: boundary };
        this.persist();
        this.log('Redmine polling backlog older than 12 hours was skipped; current cursor reinitialized');
        return 0;
      }
      const subscribed = this.registry.subscribedUserIds();
      if (!subscribed.length) {
        this.state.cursor = new Date(cutoff).toISOString();
        this.persist();
        return 0;
      }
      const from = Math.max(timestamp(this.state.startedAt), timestamp(this.state.cursor) - 60_000);
      const params = new URLSearchParams({
        updated_on: '>=' + new Date(from).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        status_id: '*',
        sort: 'updated_on:asc,id:asc',
        limit: '100',
      });
      const issues: Issue[] = [];
      for (let offset = 0; ; offset += 100) {
        params.set('offset', String(offset));
        const page = await this.api.get<{ issues: Issue[]; total_count: number }>('/issues.json?' + params);
        if (!Array.isArray(page.issues)) throw new Error('Invalid issue list response from Redmine');
        issues.push(...page.issues);
        if (issues.length > 1500 || page.total_count > 1500)
          throw new Error('Redmine polling backlog exceeds 1500 issues; cursor kept for safe retry');
        if (offset + page.issues.length >= (page.total_count ?? issues.length) || !page.issues.length) break;
      }
      const users = new Map<number, UserRecord | null>();
      const verifiedUsers = new Set<number>();
      const issueViews = new Map<string, Set<number> | null>();
      let delivered = 0;
      for (const summary of issues) {
        const updated = timestamp(summary.updated_on);
        if (!Number.isFinite(updated) || updated > cutoff) continue;
        if (!Number.isSafeInteger(summary.id) || summary.id < 1) continue;
        const detail = await this.api.get<{ issue: Issue }>('/issues/' + summary.id + '.json?include=journals');
        const issue = detail.issue;
        if (!issue || issue.id !== summary.id) continue;
        for (const candidate of derivePollEvents(issue, from, cutoff)) {
          candidate.event.user_ids = await authorizedRecipients(issue, candidate, subscribed, this.api, users, verifiedUsers, issueViews);
          if (!candidate.event.user_ids.length) continue;
          const result = await this.registry.dispatch(candidate.event);
          if (result.failed) throw new Error('Push provider temporarily unavailable; cursor kept for retry');
          delivered += result.delivered;
        }
      }
      this.state.cursor = new Date(cutoff).toISOString();
      this.persist();
      return delivered;
    } finally {
      this.working = false;
    }
  }

  start(): void {
    if (this.timer) return;
    const run = () => {
      void this.runOnce().catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : 'unknown';
        this.log('Redmine push polling failed: ' + detail);
      });
    };
    run();
    this.timer = setInterval(run, this.intervalSeconds * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
