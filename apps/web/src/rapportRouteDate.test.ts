import {describe,it,expect} from 'vitest';
import {rapportDatePath,rapportRouteDate,fromInputTime,inputTime} from './rapportBook';
import {fullDayMinutes} from './rapport';
describe('rapport date navigation',()=>{
 it('passes the selected past day to capture and back to the day view',()=>{
  const selected='2026-11-20',fallback='2026-11-26';
  const capture=new URL(rapportDatePath('/rapport',selected),'https://example.test');
  const date=rapportRouteDate(capture.searchParams.get('date'),fallback);
  expect(date).toBe(selected);
  expect(inputTime(fromInputTime(date+'T07:15'))).toBe(selected+'T07:15');
  expect(fullDayMinutes(date)).toBe(300);
  expect(rapportDatePath('/rapport/book',date)).toBe('/rapport/book?date=2026-11-20');
 });
 it('validates actual calendar days and defaults only for absent or invalid parameters',()=>{
  expect(rapportRouteDate(null,'2026-11-26')).toBe('2026-11-26');
  expect(rapportRouteDate('2026-02-30','2026-11-26')).toBe('2026-11-26');
  expect(rapportRouteDate('2024-02-29','2026-11-26')).toBe('2024-02-29');
  expect(rapportRouteDate('2026-11-28','2026-11-26')).toBe('2026-11-28');
 });
});
