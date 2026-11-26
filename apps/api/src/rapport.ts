import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import type { CredentialEnvelope } from './session.js';
import { fetchCurrentUser, redmineJson, RedmineError } from './redmine.js';
import { rapportPdf, rapportPdfMany } from './rapportPdf.js';

type Person = { id: number; name: string };
type Member = Person & { groups: string[] };
type State = 'draft'|'submitted'|'review'|'returned'|'closed';
type SourceRef={id:number;subject:string};
type Line = { sources?:SourceRef[]; id: string; start: string; end: string; kind: 'work'|'pause'; activity: string; order: string; machines: {name:string; minutes:number}[]; materials: {name:string; quantity:number; unit:string}[]; recordedBy: Person; recordedAt:string };
type Data = { version:1; owner:Person; date:string; lines:Line[]; material:string; submitted?:{by:Person;at:string} };
type Issue = { attachments?:{id:number;filename:string;content_url:string}[]; description?:string; id:number; subject:string; project:{id:number}; tracker:{id:number}; status:{id:number;is_closed?:boolean}; updated_on:string; custom_fields?:{id:number;value:unknown}[]; allowed_statuses?:{id:number}[]; journals?:{user?:Person;created_on:string;notes?:string;private_notes?:boolean;details?:{property:string;name:string;new_value?:string}[]}[] };
type Report = Data & { id:number; state:State; revision:string; reviewed?:{by:Person;at:string}; returnNote?:string; history?:{by:string;at:string;note:string}[] };
type Settings = { project:number; tracker:number; field:number; statuses:Record<State,number>; directoryKey:string; serviceKey:string; catalogProject:number; machineTracker:number; materialTracker:number; archiveTracker?:number; summaries:Partial<Record<'owner'|'date'|'work'|'target'|'pause'|'difference'|'machines'|'count',number>> };
const groups = ['Disponenten Bauhof','Bauhofmitarbeiter'];
const states:State[] = ['draft','submitted','review','returned','closed'];
function fail(status:number,message:string):never {throw new RedmineError(status,message);}
const idEnv = (name:string) => {const n=Number(process.env[name]);if(!Number.isSafeInteger(n)||n<=0)fail(503,'Rapport-Konfiguration unvollständig: '+name);return n;};
function settings(config:AppConfig):Settings {
  if(process.env.RAPPORT_ENABLED!=='true')fail(503,'Rapportwesen ist noch nicht eingerichtet.');
  if(config.redmineBaseUrl.protocol!=='https:')fail(503,'Rapportwesen benötigt HTTPS.');
  const directoryKey=process.env.RAPPORT_DIRECTORY_KEY??'',serviceKey=process.env.RAPPORT_SERVICE_KEY??'';
  if(!directoryKey||!serviceKey||directoryKey===serviceKey)fail(503,'Separate Rapport- und Verzeichnisschlüssel erforderlich.');
  const statuses=Object.fromEntries(states.map(s=>[s,idEnv('RAPPORT_STATUS_'+s.toUpperCase())])) as Record<State,number>;
  if(new Set(Object.values(statuses)).size!==5)fail(503,'Rapportstatus müssen eindeutig sein.');
  if(process.env.RAPPORT_ARCHIVE_TRACKER_ID&&idEnv('RAPPORT_ARCHIVE_TRACKER_ID')===idEnv('RAPPORT_TRACKER_ID'))fail(503,'Archivtracker muss getrennt sein');
  const summaries:Settings['summaries']={};for(const k of ['owner','date','work','target','pause','difference','machines','count'] as const){if(process.env['RAPPORT_SUMMARY_'+k.toUpperCase()+'_FIELD_ID'])summaries[k]=idEnv('RAPPORT_SUMMARY_'+k.toUpperCase()+'_FIELD_ID');}
  if(new Set([idEnv('RAPPORT_DATA_FIELD_ID'),...Object.values(summaries)]).size!==1+Object.keys(summaries).length)fail(503,'Rapportfelder müssen eindeutig sein.');
  return {archiveTracker:process.env.RAPPORT_ARCHIVE_TRACKER_ID?idEnv('RAPPORT_ARCHIVE_TRACKER_ID'):undefined,summaries,project:idEnv('RAPPORT_PROJECT_ID'),tracker:idEnv('RAPPORT_TRACKER_ID'),field:idEnv('RAPPORT_DATA_FIELD_ID'),statuses,directoryKey,serviceKey,catalogProject:idEnv('RAPPORT_CATALOG_PROJECT_ID'),machineTracker:idEnv('RAPPORT_MACHINE_TRACKER_ID'),materialTracker:idEnv('RAPPORT_MATERIAL_TRACKER_ID')};
}
export function validDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function target(date:string) {const d=new Date(date+'T00:00:00Z').getUTCDay();return d===5?300:d>=1&&d<=4?510:0;}
function validAttachmentPath(path:string){const parts=path.split('/');const id=parts[2]==='download'?parts[3]:parts[2];return parts[0]===''&&parts[1]==='attachments'&&!!id&&/^[0-9]+$/.test(id);}
const dateInBerlin=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const instant=(v:unknown):string=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))return fail(400,'Ungültige Zeit');const normalized=new Date(v).toISOString();if(normalized.slice(0,19)!==v.slice(0,19))return fail(400,'Ungültige Zeit');return normalized;};
const str=(v:unknown,max=1000):string=>{if(typeof v!=='string'||v.length>max)return fail(400,'Ungültiges Textfeld');return v.trim();};
const arr=(v:unknown,max:number):unknown[]=>{if(!Array.isArray(v)||v.length>max)return fail(400,'Ungültige Liste');return v;};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail(400,'Ungültige Daten');return v as Record<string,unknown>;};
const uid=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v))return fail(400,'Ungültige Vorgangs-ID');return v;};
const positive=(v:unknown,max:number):number=>{if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>max)return fail(400,'Ungültige Menge');return v;};
export const duration=(line:Pick<Line,'start'|'end'>)=>Math.round((Date.parse(line.end)-Date.parse(line.start))/60000);
export function validateLines(lines:Line[],date:string,complete:boolean) {
  if(lines.length>200)fail(400,'Zu viele Positionen für einen Tagesrapport (maximal 200).');
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
  return {sources:prior?.sources??[],id:uid(v.id),start,end,kind:v.kind,activity:str(v.activity??''),order:str(v.order??'',200),machines,materials,recordedBy:prior?.recordedBy??actor,recordedAt:prior?.recordedAt??new Date().toISOString()};
}
export function summary(data:Data) {return {work:data.lines.filter(l=>l.kind==='work').reduce((n,l)=>n+duration(l),0),pause:data.lines.filter(l=>l.kind==='pause').reduce((n,l)=>n+duration(l),0),target:target(data.date)};}
const fmt=(n:number)=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
const time=(s:string)=>new Date(s).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'});
const revision=(i:Issue)=>createHash('sha256').update(JSON.stringify([i.updated_on,i.status.id,i.custom_fields])).digest('hex');
function description(d:Data) {
  const safe=(s:string)=>s.replace(/[\r\n|]/g,' ').replace(/</g,'‹').replace(/>/g,'›');
  return ['Tagesrapport '+d.date+' — '+safe(d.owner.name),'','| Von | Bis | Stunden | Art der Leistung | Auftrag |','| --- | --- | --- | --- | --- |',...d.lines.map(l=>'| '+[time(l.start),time(l.end),fmt(duration(l)),safe(l.kind==='pause'?'Pause':l.activity),safe([l.order,...(l.sources??[]).map(s=>'#'+s.id)].filter(Boolean).join(', '))].join(' | ')+' |'),'','Arbeitszeit: '+fmt(summary(d).work)+' h; explizite Pausen: '+fmt(summary(d).pause)+' h','Material: '+safe(d.material),...d.lines.flatMap(l=>[...l.machines.map(m=>'Maschine: '+safe(m.name)+' '+fmt(m.minutes)+' h'),...l.materials.map(m=>'Material: '+safe(m.name)+' '+m.quantity+' '+safe(m.unit))])].join('\n');
}
function decode(i:Issue,s:Settings):Report {
  if(i.project.id!==s.project||i.tracker.id!==s.tracker)return fail(404,'Rapport nicht gefunden');
  const state=states.find(k=>s.statuses[k]===i.status.id);if(!state)return fail(409,'Unbekannter Rapportstatus');
  let d:Data;
  try {d=JSON.parse(String(i.custom_fields?.find(c=>c.id===s.field)?.value??'')) as Data;if(d.version!==1||!validDate(d.date)||!Number.isInteger(d.owner.id)||!Array.isArray(d.lines))throw Error('invalid');}catch{return fail(409,'Rapportdaten in Redmine ungültig');}
  const review=[...(i.journals??[])].reverse().find(j=>j.details?.some(x=>x.property==='attr'&&x.name==='status_id'&&Number(x.new_value)===s.statuses.closed));
  const returned=[...(i.journals??[])].reverse().find(j=>j.details?.some(x=>x.property==='attr'&&x.name==='status_id'&&Number(x.new_value)===s.statuses.returned));
  return {...d,id:i.id,state,revision:revision(i),...(review?.user?{reviewed:{by:review.user,at:review.created_on}}:{}),...(state==='returned'&&returned?.notes&&!returned.private_notes?{returnNote:returned.notes}:{}),...(i.journals?{history:i.journals.filter(j=>j.notes&&!j.private_notes).map(j=>({by:j.user?.name??'Redmine',at:j.created_on,note:j.notes!}))}:{})};
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
  const getDay=async(c:C,employee:number,date:string,issues:Issue[])=>{
    const subject='Rapport '+employee+' '+date;
    const matches=issues.filter(i=>i.subject===subject);
    if(matches.length>1)fail(409,'Doppelter Tagesrapport in Redmine – bitte administrativ klären.');
    if(!matches.length)return null;
    const d=await detail(c,matches[0]!.id);if(d.r.owner.id!==employee||d.r.date!==date)fail(409,'Rapportkennung stimmt nicht');return d;
  };
  const payload=(c:C,d:Data)=>{const a=summary(d);const values={owner:String(d.owner.id),date:d.date,work:String(a.work),target:String(a.target),pause:String(a.pause),difference:String(a.work-a.target),machines:String(d.lines.flatMap(l=>l.machines).reduce((n,m)=>n+m.minutes,0)),count:String(d.lines.length)};return {description:description(d),custom_fields:[{id:c.s.field,value:JSON.stringify(d)},...Object.entries(c.s.summaries).map(([k,id])=>({id,value:values[k as keyof typeof values]}))]};};
  const write=async(c:C,i:Issue,d:Data,notes:string,status?:number)=>{
    await c.service('/issues/'+i.id+'.json','PUT',{issue:{...payload(c,d),notes,...(status?{status_id:status}:{})}});
    const actual=await detail(c,i.id);if(JSON.stringify(actual.r.lines)!==JSON.stringify(d.lines)||actual.r.material!==d.material||JSON.stringify(actual.r.submitted)!==JSON.stringify(d.submitted)||(status!==undefined&&actual.i.status.id!==status))fail(409,'Redmine hat die Änderung nicht vollständig übernommen. Bitte Konfiguration prüfen.');return actual.r;
  };
  const archiveRecord=async(c:C,r:Report)=>{if(!c.s.archiveTracker)return null;const matches=(await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+'&tracker_id='+c.s.archiveTracker+'&status_id=*')).filter(i=>i.subject==='Rapportarchiv '+r.id);if(matches.length>1)fail(409,'Doppelter Archivbeleg');if(!matches.length)return null;const {issue}=await c.service<{issue:Issue}>('/issues/'+matches[0]!.id+'.json?include=attachments');if(issue.project.id!==c.s.project||issue.tracker.id!==c.s.archiveTracker||issue.status.id!==c.s.statuses.closed)fail(409,'Archivbeleg nicht korrekt gesperrt');return issue;};
  const archivedPdf=async(c:C,r:Report):Promise<Buffer|null>=>{const record=await archiveRecord(c,r);if(!record)return null;const a=record.attachments?.find(x=>x.filename==='Rapport-'+r.id+'.pdf');if(!a)fail(409,'Archiv-PDF fehlt');const url=new URL(a.content_url,config.redmineBaseUrl);if(url.origin!==config.redmineBaseUrl.origin||!validAttachmentPath(url.pathname))fail(502,'Ungültiger Archivanhang');const response=await fetch(url,{headers:{'X-Redmine-API-Key':c.s.serviceKey},redirect:'error',signal:AbortSignal.timeout(config.redmineTimeoutMs)});if(!response.ok)fail(502,'Archivanhang nicht lesbar');const bytes=Buffer.from(await response.arrayBuffer());if(record.description!=='SHA256 '+createHash('sha256').update(bytes).digest('hex'))fail(409,'Archiv-Prüfsumme stimmt nicht');return bytes;};
  const archive=async(c:C,r:Report)=>{if(!c.s.archiveTracker)fail(503,'Archivtracker nicht konfiguriert');if(r.state!=='closed'||!r.reviewed||!r.submitted)fail(409,'Nur vollständig bestätigte Rapporte archivieren');const existing=await archiveRecord(c,r);if(existing){await archivedPdf(c,r);return {id:existing.id};}const bytes=rapportPdf(r),filename='Rapport-'+r.id+'.pdf';const url=new URL('/uploads.json?filename='+encodeURIComponent(filename),config.redmineBaseUrl);const response=await fetch(url,{method:'POST',headers:{'X-Redmine-API-Key':c.s.serviceKey,'Content-Type':'application/octet-stream'},body:bytes,redirect:'error',signal:AbortSignal.timeout(config.redmineTimeoutMs)});if(!response.ok)fail(502,'Archivupload fehlgeschlagen');const token=(await response.json() as {upload?:{token?:string}}).upload?.token;if(!token)fail(502,'Archivupload ohne Token');const created=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.archiveTracker,status_id:c.s.statuses.closed,subject:'Rapportarchiv '+r.id,description:'SHA256 '+createHash('sha256').update(bytes).digest('hex'),uploads:[{token,filename,content_type:'application/pdf'}]}});await archivedPdf(c,r);return {id:created.issue.id};};
  const note=(c:C,action:string)=>'DerKumpel: '+action+' — '+c.actor.name+' (Benutzer #'+c.actor.id+') · '+new Date().toISOString();
  async function sourceRefs(c:C,value:unknown):Promise<SourceRef[]> {
    const ids=[...new Set(arr(value??[],50).map(x=>{if(typeof x!=='number'||!Number.isSafeInteger(x)||x<=0)fail(400,'Ungültige Auftragsreferenz');return x;}))];
    const result:SourceRef[]=[];for(const id of ids){const {issue}=await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+id+'.json');if([c.s.project,c.s.catalogProject].includes(issue.project.id))fail(400,'Interne Vorgänge sind keine Aufträge');result.push({id:issue.id,subject:issue.subject});}return result;
  }
  app.get('/api/rapport/green/tasks',async r=>{const c=await context(r);if(process.env.GREEN_ENABLED!=='true')return fail(503,'Grünpflege ist noch nicht eingerichtet');const tracker=idEnv('GREEN_TRACKER_ID'),field=idEnv('GREEN_MUNICIPALITY_FIELD_ID');const personal:Get=<T>(path:string)=>redmineJson<T>(config,c.creds,path);const issues=await pages<Issue>(personal,'/issues.json?tracker_id='+tracker+'&status_id=*');const tasks=issues.filter(i=>i.tracker.id===tracker&&![c.s.project,c.s.catalogProject].includes(i.project.id)).map(i=>{const raw=i.custom_fields?.find(f=>f.id===field)?.value;return {id:i.id,subject:i.subject,municipalities:(Array.isArray(raw)?raw:raw===undefined||raw===null?[]:[raw]).map(x=>String(x).trim()).filter(Boolean)};});return {tasks};});
  app.get('/api/rapport/users',async r=>{const c=await context(r);return {users:[...c.members.values()].sort((a,b)=>a.name.localeCompare(b.name,'de')),missingGroups:[],dispatcher:c.dispatcher};});
  app.get('/api/rapport/reports',async r=>{const c=await context(r),q=r.query as {from?:string;to?:string;all?:string};if(!validDate(q.from)||!validDate(q.to)||q.from>q.to)return fail(400,'Ungültiger Zeitraum');if(q.all==='1'&&!c.dispatcher)return fail(403,'Nur Disponenten');const reports=(await list(c)).map(i=>decode(i,c.s)).filter(d=>d.date>=q.from!&&d.date<=q.to!&&(q.all==='1'||d.owner.id===c.actor.id));return {reports,dispatcher:c.dispatcher};});
  app.get('/api/rapport/reports/:id',async r=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return d;});
  app.post('/api/rapport/capture',async r=>{const c=await context(r),b=obj(r.body);if(b.actorId!==c.actor.id)return fail(403,'Erfasser stimmt nicht mit Anmeldung überein');if(!validDate(b.date))return fail(400,'Arbeitstag ungültig');const date=b.date;const line=parseLine(b.line,c.actor);line.sources=await sourceRefs(c,obj(b.line).sourceIds);validateLines([line],date,false);if(line.machines.length||line.materials.length)fail(400,'Gemeinsame Ressourcen separat im verantwortlichen Rapport erfassen');const people=[...new Set(arr(b.employees,100).map(Number))];if(!people.length||people.some(id=>!c.members.has(id)))return fail(400,'Ungültige Mitarbeiterauswahl');return serialized(async()=>{const results=[];const issues=await list(c);for(const id of people){try{const existing=await getDay(c,id,date,issues);if(existing){const {i,r:d}=existing;const old=d.lines.find(l=>l.id===line.id);if(old){if(old.recordedBy.id!==c.actor.id||old.start!==line.start||old.end!==line.end||old.activity!==line.activity||JSON.stringify((old.sources??[]).map(s=>s.id))!==JSON.stringify((line.sources??[]).map(s=>s.id)))fail(409,'Vorgangs-ID bereits vergeben');results.push({employee:id,ok:true,reportId:i.id});continue;}if(!['draft','returned'].includes(d.state))fail(409,'Rapport bereits eingereicht oder abgeschlossen');const next:Data={version:1,owner:d.owner,date,lines:[...d.lines,line],material:d.material,...(d.submitted?{submitted:d.submitted}:{})};validateLines(next.lines,date,false);await write(c,i,next,note(c,'Leistung vorerfasst '+line.id));results.push({employee:id,ok:true,reportId:i.id});}else{const owner=c.members.get(id)!;const d:Data={version:1,owner:{id,name:owner.name},date,lines:[line],material:''};const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.tracker,status_id:c.s.statuses.draft,subject:'Rapport '+id+' '+date,...payload(c,d)}});const actual=await detail(c,result.issue.id);if(actual.r.owner.id!==id||actual.r.date!==date||actual.r.state!=='draft'||!actual.r.lines.some(l=>l.id===line.id&&l.start===line.start&&l.end===line.end))fail(409,'Redmine hat die Anlage nicht vollständig übernommen.');results.push({employee:id,ok:true,reportId:result.issue.id});}}catch(e){results.push({employee:id,ok:false,message:e instanceof RedmineError?e.message:'Übertragung fehlgeschlagen'});}}return {results};});});
  app.put('/api/rapport/reports/:id',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');if(d.state==='closed'||(!c.dispatcher&&!['draft','returned'].includes(d.state)))fail(409,'Rapport ist gesperrt');const reason=str(b.reason??'');if(c.dispatcher&&d.owner.id!==c.actor.id&&!reason)fail(400,'Korrekturbegründung erforderlich');if(!['draft','returned'].includes(d.state)&&!reason)fail(400,'Korrekturbegründung erforderlich');const lines=await Promise.all(arr(b.lines,200).map(async x=>{const prior=d.lines.find(l=>l.id===obj(x).id);const line=parseLine(x,c.actor,prior);if(obj(x).sourceIds!==undefined)line.sources=await sourceRefs(c,obj(x).sourceIds);return line;}));validateLines(lines,d.date,false);const next:Data={version:1,owner:d.owner,date:d.date,lines,material:str(b.material??'',5000),...(d.submitted?{submitted:d.submitted}:{})};const prior=summary(d),after=summary(next);const changed=lines.filter(l=>JSON.stringify(l)!==JSON.stringify(d.lines.find(x=>x.id===l.id))).length;const removed=d.lines.filter(l=>!lines.some(x=>x.id===l.id)).length;return write(c,i,next,note(c,'Rapport korrigiert; Arbeitszeit '+fmt(prior.work)+' → '+fmt(after.work)+' h; '+changed+' geänderte/neue und '+removed+' entfernte Positionen'+(reason?': '+reason:'')));});});
  app.post('/api/rapport/reports/:id/transition',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');const action=b.action,reason=str(b.reason??'');if(action==='submit'&&d.owner.id===c.actor.id&&['draft','returned'].includes(d.state)){validateLines(d.lines,d.date,true);const next:Data={version:1,owner:d.owner,date:d.date,lines:d.lines,material:d.material,submitted:{by:{id:c.actor.id,name:c.actor.name},at:new Date().toISOString()}};if(!i.allowed_statuses?.some(s=>s.id===c.s.statuses.submitted))fail(409,'Redmine-Workflow erlaubt Einreichung nicht');return write(c,i,next,note(c,'Eingereicht'),c.s.statuses.submitted);}
    if(!c.dispatcher)return fail(403,'Nur Disponenten');const next:State|undefined=action==='review'&&d.state==='submitted'?'review':action==='return'&&['submitted','review'].includes(d.state)?'returned':action==='close'&&['submitted','review'].includes(d.state)?'closed':undefined;if(!next)return fail(409,'Unzulässiger Statuswechsel');if(next==='returned'&&!reason)fail(400,'Rückgabebegründung erforderlich');if(next==='closed'){validateLines(d.lines,d.date,true);if(!d.submitted)fail(409,'Digitale Einreichung fehlt');}
    const personal=(await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+i.id+'.json?include=allowed_statuses')).issue;if(!personal.allowed_statuses?.some(s=>s.id===c.s.statuses[next]))fail(403,'Redmine-Workflow erlaubt Statuswechsel nicht');
    await redmineJson(config,c.creds,'/issues/'+i.id+'.json',{method:'PUT',body:JSON.stringify({issue:{status_id:c.s.statuses[next],notes:note(c,action+(reason?': '+reason:'')+(next==='closed'&&d.owner.id===c.actor.id?' (Selbstprüfung)':''))}})});const actual=await detail(c,i.id);if(actual.i.status.id!==c.s.statuses[next])fail(409,'Redmine hat den Statuswechsel nicht übernommen');return actual.r;});});
  app.get('/api/rapport/orders',async r=>{const c=await context(r);const q=(r.query as {q?:string}).q?.trim()??'';if(q.length<2||q.length>100)return {orders:[]};const personal:Get=<T>(path:string)=>redmineJson<T>(config,c.creds,path);const items=await pages<Issue>(personal,'/issues.json?status_id=*&subject='+encodeURIComponent('~'+q));return {orders:items.filter(i=>![c.s.project,c.s.catalogProject].includes(i.project.id)&&i.subject.toLocaleLowerCase('de').includes(q.toLocaleLowerCase('de'))).slice(0,30).map(i=>({id:i.id,subject:i.subject}))};});
  app.get('/api/rapport/order/:id',async r=>{const c=await context(r),id=Number((r.params as {id:string}).id);if(!Number.isSafeInteger(id)||id<=0)return fail(400,'Auftragsnummer ungültig');const {issue}=await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+id+'.json');if([c.s.project,c.s.catalogProject].includes(issue.project.id))return fail(404,'Auftrag nicht gefunden');return {id:issue.id,subject:issue.subject};});
  app.get('/api/rapport/catalog',async r=>{const c=await context(r);const items=await pages<Issue>(c.service,'/issues.json?project_id='+c.s.catalogProject+'&status_id=open');return {machines:items.filter(i=>i.tracker.id===c.s.machineTracker).map(i=>({id:i.id,name:i.subject})),materials:items.filter(i=>i.tracker.id===c.s.materialTracker).map(i=>({id:i.id,name:i.subject}))};});
  app.post('/api/rapport/catalog',async r=>{const c=await context(r);if(!c.dispatcher)return fail(403,'Nur Disponenten');const b=obj(r.body),name=str(b.name,200);if(!name||!['machine','material'].includes(String(b.kind)))return fail(400,'Ungültige Stammdaten');const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.catalogProject,tracker_id:b.kind==='machine'?c.s.machineTracker:c.s.materialTracker,subject:name,description:note(c,'Stammdatum angelegt')}});return {id:result.issue.id,name};});
  app.get('/api/rapport/pdf',async(r,reply)=>{const c=await context(r),q=r.query as {ids?:string};const ids=[...new Set((q.ids??'').split(',').map(Number))];if(!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<=0))return fail(400,'Bitte maximal 100 gültige Rapporte auswählen');const reports=[];for(const id of ids){const {r:d}=await detail(c,id);allowed(c,d);reports.push(d);}return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapporte.pdf"').send(rapportPdfMany(reports));});
  app.post('/api/rapport/reports/:id/archive',async r=>{const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten');return serialized(async()=>{const {r:d}=await detail(c,Number((r.params as {id:string}).id));return archive(c,d);});});
  app.get('/api/rapport/reports/:id/pdf',async(r,reply)=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapport-'+d.date+'-'+d.owner.id+'.pdf"').send((d.state==='closed'?await archivedPdf(c,d):null)??rapportPdf(d));});
}
