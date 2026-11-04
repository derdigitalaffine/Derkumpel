import { describe, expect, it } from 'vitest';
import { compareIssue, DEFAULT_PUSH_PREFERENCES, firstEnabledEvent, notificationText, prefsFromUnknown, toSnapshot } from './push-events.js';

const issue = {
  id: 42, updated_on: '2026-11-04T11:30:00Z', status: { id: 2 }, priority: { id: 2 },
  start_date: '2026-11-04', due_date: '2026-11-09',
};
describe('permission-scoped push event detection', () => {
  it('sends only a new assignment for a previously unknown issue', () => {
    expect(compareIssue(undefined, issue, false)).toEqual(['assignment']);
  });
  it('does not notify on unchanged ticket snapshots', () => {
    expect(compareIssue(toSnapshot(issue), issue, false)).toEqual([]);
  });
  it('classifies status/priority/date and new journal notes without duplication', () => {
    const prior = toSnapshot(issue);
    const modified = { ...issue, updated_on: '2026-11-04T12:00:00Z',
      status: { id: 3 }, priority: { id: 4 }, due_date: '2026-11-10' };
    expect(compareIssue(prior, modified, true)).toEqual(['comment', 'status', 'priority', 'dates']);
    expect(compareIssue(prior, modified, false)).toEqual(['status', 'priority', 'dates']);
  });
  it('respects each device’s opt-in category switches', () => {
    const prefs = { ...DEFAULT_PUSH_PREFERENCES, comment: false, status: false };
    expect(firstEnabledEvent(['comment', 'status', 'dates'], prefs)).toBe('dates');
    expect(firstEnabledEvent(['comment'], prefs)).toBeUndefined();
  });
  it('never trusts malformed preferences and uses conservative known fields', () => {
    expect(prefsFromUnknown({ comment: false, evil: true }).comment).toBe(false);
    expect(prefsFromUnknown({ dates: 'false' }).dates).toBe(true);
  });
  it('keeps lock-screen payloads free of ticket descriptions', () => {
    expect(notificationText('assignment').body).not.toContain('#42');
    expect(notificationText('priority').title).toBe('Priorität geändert');
  });
});
