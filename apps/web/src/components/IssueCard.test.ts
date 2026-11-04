import { describe, expect, it } from 'vitest';
import { dueInfo } from './IssueCard';

describe('mobile issue due-date cues', () => {
  const today = new Date('2026-11-04T12:00:00Z');

  it('does not turn missing dates into false warnings', () => {
    expect(dueInfo(undefined, today).label).toBeUndefined();
    expect(dueInfo(undefined, today).urgent).toBe(false);
  });

  it('marks past dates overdue, due today urgent and tomorrow as upcoming', () => {
    expect(dueInfo('2026-11-03', today)).toMatchObject({ color: 'red', urgent: true });
    expect(dueInfo('2026-11-04', today)).toMatchObject({ label: 'Heute fällig', color: 'orange', urgent: true });
    expect(dueInfo('2026-11-05', today)).toMatchObject({ label: 'Morgen fällig', urgent: false });
  });

  it('keeps distant dates neutral', () => {
    expect(dueInfo('2026-11-17', today)).toMatchObject({ color: 'gray', urgent: false });
  });
});
