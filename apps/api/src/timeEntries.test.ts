import { describe, expect, it } from 'vitest';
import { validateTimeEntry, timeEntryPayload } from './timeEntries.js';

describe('validated Redmine time entries', () => {
  const example = { issueId: 123, activityId: 8, hours: 1.25, spentOn: '2026-11-15', comments: 'Vor-Ort-Arbeit' };
  it('maps only an explicit issue-scoped time entry', () => {
    expect(timeEntryPayload(validateTimeEntry({ ...example, user_id: 5 }))).toEqual({
      time_entry: { issue_id: 123, activity_id: 8, hours: 1.25, spent_on: '2026-11-15', comments: 'Vor-Ort-Arbeit' },
    });
  });
  it.each([-1, 0, 25, Number.NaN, Number.POSITIVE_INFINITY, '1', 1.999])(
    'rejects invalid hours %s', (hours) => {
      expect(() => validateTimeEntry({ ...example, hours })).toThrow();
    }
  );
  it.each(['2026-02-30', '2026-13-01', '2026-11-15T00:00:00Z', '', null])(
    'rejects invalid spent-on date %s', (spentOn) => {
      expect(() => validateTimeEntry({ ...example, spentOn })).toThrow();
    }
  );
  it('rejects unauthorized account selection by excluding additional fields', () => {
    const value = validateTimeEntry({ ...example, user_id: 9001, project_id: 2 });
    expect(timeEntryPayload(value).time_entry).not.toHaveProperty('user_id');
    expect(timeEntryPayload(value).time_entry).not.toHaveProperty('project_id');
  });
  it('rejects overlong Redmine comments and invalid activity IDs', () => {
    expect(() => validateTimeEntry({ ...example, comments: 'x'.repeat(256) })).toThrow();
    expect(() => validateTimeEntry({ ...example, activityId: -1 })).toThrow();
  });
});
