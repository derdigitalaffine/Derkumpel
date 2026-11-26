import {describe,it,expect} from 'vitest';
import {displayDate,parseDisplayDate,displayStamp,shiftMonth,primaryReport,type RapportReport} from './rapportBook';
describe('German rapport presentation',()=>{
 it('uses four-digit years and validates German input',()=>{expect(displayDate('2026-11-26')).toBe('26.11.2026');expect(parseDisplayDate('29.02.2024')).toBe('2024-02-29');expect(parseDisplayDate('29.02.2026')).toBe('');expect(parseDisplayDate('2026-11-26')).toBe('');expect(displayStamp('2026-12-31T23:30:00Z')).toBe('01.01.2027 · 00:30');});
 it('moves archive by calendar months',()=>{expect(shiftMonth('2026-01-31',1)).toBe('2026-02-01');expect(shiftMonth('2026-12-31',1)).toBe('2027-01-01');});
 it('selects only the effective own daily report',()=>{const base={id:1,date:'2026-11-26',owner:{id:5,name:'A'},state:'closed',lines:[]} as RapportReport;const correction={...base,id:2,state:'draft',correction:{reportId:1}} as RapportReport;expect(primaryReport([base,correction],base.date,5)?.id).toBe(1);expect(primaryReport([base,{...correction,state:'closed'}],base.date,5)?.id).toBe(2);expect(primaryReport([base],base.date,9)).toBeUndefined();});
});
