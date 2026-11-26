export type Holiday={date:string;name:string};
export type HolidayCalendar={year:number;ticketId:number;revision:string;description:string;holidays:Holiday[];warnings:string[]};
export const holidaySubject=(year:number)=>'DK Feiertage RLP '+year;
const iso=(date:Date)=>date.toISOString().slice(0,10);
export const germanDate=(date:string)=>date.split('-').reverse().join('.');
export function validHolidayYear(year:number){return Number.isInteger(year)&&year>=2000&&year<=2100;}
function easter(year:number):Date{
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
 return new Date(Date.UTC(year,month-1,day,12));
}
export function defaultHolidays(year:number):Holiday[]{
 if(!validHolidayYear(year))throw Error('Ungültiges Kalenderjahr');
 const fixed=[['01-01','Neujahr'],['05-01','Tag der Arbeit'],['10-03','Tag der Deutschen Einheit'],['11-01','Allerheiligen'],['12-25','1. Weihnachtstag'],['12-26','2. Weihnachtstag']];
 const dates:Holiday[]=fixed.map(([d,n])=>({date:year+'-'+d,name:n!}));
 const sunday=easter(year);
 for(const [offset,name] of [[-2,'Karfreitag'],[1,'Ostermontag'],[39,'Christi Himmelfahrt'],[50,'Pfingstmontag'],[60,'Fronleichnam']] as const){const d=new Date(sunday);d.setUTCDate(d.getUTCDate()+offset);dates.push({date:iso(d),name});}
 if(year===2017)dates.push({date:'2017-10-31',name:'Reformationstag (einmalig)'});
 return dates.sort((a,b)=>a.date.localeCompare(b.date));
}
export function holidayTemplate(year:number){return '# DERKUMPEL-HOLIDAYS/1\n# Rheinland-Pfalz – '+year+'\n# Je Zeile: TT.MM.JJJJ | Bezeichnung\n# Kommentare beginnen mit #. Zeilen können ergänzt, geändert oder entfernt werden.\n'+defaultHolidays(year).map(h=>germanDate(h.date)+' | '+h.name).join('\n')+'\n';}
export function parseHolidays(description:string,year:number){
 const holidays:Holiday[]=[],warnings:string[]=[],seen=new Set<string>();
 for(const [index,raw] of description.split(/\r\n|\r|\n/).entries()){
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  const parts=line.split('|').map(s=>s.trim());const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(parts[0]??'');
  const date=m?m[3]+'-'+m[2]+'-'+m[1]:parts[0]??'',name=parts[1]??'',d=new Date(date+'T12:00:00Z');
  if(parts.length!==2||!name||name.length>200||!date.startsWith(year+'-')||!Number.isFinite(d.getTime())||iso(d)!==date||seen.has(date)){warnings.push('Zeile '+(index+1)+': ungültiges oder doppeltes Datum / Bezeichnung');continue;}
  seen.add(date);holidays.push({date,name});
 }
 return {holidays:holidays.sort((a,b)=>a.date.localeCompare(b.date)),warnings};
}
export function holidayTarget(date:string,holidays:Holiday[]):number{
 if(holidays.some(h=>h.date===date))return 0;
 const day=new Date(date+'T12:00:00Z').getUTCDay();return day===5?300:day>=1&&day<=4?510:0;
}
type DailyReport={id:number;date:string;owner:{id:number;name:string};state:string;correction?:{reportId:number};lines:{kind:string;start:string;end:string}[]};
export function effectiveDailyReports<T extends DailyReport>(reports:T[]):T[]{
 const superseded=new Set(reports.filter(r=>r.state==='closed'&&r.correction).map(r=>r.correction!.reportId));
 return reports.filter(r=>!superseded.has(r.id)&&(!r.correction||r.state==='closed'));
}
export function overtimeRows<T extends DailyReport>(reports:T[],holidays:Holiday[]){
 return effectiveDailyReports(reports).map(report=>{const work=report.lines.filter(l=>l.kind==='work').reduce((n,l)=>n+Math.max(0,Math.round((Date.parse(l.end)-Date.parse(l.start))/60000)||0),0),target=holidayTarget(report.date,holidays);
 return {reportId:report.id,owner:report.owner,date:report.date,state:report.state,work,target,extra:Math.max(0,work-target),holiday:holidays.find(h=>h.date===report.date)?.name};}).filter(r=>r.extra>0).sort((a,b)=>b.date.localeCompare(a.date)||a.owner.name.localeCompare(b.owner.name,'de'));
}
