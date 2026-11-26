import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration, fullDayMinutes, makeRapportEntries } from './rapport';
describe('rapport draft', () => {
  it('handles exact minutes and decimal hours', () => {
    expect(fullDayMinutes).toBe(468);
    expect(formatDuration(468)).toBe('7:48');
    expect(parseDuration('7,8')).toBe(468);
    expect(parseDuration('7:48')).toBe(468);
    expect(parseDuration('7:60')).toBeNull();
    expect(parseDuration('24:01')).toBeNull();
  });
  it('creates one entry per eligible selected person, with immutable recorder attribution', () => {
    const a = { id: 1, name: 'A' }, b = { id: 2, name: 'B' };
    const rows = makeRapportEntries([a,b,b], [1,2,2,99], a, 468, ' Grünpflege ', '2026-11-26T08:00:00Z');
    expect(rows).toEqual([a,b].map(employee => ({employee, recordedBy:a, minutes:468, activity:'Grünpflege', recordedAt:'2026-11-26T08:00:00Z'})));
    expect(makeRapportEntries([b], [2], a, 15, ' ', 'now')[0].activity).toBeUndefined();
    expect(makeRapportEntries([b], [2], a, 0, '', 'now')).toEqual([]);
  });
});
