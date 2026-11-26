export type CrewEvent={operationId:string;actor:{id:number;name:string};employees:number[];excluded?:number[];sources:{id:number;subject:string;municipalities?:string[]}[];startedAt:string;endedAt?:string;phase:'start'|'stop'|'finish';participation?:{employee:number;start:string;end:string}[];activity?:string};
export type CrewRecord={id:number;updatedAt:string;event:CrewEvent};
const day=(s:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
const valid=(s:unknown):s is string=>typeof s==='string'&&Number.isFinite(Date.parse(s));
export function crewOverview(records:CrewRecord[],members:Map<number,{id:number;name:string}>,now=new Date()){
 const groups=new Map<string,CrewRecord[]>(),warnings:string[]=[];
 for(const r of records){const e=r.event;
 if(!valid(e.startedAt)||!valid(r.updatedAt)||!e.actor||!Number.isSafeInteger(e.actor.id)||typeof e.actor.name!=='string'||typeof e.operationId!=='string'||!Array.isArray(e.employees)||!e.employees.every(id=>Number.isSafeInteger(id)&&id>0)||e.excluded!==undefined&&(!Array.isArray(e.excluded)||e.excluded.some(id=>!e.employees.includes(id)))||e.participation!==undefined&&(!Array.isArray(e.participation)||e.participation.some(x=>!x||!e.employees.includes(x.employee)||!valid(x.start)||!valid(x.end)))||!Array.isArray(e.sources)||!e.sources.every(s=>s&&Number.isSafeInteger(s.id)&&typeof s.subject==='string'&&(!s.municipalities||Array.isArray(s.municipalities)&&s.municipalities.every(x=>typeof x==='string')))||!['start','stop','finish'].includes(e.phase)||e.phase!=='start'&&(!valid(e.endedAt)||Date.parse(e.endedAt)<=Date.parse(e.startedAt))){warnings.push('Ungültiges Einsatzereignis #'+r.id);continue;}
 const key=e.actor.id+':'+e.operationId,g=groups.get(key)??[];g.push(r);groups.set(key,g);}
 const crews=[...groups.entries()].flatMap(([key,events])=>{
 const starts=events.filter(r=>r.event.phase==='start'),stops=events.filter(r=>r.event.phase==='stop'),finishes=events.filter(r=>r.event.phase==='finish');
 const start=starts[0],stop=stops[0],finish=finishes[0];
 if(!start||starts.length!==1||stops.length>1||finishes.length>1||finish&&!stop){warnings.push('Unvollständige oder doppelte Ereignisse #'+events[0]!.id);return [];}
 const e=start.event;if(events.some(r=>r.event.startedAt!==e.startedAt||JSON.stringify(r.event.employees)!==JSON.stringify(e.employees)||JSON.stringify(r.event.sources.map(s=>s.id))!==JSON.stringify(e.sources.map(s=>s.id)))||finish&&finish.event.endedAt!==stop?.event.endedAt){warnings.push('Widersprüchliche Ereignisse #'+start.id);return [];}
 const state=finish?'finished' as const:stop?'stopped' as const:'running' as const,latest=finish??stop??start,endedAt=stop?.event.endedAt;
 if(state==='finished'&&day(endedAt!)!==day(now.toISOString())&&day(latest.updatedAt)!==day(now.toISOString()))return [];
 const crew=e.employees.map(id=>{const parts=Array.isArray(finish?.event.participation)?finish.event.participation:undefined,p=parts?.find(x=>x.employee===id);
 return {id,name:members.get(id)?.name??(id===e.actor.id?e.actor.name:'#'+id),participation:parts?(p?'included':'excluded'):e.excluded?.includes(id)?'excluded':e.excluded?'included':'unknown',...(p&&valid(p.start)&&valid(p.end)?{start:p.start,end:p.end}:{})};});
 const elapsed=Math.max(0,Math.floor((Date.parse(endedAt??now.toISOString())-Date.parse(e.startedAt))/60000));
 return [{key,actor:e.actor,crew,sources:e.sources,municipalities:[...new Set(e.sources.flatMap(s=>s.municipalities??[]))].sort((a,b)=>a.localeCompare(b,'de')),startedAt:e.startedAt,endedAt,state,activity:finish?.event.activity,updatedAt:latest.updatedAt,eventId:latest.id,elapsed,stale:state==='running'&&(day(e.startedAt)!==day(now.toISOString())||elapsed>=720)}];});
 const counts=new Map<number,number>();for(const c of crews.filter(c=>c.state==='running'))for(const p of c.crew)if(p.participation!=='excluded')counts.set(p.id,(counts.get(p.id)??0)+1);
 return {crews:crews.map(c=>({...c,overlaps:c.state==='running'?c.crew.filter(p=>p.participation!=='excluded'&&(counts.get(p.id)??0)>1).map(p=>p.id):[]})).sort((a,b)=>({running:0,stopped:1,finished:2}[a.state]-{running:0,stopped:1,finished:2}[b.state])||b.startedAt.localeCompare(a.startedAt)),warnings,asOf:now.toISOString()};
}
