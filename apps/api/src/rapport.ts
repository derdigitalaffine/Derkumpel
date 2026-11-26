import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import type { CredentialEnvelope } from './session.js';
import { fetchCurrentUser, redmineJson, RedmineError } from './redmine.js';
import { rapportPdf } from './rapportPdf.js';

type Person = { id: number; name: string };
type Member = Person & { groups: string[] };
type State = 'draft'|'submitted'|'review'|'returned'|'closed';
type Line = { id: string; start: string; end: string; kind: 'work'|'pause'; activity: string; order: string; machines: {name:string; minutes:number}[]; materials: {name:string; quantity:number; unit:string}[]; recordedBy: Person; recordedAt:string };
type Data = { version:1; owner:Person; date:string; lines:Line[]; material:string; submitted?:{by:Person;at:string} };
type Issue = { id:number; subject:string; project:{id:number}; tracker:{id:number}; status:{id:number;is_closed?:boolean}; updated_on:string; custom_fields?:{id:number;value:unknown}[]; allowed_statuses?:{id:number}[]; journals?:{user?:Person;created_on:string;details?:{property:string;name:string;new_value?:string}[]}[] };
type Report = Data & { id:number; state:State; revision:string; reviewed?:{by:Person;at:string} };
type Settings = { project:number; tracker:number; field:number; statuses:Record<State,number>; directoryKey:string; serviceKey:string; catalogProject:number; machineTracker:number; materialTracker:number };
const groups = ['Disponenten Bauhof','Bauhofmitarbeiter'];
const states:State[] = ['draft','submitted','review','returned','closed'];
const fail = (status:number,message:string):never => {throw new RedmineError(status,message);};
const idEnv = (name:string) => {const n=Number(process.env[name]);if(!Number.isSafeInteger(n)||n<=0)fail(503,'Rapport-Konfiguration unvollständig: '+name);return n;};
function settings(config:AppConfig):Settings {
  if(process.env.RAPPORT_ENABLED!=='true')fail(503,'Rapportwesen ist noch nicht eingerichtet.');
  if(config.redmineBaseUrl.protocol!=='https:')fail(503,'Rapportwesen benötigt HTTPS.');
  const directoryKey=process.env.RAPPORT_DIRECTORY_KEY??'',serviceKey=process.env.RAPPORT_SERVICE_KEY??'';
  if(!directoryKey||!serviceKey||directoryKey===serviceKey)fail(503,'Separate Rapport- und Verzeichnisschlüssel erforderlich.');
  const statuses=Object.fromEntries(states.map(s=>[s,idEnv('RAPPORT_STATUS_'+s.toUpperCase())])) as Record<State,number>;
  if(new Set(Object.values(statuses)).size!==5)fail(503,'Rapportstatus müssen eindeutig sein.');
  return {project:idEnv('RAPPORT_PROJECT_ID'),tracker:idEnv('RAPPORT_TRACKER_ID'),field:idEnv('RAPPORT_DATA_FIELD_ID'),statuses,directoryKey,serviceKey,catalogProject:idEnv('RAPPORT_CATALOG_PROJECT_ID'),machineTracker:idEnv('RAPPORT_MACHINE_TRACKER_ID'),materialTracker:idEnv('RAPPORT_MATERIAL_TRACKER_ID')};
}
export function validDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function target(date:string) {const d=new Date(date+'T00:00:00Z').getUTCDay();return d===5?300:d>=1&&d<=4?510:0;}
const dateInBerlin=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const instant=(v:unknown):string=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))return fail(400,'Ungültige Zeit');const normalized=new Date(v).toISOString();if(normalized.slice(0,19)!==v.slice(0,19))return fail(400,'Ungültige Zeit');return normalized;};
const str=(v:unknown,max=1000):string=>{if(typeof v!=='string'||v.length>max)return fail(400,'Ungültiges Textfeld');return v.trim();};
const arr=(v:unknown,max:number):unknown[]=>{if(!Array.isArray(v)||v.length>max)return fail(400,'Ungültige Liste');return v;};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail(400,'Ungültige Daten');return v as Record<string,unknown>;};
const uid=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v))return fail(400,'Ungültige Vorgangs-ID');return v;};
const positive=(v:unknown,max:number):number=>{if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>max)return fail(400,'Ungültige Menge');return v;};
export const duration=(line:Pick<Line,'start'|'end'>)=>Math.round((Date.parse(line.end)-Date.parse(line.start))/60000);
export function validateLines(lines:Line[],date:string,complete:boolean) {
  const ids=new Set<string>();
  for(const l of lines){
    if(ids.has(l.id))fail(400,'Doppelte Position');ids.add(l.id);
    if(dateInBerlin(new Date(l.start))!==date||duration(l)<=0||duration(l)>1440)fail(400,'Zeitraum passt nicht zum Arbeitstag');
    if(complete&&l.kind==='work'&&!l.activity)fail(400,'Bitte alle Tätigkeiten ergänzen.');
  }
  if(complete&&!lines.some(l=>l.kind==='work'))fail(400,'Keine Arbeitsleistungen vorhanden.');
  const sorted=[...lines].sort((a,b)=>a.start.localeCompare(b.start));
  for(let i=1;i<sorted.length;i++)if(sorted[i]!.start<sorted[i-1]!.end)fail(409,'Zeitüberschneidung im Rapport.');
}
function parseLine(value:unknown,actor:Person,prior?:Line):Line {
  const v=obj(value);const start=instant(v.start),end=instant(v.end);
  if(v.kind!=='work'&&v.kind!=='pause')return fail(400,'Ungültiger Positionstyp');
  if((Date.parse(end)-Date.parse(start))%60000!==0)fail(400,'Nur minutengenaue Zeiträume erlaubt.');
  const machines=arr(v.machines??[],20).map(x=>{const m=obj(x),minutes=positive(m.minutes,1440);if(!Number.isInteger(minutes))fail(400,'Maschinenzeit muss in Minuten angegeben werden');return {name:str(m.name,200),minutes};});
  const materials=arr(v.materials??[],30).map(x=>{const m=obj(x);return {name:str(m.name,200),quantity:positive(m.quantity,1e8),unit:str(m.unit,40)};});
  if(machines.some(m=>!m.name)||materials.some(m=>!m.name||!m.unit))fail(400,'Maschine oder Material unvollständig');
  if(v.kind==='pause'&&(machines.length||materials.length))fail(400,'Keine Maschinen oder Materialien in Pausen');
  return {id:uid(v.id),start,end,kind:v.kind,activity:str(v.activity??''),order:str(v.order??'',200),machines,materials,recordedBy:prior?.recordedBy??actor,recordedAt:prior?.recordedAt??new Date().toISOString()};
}
export function summary(data:Data) {return {work:data.lines.filter(l=>l.kind==='work').reduce((n,l)=>n+duration(l),0),pause:data.lines.filter(l=>l.kind==='pause').reduce((n,l)=>n+duration(l),0),target:target(data.date)};}
const fmt=(n:number)=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
const time=(s:string)=>new Date(s).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'});
const revision=(i:Issue)=>createHash('sha256').update(JSON.stringify([i.updated_on,i.status.id,i.custom_fields])).digest('hex');
function description(d:Data) {
  const safe=(s:string)=>s.replace(/[\r\n|]/g,' ').replace(/</g,'‹').replace(/>/g,'›');
  return ['Tagesrapport '+d.date+' — '+safe(d.owner.name),'','| Von | Bis | Stunden | Art der Leistung | Auftrag |','| --- | --- | --- | --- | --- |',...d.lines.map(l=>'| '+[time(l.start),time(l.end),fmt(duration(l)),safe(l.kind==='pause'?'Pause':l.activity),safe(l.order)].join(' | ')+' |'),'','Arbeitszeit: '+fmt(summary(d).work)+' h; explizite Pausen: '+fmt(summary(d).pause)+' h','Material: '+safe(d.material),...d.lines.flatMap(l=>[...l.machines.map(m=>'Maschine: '+safe(m.name)+' '+fmt(m.minutes)+' h'),...l.materials.map(m=>'Material: '+safe(m.name)+' '+m.quantity+' '+safe(m.unit))])].join('\n');
}
function decode(i:Issue,s:Settings):Report {
  if(i.project.id!==s.project||i.tracker.id!==s.tracker)return fail(404,'Rapport nicht gefunden');
  const state=states.find(k=>s.statuses[k]===i.status.id);if(!state)return fail(409,'Unbekannter Rapportstatus');
  let d:Data;
  try {d=JSON.parse(String(i.custom_fields?.find(c=>c.id===s.field)?.value??'')) as Data;if(d.version!==1||!validDate(d.date)||!Number.isInteger(d.owner.id)||!Array.isArray(d.lines))throw Error('invalid');}catch{return fail(409,'Rapportdaten in Redmine ungültig');}
  const review=[...(i.journals??[])].reverse().find(j=>j.details?.some(x=>x.property==='attr'&&x.name==='status_id'&&Number(x.new_value)===s.statuses.closed));
  return {...d,id:i.id,state,revision:revision(i),...(review?.user?{reviewed:{by:review.user,at:review.created_on}}:{})};
}
type Get = <T>(path:string,method?:string,body?:unknown)=>Promise<T>;
function keyApi(config:AppConfig,key:string):Get {
  return async <T>(path:string,method='GET',body?:unknown):Promise<T>=>{
    const url=new URL(path,config.redmineBaseUrl);if(url.origin!==config.redmineBaseUrl.origin)throw Error('origin');
    const r=await fetch(url,{method,redirect:'error',headers:{'X-Redmine-API-Key':key,Accept:'application/json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(config.redmineTimeoutMs)});
    if(!r.ok)return fail(r.status===401?503:r.status,'Redmine-Rapportzugriff fehlgeschlagen ('+r.status+')');
    return (r.status===204?undefined:await r.json()) as T;
  };
}
async function pages<T>(get:Get,path:string):Promise<T[]> {
  const out:T[]=[];for(let offset=0;offset<100000;){const p=await get<{issues:T[];total_count?:number}>(path+'&limit=100&offset='+offset);if(!Array.isArray(p.issues))fail(502,'Ungültige Redmine-Liste');out.push(...p.issues);offset+=p.issues.length;if(!p.issues.length||offset>=(p.total_count??offset))return out;}return fail(503,'Zu viele Rapporte, Zeitraum begrenzen.');
}
let pending:Promise<unknown>=Promise.resolve();
function serialized<T>(fn:()=>Promise<T>):Promise<T>{const run=pending.then(fn,fn);pending=run.catch(()=>undefined);return run;}
export function registerRapport(app:FastifyInstance,config:AppConfig,credentials:(r:FastifyRequest)=>CredentialEnvelope) {
  async function context(r:FastifyRequest){
    const s=settings(config),creds=credentials(r),me=(await fetchCurrentUser(config,creds)).user;
    const directory=keyApi(config,s.directoryKey),service=keyApi(config,s.serviceKey);
    const all=await directory<{groups:Person[]}>('/groups.json');const members=new Map<number,Member>();
    for(const name of groups){const g=all.groups.find(x=>x.name===name);if(!g)return fail(503,'Redmine-Gruppe fehlt: '+name);const result=await directory<{group:{users:Person[]}}>('/groups/'+g.id+'.json?include=users');for(const u of result.group.users){members.set(u.id,{id:u.id,name:u.name,groups:[...(members.get(u.id)?.groups??[]),name]});}}
    const actor=members.get(me.id);if(!actor)return fail(403,'Kein Zugriff auf das Rapportwesen');
    return {s,service,actor,members,dispatcher:actor.groups.includes(groups[0]!),creds};
  }
  type C=Awaited<ReturnType<typeof context>>;
  const detail=async(c:C,id:number)=>{const i=(await c.service<{issue:Issue}>('/issues/'+id+'.json?include=journals,allowed_statuses')).issue;return {i,r:decode(i,c.s)};};
  const allowed=(c:C,r:Report)=>{if(r.owner.id!==c.actor.id&&!c.dispatcher)fail(404,'Rapport nicht gefunden');};
  const list=async(c:C)=>pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+'&tracker_id='+c.s.tracker+'&status_id=*');
  const getDay=async(c:C,employee:number,date:string)=>{
    const subject='Rapport '+employee+' '+date;
    const matches=(await list(c)).filter(i=>i.subject===subject);
    if(matches.length>1)fail(409,'Doppelter Tagesrapport in Redmine – bitte administrativ klären.');
    if(!matches.length)return null;
    const d=await detail(c,matches[0]!.id);if(d.r.owner.id!==employee||d.r.date!==date)fail(409,'Rapportkennung stimmt nicht');return d;
  };
  const payload=(c:C,d:Data)=>({description:description(d),custom_fields:[{id:c.s.field,value:JSON.stringify(d)}]});
  const write=async(c:C,i:Issue,d:Data,notes:string,status?:number)=>{
    await c.service('/issues/'+i.id+'.json','PUT',{issue:{...payload(c,d),notes,...(status?{status_id:status}:{})}});
    return (await detail(c,i.id)).r;
  };
  const note=(c:C,action:string)=>'DerKumpel: '+action+' — '+c.actor.name+' (Benutzer #'+c.actor.id+') · '+new Date().toISOString();
  app.get('/api/rapport/users',async r=>{const c=await context(r);return {users:[...c.members.values()].sort((a,b)=>a.name.localeCompare(b.name,'de')),missingGroups:[],dispatcher:c.dispatcher};});
  app.get('/api/rapport/reports',async r=>{const c=await context(r),q=r.query as {from?:string;to?:string;all?:string};if(!validDate(q.from)||!validDate(q.to)||q.from>q.to)return fail(400,'Ungültiger Zeitraum');if(q.all==='1'&&!c.dispatcher)return fail(403,'Nur Disponenten');const reports=(await list(c)).map(i=>decode(i,c.s)).filter(d=>d.date>=q.from!&&d.date<=q.to!&&(q.all==='1'||d.owner.id===c.actor.id));return {reports,dispatcher:c.dispatcher};});
  app.get('/api/rapport/reports/:id',async r=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return d;});
  app.post('/api/rapport/capture',async r=>{const c=await context(r),b=obj(r.body);if(!validDate(b.date))return fail(400,'Arbeitstag ungültig');const date=b.date;const line=parseLine(b.line,c.actor);validateLines([line],date,false);const people=[...new Set(arr(b.employees,100).map(Number))];if(!people.length||people.some(id=>!c.members.has(id)))return fail(400,'Ungültige Mitarbeiterauswahl');return serialized(async()=>{const results=[];for(const id of people){try{const existing=await getDay(c,id,date);if(existing){const {i,r:d}=existing;const old=d.lines.find(l=>l.id===line.id);if(old){if(old.recordedBy.id!==c.actor.id)fail(409,'Vorgangs-ID bereits vergeben');results.push({employee:id,ok:true,reportId:i.id});continue;}if(!['draft','returned'].includes(d.state))fail(409,'Rapport bereits eingereicht oder abgeschlossen');const next:Data={version:1,owner:d.owner,date,lines:[...d.lines,line],material:d.material,...(d.submitted?{submitted:d.submitted}:{})};validateLines(next.lines,date,false);await write(c,i,next,note(c,'Leistung vorerfasst '+line.id));results.push({employee:id,ok:true,reportId:i.id});}else{const owner=c.members.get(id)!;const d:Data={version:1,owner:{id,name:owner.name},date,lines:[line],material:''};const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.tracker,status_id:c.s.statuses.draft,subject:'Rapport '+id+' '+date,...payload(c,d)}});results.push({employee:id,ok:true,reportId:result.issue.id});}}catch(e){results.push({employee:id,ok:false,message:e instanceof RedmineError?e.message:'Übertragung fehlgeschlagen'});}}return {results};});});
  app.put('/api/rapport/reports/:id',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');if(d.state==='closed'||(!c.dispatcher&&!['draft','returned'].includes(d.state)))fail(409,'Rapport ist gesperrt');const reason=str(b.reason??'');if(c.dispatcher&&d.owner.id!==c.actor.id&&!reason)fail(400,'Korrekturbegründung erforderlich');if(!['draft','returned'].includes(d.state)&&!reason)fail(400,'Korrekturbegründung erforderlich');const lines=arr(b.lines,200).map(x=>parseLine(x,c.actor,d.lines.find(l=>l.id===obj(x).id)));validateLines(lines,d.date,false);const next:Data={version:1,owner:d.owner,date:d.date,lines,material:str(b.material??'',5000),...(d.submitted?{submitted:d.submitted}:{})};return write(c,i,next,note(c,'Rapport korrigiert'+(reason?': '+reason:'')));});});
  app.post('/api/rapport/reports/:id/transition',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');const action=b.action,reason=str(b.reason??'');if(action==='submit'&&d.owner.id===c.actor.id&&['draft','returned'].includes(d.state)){validateLines(d.lines,d.date,true);const next:Data={version:1,owner:d.owner,date:d.date,lines:d.lines,material:d.material,submitted:{by:{id:c.actor.id,name:c.actor.name},at:new Date().toISOString()}};if(!i.allowed_statuses?.some(s=>s.id===c.s.statuses.submitted))fail(409,'Redmine-Workflow erlaubt Einreichung nicht');return write(c,i,next,note(c,'Eingereicht'),c.s.statuses.submitted);}
    if(!c.dispatcher)return fail(403,'Nur Disponenten');const next:State|undefined=action==='review'&&d.state==='submitted'?'review':action==='return'&&['submitted','review'].includes(d.state)?'returned':action==='close'&&['submitted','review'].includes(d.state)?'closed':undefined;if(!next)return fail(409,'Unzulässiger Statuswechsel');if(next==='returned'&&!reason)fail(400,'Rückgabebegründung erforderlich');if(next==='closed')validateLines(d.lines,d.date,true);
    const personal=(await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+i.id+'.json?include=allowed_statuses')).issue;if(!personal.allowed_statuses?.some(s=>s.id===c.s.statuses[next]))fail(403,'Redmine-Workflow erlaubt Statuswechsel nicht');
    await redmineJson(config,c.creds,'/issues/'+i.id+'.json',{method:'PUT',body:JSON.stringify({issue:{status_id:c.s.statuses[next],notes:note(c,action+(reason?': '+reason:'')+(next==='closed'&&d.owner.id===c.actor.id?' (Selbstprüfung)':'')}})});return (await detail(c,i.id)).r;});});
  app.get('/api/rapport/catalog',async r=>{const c=await context(r);const items=await pages<Issue>(c.service,'/issues.json?project_id='+c.s.catalogProject+'&status_id=open');return {machines:items.filter(i=>i.tracker.id===c.s.machineTracker).map(i=>({id:i.id,name:i.subject})),materials:items.filter(i=>i.tracker.id===c.s.materialTracker).map(i=>({id:i.id,name:i.subject}))};});
  app.post('/api/rapport/catalog',async r=>{const c=await context(r);if(!c.dispatcher)return fail(403,'Nur Disponenten');const b=obj(r.body),name=str(b.name,200);if(!name||!['machine','material'].includes(String(b.kind)))return fail(400,'Ungültige Stammdaten');const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.catalogProject,tracker_id:b.kind==='machine'?c.s.machineTracker:c.s.materialTracker,subject:name,description:note(c,'Stammdatum angelegt')}});return {id:result.issue.id,name};});
  app.get('/api/rapport/reports/:id/pdf',async(r,reply)=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapport-'+d.date+'-'+d.owner.id+'.pdf"').send(rapportPdf(d));});
}
