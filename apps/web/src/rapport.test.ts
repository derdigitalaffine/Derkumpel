import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration, fullDayMinutes, makeRapportEntries, parseLocalStart, rankRapportPeople } from './rapport';
describe('rapport draft', () => {
  it('handles exact minutes and decimal hours', () => {
    expect(fullDayMinutes('2026-11-23')).toBe(510);
    expect(fullDayMinutes('2026-11-24')).toBe(510);
    expect(fullDayMinutes('2026-11-25')).toBe(510);
    expect(fullDayMinutes('2026-11-26')).toBe(510);
    expect(fullDayMinutes('2026-11-27')).toBe(300);
    expect(fullDayMinutes('2026-11-28')).toBe(0);
    expect(fullDayMinutes('2026-11-29')).toBe(0);
    expect(fullDayMinutes('2026-02-30')).toBe(0);
    expect(formatDuration(510)).toBe('8:30');
    expect(parseDuration('8,5')).toBe(510);
    expect(parseDuration('8:30')).toBe(510);
    expect(parseDuration('7:60')).toBeNull();
    expect(parseDuration('24:01')).toBeNull();
  });
  it('creates one entry per eligible selected person, with immutable recorder attribution', () => {
    const a = { id: 1, name: 'A' }, b = { id: 2, name: 'B' };
    const rows = makeRapportEntries([a,b,b], [1,2,2,99], a, 510, ' Grünpflege ', '2026-11-26T08:00:00Z', '2026-11-26T07:00:00Z');
    expect(rows).toEqual([a,b].map(employee => ({employee, recordedBy:a, minutes:510, activity:'Grünpflege', recordedAt:'2026-11-26T08:00:00Z', startAt:'2026-11-26T07:00:00.000Z', endAt:'2026-11-26T15:30:00.000Z'})));
    expect(makeRapportEntries([b], [2], a, 15, ' ', 'now', '2026-11-26T07:00:00Z')[0]?.activity).toBeUndefined();
    expect(makeRapportEntries([b], [2], a, 0, '', 'now', '2026-11-26T07:00:00Z')).toEqual([]);
  });
});

it('validates date/time and ranks favorites above frequently chosen staff', () => {
  expect(parseLocalStart('2026-02-30','08:00')).toBeNull();
  expect(parseLocalStart('2026-11-26','08:07')).not.toBeNull();
  expect(rankRapportPeople([{id:1,name:'A'},{id:2,name:'B'},{id:3,name:'C'}],[3],{2:5}).map(p=>p.id)).toEqual([3,2,1]);
});
