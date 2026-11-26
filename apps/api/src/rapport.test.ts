import {describe,it,expect} from 'vitest';
import {validDate,target,validateLines} from './rapport.js';
import {rapportPdf} from './rapportPdf.js';
describe('rapport',()=>{
  it('uses weekday targets and rejects invalid dates',()=>{expect(validDate('2026-02-30')).toBe(false);expect(target('2026-11-26')).toBe(510);expect(target('2026-11-27')).toBe(300);expect(target('2026-11-28')).toBe(0);});
  it('rejects overlaps and missing activity at submission',()=>{const l={id:'abcdefgh',kind:'work' as const,start:'2026-11-26T06:00:00Z',end:'2026-11-26T07:00:00Z',activity:'',order:'',machines:[],materials:[],recordedBy:{id:1,name:'A'},recordedAt:'2026-11-26T07:00:00Z'};expect(()=>validateLines([l],'2026-11-26',true)).toThrow();expect(()=>validateLines([l,{...l,id:'ijklmnop'}],'2026-11-26',false)).toThrow();expect(()=>validateLines([{...l,activity:'Grünpflege'}],'2026-11-26',true)).not.toThrow();});
  it('creates a PDF with multiple pages for long reports',()=>{const bytes=rapportPdf({date:'2026-11-26',owner:{name:'Müller'},state:'closed',material:'',lines:Array.from({length:8},()=>({start:'2026-11-26T06:00:00Z',end:'2026-11-26T07:00:00Z',kind:'work',activity:'Grünpflege',order:'',machines:[],materials:[]}))});expect(bytes.toString().startsWith('%PDF-1.4')).toBe(true);expect(bytes.toString()).toContain('/Count 2');});
});
