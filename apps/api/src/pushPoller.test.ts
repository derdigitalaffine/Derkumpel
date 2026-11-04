import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authorizedRecipients, derivePollEvents, RedminePollHttpError,
  RedminePushPoller, type RedminePollApi,
} from './pushPoller.js';
import type { PushEvent } from './push.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const issue = {
  id: 47,
  created_on: '2026-10-01T10:00:00Z',
  updated_on: '2026-11-04T12:01:00Z',
  assigned_to: { id: 80, name: 'Bauhof-Gruppe' },
  journals: [{
    id: 99,
    created_on: '2026-11-04T12:01:00Z',
    user: { id: 9 },
    notes: 'private text',
    private_notes: true,
    details: [
      { property: 'attr', name: 'status_id' },
      { property: 'attr', name: 'priority_id' },
      { property: 'attr', name: 'due_date' },
    ],
  }],
};

const fakeApi: RedminePollApi = {
  async get<T>(path, login) {
    if (path === '/users.json?limit=1') return { users: [{ id: 1 }] } as T;
    if (path.startsWith('/issues.json?')) return { issues: [issue], total_count: 1 } as T;
    if (path === '/issues/47.json?include=journals') {
      if (login === 'blocked') throw new RedminePollHttpError(404);
      if (login === 'other') return { issue: { ...issue, journals: [] } } as T;
      return { issue } as T;
    }
    if (path === '/users/2.json?include=groups')
      return { user: { id: 2, status: 1, login: 'member', groups: [{ id: 80 }] } } as T;
    if (path === '/users/3.json?include=groups')
      return { user: { id: 3, status: 1, login: 'other', groups: [{ id: 80 }] } } as T;
    if (path === '/users/4.json?include=groups')
      return { user: { id: 4, status: 1, login: 'blocked', groups: [{ id: 80 }] } } as T;
    if (path === '/users/9.json?include=groups')
      return { user: { id: 9, status: 1, login: 'actor', groups: [{ id: 80 }] } } as T;
    if (path === '/users/current.json') {
      const ids: Record<string, number> = { member: 2, other: 3, blocked: 4, actor: 9 };
      return { user: { id: ids[login ?? ''] } } as T;
    }
    throw new Error('unexpected Redmine query: ' + path);
  },
};

describe('pluginless Redmine push polling', () => {
  it('recognizes journal changes and keeps private comments separate', () => {
    const events = derivePollEvents(issue, Date.parse('2026-11-04T12:00:00Z'), Date.parse('2026-11-04T12:02:00Z'));
    expect(events.map((entry) => entry.event.kind)).toEqual(['status', 'priority', 'dates', 'comment']);
    expect(events.find((entry) => entry.event.kind === 'comment')?.privateJournalId).toBe(99);
    expect(events.find((entry) => entry.event.kind === 'status')?.privateJournalId).toBeUndefined();
    expect(events.some((entry) => JSON.stringify(entry).includes('private text'))).toBe(false);
  });

  it('does not flood phones when the first poll follows an older created ticket', () => {
    expect(derivePollEvents(issue, Date.parse('2026-11-05'), Date.parse('2026-11-06'))).toHaveLength(0);
    expect(derivePollEvents({ ...issue, id: 52, created_on: '2026-11-04T12:01:00Z' },
      Date.parse('2026-11-04T12:00:00Z'), Date.parse('2026-11-04T12:02:00Z')).map((entry) => entry.event.kind))
      .toEqual(['assignment']);
  });

  it('uses group membership and user impersonation; private notes require visible journals', async () => {
    const events = derivePollEvents(issue, Date.parse('2026-11-04T12:00:00Z'), Date.parse('2026-11-04T12:02:00Z'));
    const users = new Map();
    const publicRecipients = await authorizedRecipients(issue, events[0]!, [2, 3, 4, 9], fakeApi, users);
    expect(publicRecipients).toEqual([2, 3]);
    const privateRecipients = await authorizedRecipients(issue, events[3]!, [2, 3, 4, 9], fakeApi, users);
    expect(privateRecipients).toEqual([2]);
  });

  it('halts delivery if Redmine ignores impersonation', async () => {
    const wrongApi: RedminePollApi = {
      get: async <T>(path: string, login?: string): Promise<T> =>
        path === '/users/current.json' && login ? { user: { id: 1 } } as T : fakeApi.get<T>(path, login),
    };
    const candidate = derivePollEvents(issue, Date.parse('2026-11-04T12:00:00Z'), Date.parse('2026-11-04T12:02:00Z'))[0]!;
    await expect(authorizedRecipients(issue, candidate, [2], wrongApi, new Map()))
      .rejects.toThrow('impersonation');
  });

  it('bootstraps without old-event spam, saves its cursor and delivers only to authorized users', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dk-poll-test-'));
    dirs.push(dir);
    const file = join(dir, 'poll-state.json');
    const sent: PushEvent[] = [];
    let now = Date.parse('2026-11-04T12:00:00Z');
    const registry = {
      subscribedUserIds: () => [2, 3, 4, 9],
      dispatch: async (event: PushEvent) => {
        sent.push(event);
        return { delivered: event.user_ids.length, failed: 0, duplicate: false };
      },
    };
    const poller = new RedminePushPoller(registry, fakeApi, file, 90, () => undefined, () => now);
    expect(await poller.runOnce()).toBe(0);
    expect(sent).toHaveLength(0);
    now = Date.parse('2026-11-04T12:02:00Z');
    const delivered = await poller.runOnce();
    expect(delivered).toBe(7); // 3 public event kinds * two recipients + one private comment
    expect(sent.find((event) => event.kind === 'comment')?.user_ids).toEqual([2]);
    expect(JSON.parse(readFileSync(file, 'utf8')).cursor).toBe('2026-11-04T12:01:52.000Z');
    poller.stop();
  });
});
