export type Person={id:number;name:string};
export type RapportLine={sources?:{id:number;subject:string}[];sourceIds?:number[];id:string;start:string;end:string;kind:'work'|'pause';activity:string;order:string;machines:{name:string;minutes:number}[];materials:{name:string;quantity:number;unit:string}[];recordedBy?:Person;recordedAt?:string};
export type RapportReport={id:number;version:1;owner:Person;date:string;state:'draft'|'submitted'|'review'|'returned'|'closed';revision:string;lines:RapportLine[];material:string;submitted?:{by:Person;at:string};reviewed?:{by:Person;at:string};returnNote?:string;history?:{by:string;at:string;note:string}[]};
export type Catalog={machines:{id:number;name:string}[];materials:{id:number;name:string}[]};
export const stateLabels={draft:'Entwurf',submitted:'Eingereicht',review:'In Prüfung',returned:'Zurückgegeben',closed:'Abgeschlossen'};
export const lineMinutes=(line:RapportLine)=>Math.round((Date.parse(line.end)-Date.parse(line.start))/60000);
export const sumWork=(r:RapportReport)=>r.lines.filter(l=>l.kind==='work').reduce((n,l)=>n+Math.max(0,lineMinutes(l)||0),0);
export const inputTime=(s:string)=>{const d=new Date(s);if(!Number.isFinite(d.getTime()))return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d).replace(' ','T');};
// Resolve Berlin civil time, reject nonexistent/ambiguous DST times unless the original instant is retained.
export function fromInputTime(s:string,previous?:string):string {
  if(previous&&inputTime(previous)===s)return previous;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))return '';
  const utc=Date.parse(s+'Z');if(!Number.isFinite(utc))return '';
  const candidates=[60,120].map(offset=>new Date(utc-offset*60000).toISOString()).filter(t=>inputTime(t)===s);
  return candidates.length===1?candidates[0]!:'';
}
export const today=()=>inputTime(new Date().toISOString()).slice(0,10);
export function shiftDay(d:string,days:number){const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function weekStart(d:string){const weekday=new Date(d+'T12:00:00Z').getUTCDay();return shiftDay(d,-((weekday+6)%7));}
