export type GreenTask={id:number;subject:string;municipalities:string[]};
export function municipalities(tasks:GreenTask[]):string[]{return [...new Set(tasks.flatMap(t=>t.municipalities))].sort((a,b)=>a.localeCompare(b,'de'));}
export function filterTasks(tasks:GreenTask[],municipality:string,includeUnassigned:boolean,query:string){const q=query.trim().toLocaleLowerCase('de');return tasks.filter(t=>((municipality==='*'&&t.municipalities.length>0)||t.municipalities.includes(municipality)||(includeUnassigned&&!t.municipalities.length))&&(!q||('#'+t.id+' '+t.subject).toLocaleLowerCase('de').includes(q)));}
export function roundedDuration(start:number,end:number){if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;return Math.min(1440,Math.max(15,Math.round((end-start)/900000)*15));}

export type MaterialItem={code:string;name:string;unit:string;category:string;price?:number};
export type MaterialRows={ticketId:number;items:MaterialItem[];warnings:string[]};
export type MaterialUsage={code?:string;name:string;unit:string;quantity:number;note:string};
export type ParticipationChoice={mode:'full'|'partial'|'none';offset:number;minutes:number};
export function participationWindows(ids:number[],choices:Record<number,ParticipationChoice>,start:string,duration:number){
 const base=Date.parse(start);if(!Number.isFinite(base)||!Number.isInteger(duration)||duration<=0||duration%15!==0)throw Error('Ungültige Einsatzzeit');
 return ids.flatMap(employee=>{const c=choices[employee];if(c?.mode==='none')return [];const offset=c?.mode==='partial'?c.offset:0,minutes=c?.mode==='partial'?c.minutes:duration;
 if(!Number.isInteger(offset)||!Number.isInteger(minutes)||offset<0||minutes<=0||offset%15||minutes%15||offset+minutes>duration)throw Error('Teilnahmezeit muss innerhalb des Einsatzes liegen (15-Minuten-Raster).');
 return [{employee,start:new Date(base+offset*60000).toISOString(),end:new Date(base+(offset+minutes)*60000).toISOString()}];});
}

export function groupParticipation(windows:{employee:number;start:string;end:string}[]){
 const groups=new Map<string,{employees:number[];start:string;end:string}>();
 for(const w of windows){const key=w.start+'|'+w.end;const g=groups.get(key);if(g)g.employees.push(w.employee);else groups.set(key,{employees:[w.employee],start:w.start,end:w.end});}
 return [...groups.values()].map(g=>({...g,employees:[...g.employees].sort((a,b)=>a-b)})).sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
}
