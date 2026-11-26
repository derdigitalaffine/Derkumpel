export type Person={id:number;name:string};
export type RapportLine={greenEventId?:number;sources?:{id:number;subject:string;municipalities?:string[]}[];sourceIds?:number[];id:string;start:string;end:string;kind:'work'|'pause';activity:string;order:string;machines:{name:string;minutes:number}[];materials:{name:string;quantity:number;unit:string}[];recordedBy?:Person;recordedAt?:string};
export type RapportReport={correction?:{reportId:number;reason:string;createdBy:Person;createdAt:string};id:number;version:1;owner:Person;date:string;state:'draft'|'submitted'|'review'|'returned'|'closed';revision:string;lines:RapportLine[];material:string;submitted?:{by:Person;at:string};reviewed?:{by:Person;at:string};returnNote?:string;history?:{by:string;at:string;note:string}[]};
export type Catalog={equipmentRows?:string[];materialRows?:import('./green').MaterialItem[];machines:{id:number;name:string}[];materials:{id:number;name:string}[]};
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

// Closed amendments supersede their predecessor only after approval. Draft amendments never double-count time.
export function effectiveReports(reports:RapportReport[]){const superseded=new Set(reports.filter(r=>r.state==='closed'&&r.correction).map(r=>r.correction!.reportId));return reports.filter(r=>!superseded.has(r.id)&&(!r.correction||r.state==='closed'));}

export function displayDate(date:string):string {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match?match[3]+'.'+match[2]+'.'+match[1]:'–';
}
export function parseDisplayDate(value:string):string {
  const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if(!m)return '';
  const iso=m[3]+'-'+m[2]+'-'+m[1],t=Date.parse(iso+'T12:00:00Z');
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===iso?iso:'';
}
export function displayStamp(value:string):string {
  const local=inputTime(value);
  return local?displayDate(local.slice(0,10))+' · '+local.slice(11):'–';
}
export function weekdayLabel(date:string,short=false):string {
  return new Intl.DateTimeFormat('de-DE',{weekday:short?'short':'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
}
export function shiftMonth(date:string,months:number):string {
  const d=new Date(date.slice(0,7)+'-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth()+months);
  return d.toISOString().slice(0,10);
}
export function primaryReport(reports:RapportReport[],date:string,ownerId:number):RapportReport|undefined {
  const effective=effectiveReports(reports.filter(r=>r.date===date&&r.owner.id===ownerId));
  return effective.length===1?effective[0]:undefined;
}

export const quarterHours=Array.from({length:96},(_,i)=>String(Math.floor(i/4)).padStart(2,'0')+':'+String(i%4*15).padStart(2,'0'));
export const isQuarterInstant=(value:string)=>Number.isFinite(Date.parse(value))&&Date.parse(value)%900000===0;
export function floorQuarterInstant(value:string):string {const ms=Date.parse(value);return Number.isFinite(ms)?new Date(Math.floor(ms/900000)*900000).toISOString():'';}
export function ceilQuarterInstant(value:string):string {const ms=Date.parse(value);return Number.isFinite(ms)?new Date(Math.ceil(ms/900000)*900000).toISOString():'';}
export function quarterOptions(value:string){return [...quarterHours.map(t=>({value:t,label:t})),...(!value||quarterHours.includes(value)?[]:[{value,label:value+' (Altbestand)',disabled:true}])];}

export type DaySignal='neutral'|'missing'|'short'|'complete'|'unknown';
export function daySignal(date:string,reports:RapportReport[],owner:number,loaded:boolean,asOf=today()):{signal:DaySignal;minutes:number;label:string}{
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 if(weekday===0||weekday===6)return {signal:'neutral',minutes:0,label:'Wochenende'};
 if(!loaded)return {signal:'unknown',minutes:0,label:'Nicht geladen'};
 const day=effectiveReports(reports.filter(r=>r.date===date&&r.owner.id===owner));
 if(!day.length)return {signal:date>asOf?'neutral':'missing',minutes:0,label:date>asOf?'Zukünftiger Tag':'Kein Rapport'};
 const minutes=day.reduce((n,r)=>n+sumWork(r),0);
 return {signal:minutes>=510?'complete':'short',minutes,label:Math.floor(minutes/60)+':'+String(minutes%60).padStart(2,'0')+' h / 8:30 h'};
}
export function equipmentOptions(catalog:Catalog,recent:string[]=[]):string[]{
 const names=[...recent,...(catalog.equipmentRows??[]),...catalog.machines.map(m=>m.name)],seen=new Set<string>();
 return names.filter(n=>{const k=n.trim().normalize('NFKC').toLocaleLowerCase('de').replace(/\s+/g,' ');if(!k||seen.has(k))return false;seen.add(k);return true;});
}
