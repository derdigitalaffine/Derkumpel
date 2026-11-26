import {createHash} from 'node:crypto';
export type ResourceUsage={code?:string;name:string;unit:string;quantity:number;note:string;kind?:'machine'|'material'};
type ResourceLine={name:string;minutes:number};
type MaterialLine={name:string;quantity:number;unit:string;note?:string};
const clean=(s:string)=>s.replace(/[\r\n]/g,' ').replace(/</g,'‹').replace(/>/g,'›');
const fmt=(n:number)=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
export function resourceText(machines:ResourceLine[],materials:MaterialLine[]):string[]{
 return [...machines.map(m=>clean(m.name)+' war '+fmt(m.minutes)+' h im Einsatz.'),...materials.map(m=>'Es wurden '+m.quantity.toLocaleString('de-DE',{maximumFractionDigits:8})+' '+clean(m.unit)+' '+clean(m.name)+' verbraucht / verbaut.'+(m.note?' ('+clean(m.note)+')':''))];
}
export function usageText(usage:ResourceUsage[]){return usage.flatMap(u=>u.kind==='machine'?[clean(u.name)+' war '+fmt(u.quantity)+' h im Einsatz.'+(u.note?' ('+clean(u.note)+')':'')]:resourceText([], [u]));}
export function noteMarker(scope:string,issue:number,body:string){return '[DK-Ressourcen '+scope+' '+issue+' '+createHash('sha256').update(body).digest('hex').slice(0,24)+']';}
export function orderTicket(order:string){const m=/^#([1-9]\d*)$/.exec(order.trim());const id=m?Number(m[1]):0;return Number.isSafeInteger(id)?id:0;}
