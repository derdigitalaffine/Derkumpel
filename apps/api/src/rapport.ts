import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import type { CredentialEnvelope } from './session.js';
import { fetchCurrentUser, redmineJson, RedmineError, rememberInternalRapportProject, internalRapportProject } from './redmine.js';
import { rapportPdf, rapportPdfMany } from './rapportPdf.js';

type Person = { id: number; name: string };
type Member = Person & { groups: string[] };
type State = 'draft'|'submitted'|'review'|'returned'|'closed';
type SourceRef={id:number;subject:string;municipalities?:string[]};
type Line = { sources?:SourceRef[]; id: string; start: string; end: string; kind: 'work'|'pause'; activity: string; order: string; machines: {name:string; minutes:number}[]; materials: {name:string; quantity:number; unit:string}[]; recordedBy: Person; recordedAt:string };
type Correction={reportId:number;reason:string;createdBy:Person;createdAt:string};
type Data = { storageState?:State; storageReviewed?:{by:Person;at:string}; storageReturnNote?:string; correction?:Correction; version:1; owner:Person; date:string; lines:Line[]; material:string; submitted?:{by:Person;at:string} };
type Issue = { attachments?:{id:number;filename:string;content_url:string}[]; description?:string; id:number; subject:string; project:{id:number;name?:string}; tracker:{id:number}; status:{id:number;is_closed?:boolean}; updated_on:string; custom_fields?:{id:number;value:unknown}[]; allowed_statuses?:{id:number}[]; journals?:{user?:Person;created_on:string;notes?:string;private_notes?:boolean;details?:{property:string;name:string;new_value?:string}[]}[] };
type Report = Data & { id:number; state:State; revision:string; reviewed?:{by:Person;at:string}; returnNote?:string; history?:{by:string;at:string;note:string}[] };
type Settings = { automatic?:boolean; project:number; tracker:number; field:number; statuses:Record<State,number>; directoryKey:string; serviceKey:string; catalogProject:number; machineTracker:number; materialTracker:number; archiveTracker?:number; correctionTracker?:number; summaries:Partial<Record<'owner'|'date'|'work'|'target'|'pause'|'difference'|'machines'|'count',number>> };
const groups = ['Disponenten Bauhof','Bauhofmitarbeiter'];
const states:State[] = ['draft','submitted','review','returned','closed'];
function fail(status:number,message:string):never {throw new RedmineError(status,message);}
const idEnv = (name:string) => {const n=Number(process.env[name]);if(!Number.isSafeInteger(n)||n<=0)fail(503,'Rapport-Konfiguration unvollständig: '+name);return n;};
function nativeSettings(config:AppConfig):Settings {
  if(process.env.RAPPORT_ENABLED!=='true')fail(503,'Rapportwesen ist noch nicht eingerichtet.');
  if(config.redmineBaseUrl.protocol!=='https:')fail(503,'Rapportwesen benötigt HTTPS.');
  const directoryKey=process.env.RAPPORT_DIRECTORY_KEY??'',serviceKey=process.env.RAPPORT_SERVICE_KEY??'';
  if(!directoryKey||!serviceKey||directoryKey===serviceKey)fail(503,'Separate Rapport- und Verzeichnisschlüssel erforderlich.');
  const statuses=Object.fromEntries(states.map(s=>[s,idEnv('RAPPORT_STATUS_'+s.toUpperCase())])) as Record<State,number>;
  if(new Set(Object.values(statuses)).size!==5)fail(503,'Rapportstatus müssen eindeutig sein.');
  if(process.env.RAPPORT_ARCHIVE_TRACKER_ID&&idEnv('RAPPORT_ARCHIVE_TRACKER_ID')===idEnv('RAPPORT_TRACKER_ID'))fail(503,'Archivtracker muss getrennt sein');
  if(process.env.RAPPORT_CORRECTION_TRACKER_ID&&[idEnv('RAPPORT_TRACKER_ID'),Number(process.env.RAPPORT_ARCHIVE_TRACKER_ID)].includes(idEnv('RAPPORT_CORRECTION_TRACKER_ID')))fail(503,'Korrekturtracker muss getrennt sein');
  const summaries:Settings['summaries']={};for(const k of ['owner','date','work','target','pause','difference','machines','count'] as const){if(process.env['RAPPORT_SUMMARY_'+k.toUpperCase()+'_FIELD_ID'])summaries[k]=idEnv('RAPPORT_SUMMARY_'+k.toUpperCase()+'_FIELD_ID');}
  if(new Set([idEnv('RAPPORT_DATA_FIELD_ID'),...Object.values(summaries)]).size!==1+Object.keys(summaries).length)fail(503,'Rapportfelder müssen eindeutig sein.');
  return {correctionTracker:process.env.RAPPORT_CORRECTION_TRACKER_ID?idEnv('RAPPORT_CORRECTION_TRACKER_ID'):undefined,archiveTracker:process.env.RAPPORT_ARCHIVE_TRACKER_ID?idEnv('RAPPORT_ARCHIVE_TRACKER_ID'):undefined,summaries,project:idEnv('RAPPORT_PROJECT_ID'),tracker:idEnv('RAPPORT_TRACKER_ID'),field:idEnv('RAPPORT_DATA_FIELD_ID'),statuses,directoryKey,serviceKey,catalogProject:idEnv('RAPPORT_CATALOG_PROJECT_ID'),machineTracker:idEnv('RAPPORT_MACHINE_TRACKER_ID'),materialTracker:idEnv('RAPPORT_MATERIAL_TRACKER_ID')};
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
const revision=(i:Issue)=>createHash('sha256').update(JSON.stringify([i.updated_on,i.status.id,i.custom_fields,i.description])).digest('hex');
function description(d:Data) {
  const safe=(s:string)=>s.replace(/[\r\n|]/g,' ').replace(/</g,'‹').replace(/>/g,'›');
  return [d.correction?'Korrektur zu Rapport #'+d.correction.reportId+' — '+safe(d.correction.reason):'Tagesrapport '+d.date+' — '+safe(d.owner.name),'','| Von | Bis | Stunden | Art der Leistung | Auftrag |','| --- | --- | --- | --- | --- |',...d.lines.map(l=>'| '+[time(l.start),time(l.end),fmt(duration(l)),safe(l.kind==='pause'?'Pause':l.activity),safe([l.order,...(l.sources??[]).map(s=>'#'+s.id)].filter(Boolean).join(', '))].join(' | ')+' |'),'','Arbeitszeit: '+fmt(summary(d).work)+' h; explizite Pausen: '+fmt(summary(d).pause)+' h','Material: '+safe(d.material),...d.lines.flatMap(l=>[...l.machines.map(m=>'Maschine: '+safe(m.name)+' '+fmt(m.minutes)+' h'),...l.materials.map(m=>'Material: '+safe(m.name)+' '+m.quantity+' '+safe(m.unit))])].join('\n');
}
// Redmine's Issue#description= normalizes LF and CR to CRLF.
function automaticRapportJson(description:unknown):string {
  if(typeof description!=='string')throw Error('missing description');
  const match=/^DERKUMPEL-RAPPORT\/1(?:\r\n|\n|\r)/.exec(description);
  if(!match)throw Error('missing storage marker');
  return description.slice(match[0].length);
}
function decode(i:Issue,s:Settings):Report {
  if(i.project.id!==s.project||(!s.automatic&&![s.tracker,s.correctionTracker].includes(i.tracker.id)))return fail(404,'Rapport nicht gefunden');
  if(s.automatic&&!/^Rapport [0-9]+ [0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(i.subject)&&!/^Rapportkorrektur [0-9]+$/.test(i.subject))fail(404,'Rapport nicht gefunden');
  let state=states.find(k=>s.statuses[k]===i.status.id);
  let d:Data;
  try {d=JSON.parse(s.automatic?automaticRapportJson(i.description):String(i.custom_fields?.find(c=>c.id===s.field)?.value??'')) as Data;if(d.version!==1||!validDate(d.date)||!Number.isInteger(d.owner.id)||!Array.isArray(d.lines))throw Error('invalid');if(s.automatic&&!d.correction&&i.subject!=='Rapport '+d.owner.id+' '+d.date)throw Error('identity mismatch');if((s.automatic?i.subject.startsWith('Rapportkorrektur '):i.tracker.id===s.correctionTracker)&&(!d.correction||!Number.isSafeInteger(d.correction.reportId)||d.correction.reportId===i.id))throw Error('invalid correction');if((s.automatic?!i.subject.startsWith('Rapportkorrektur '):i.tracker.id===s.tracker)&&d.correction)throw Error('unexpected correction');}catch{return fail(409,'Rapportdaten in Redmine ungültig');}
  if(s.automatic){if(!/^Rapport (?:[0-9]+) \d{4}-\d{2}-\d{2}$/.test(i.subject)&&!/^Rapportkorrektur [0-9]+$/.test(i.subject))fail(404,'Rapport nicht gefunden');state=d.storageState;if(!state||!states.includes(state))fail(409,'Ungültiger Rapportstatus');return {...d,id:i.id,state,revision:revision(i),reviewed:d.storageReviewed,returnNote:d.storageReturnNote,history:(i.journals??[]).filter(j=>j.notes&&!j.private_notes).map(j=>({by:j.user?.name??'Redmine',at:j.created_on,note:j.notes!}))};}
  if(!state)fail(409,'Unbekannter Rapportstatus');
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
type StoreProject={id:number;identifier:string;name:string;is_public:boolean;trackers?:{id:number;name:string}[];enabled_modules?:{name:string}[]};
type Tracker={id:number;name:string;default_status?:{id:number}};
let setupPending:Promise<Settings>|undefined;
async function automaticSettings(config:AppConfig):Promise<Settings>{
  if(config.redmineBaseUrl.protocol!=='https:')fail(503,'Rapportwesen benötigt HTTPS.');
  const directoryKey=process.env.RAPPORT_DIRECTORY_KEY||process.env.DERKUMPEL_ADMIN_API_KEY||process.env.PUSH_POLL_API_KEY||'';
  if(!directoryKey)fail(503,'Server: Redmine-Administratorschlüssel fehlt (DERKUMPEL_ADMIN_API_KEY oder PUSH_POLL_API_KEY).');
  const serviceKey=process.env.RAPPORT_SERVICE_KEY||directoryKey;
  const admin=keyApi(config,directoryKey),service=keyApi(config,serviceKey);
  const configuredIdentifier=process.env.DERKUMPEL_PROJECT_IDENTIFIER?.trim();
  const identifier=configuredIdentifier||'derkumpel';
  let project:StoreProject;
  try{project=(await admin<{project:StoreProject}>('/projects/'+encodeURIComponent(identifier)+'.json?include=trackers,enabled_modules')).project;}catch(e){
    if(!(e instanceof RedmineError&&e.status===404))throw e;
    if(configuredIdentifier)fail(503,'Das Redmine-Speicherprojekt '+identifier+' wurde nicht gefunden.');
    const matches:StoreProject[]=[];
    for(let offset=0;offset<100000;){const page=await admin<{projects:StoreProject[];total_count:number}>('/projects.json?limit=100&offset='+offset);matches.push(...page.projects.filter(p=>p.name.toLocaleLowerCase('de')==='derkumpel'));offset+=page.projects.length;if(!page.projects.length||offset>=page.total_count)break;}
    if(matches.length!==1)fail(503,'Projekt DerKumpel fehlt oder ist nicht eindeutig. DERKUMPEL_PROJECT_IDENTIFIER setzen.');
    project=(await admin<{project:StoreProject}>('/projects/'+matches[0]!.id+'.json?include=trackers,enabled_modules')).project;
  }
  if(!project||!Number.isSafeInteger(project.id)||(configuredIdentifier&&project.identifier!==configuredIdentifier))fail(503,'Speicherprojekt nicht eindeutig.');
  rememberInternalRapportProject(project.id);
  const technical=(await service<{user:{id:number}}>('/users/current.json')).user;
  const directoryActor=(await admin<{user:{id:number}}>('/users/current.json')).user;
  // Never remove existing project memberships. Refuse an unsafe shared storage project.
  for(let offset=0;offset<100000;){const m=await admin<{memberships:{user?:{id:number};group?:{id:number}}[];total_count:number}>('/projects/'+project.id+'/memberships.json?limit=100&offset='+offset);if(!Array.isArray(m.memberships))fail(503,'Projektmitgliedschaften nicht prüfbar');if(m.memberships.some(x=>x.group||![technical.id,directoryActor.id].includes(x.user?.id??0)))fail(503,'DerKumpel-Speicherprojekt darf außer den technischen Konten keine Mitglieder enthalten.');offset+=m.memberships.length;if(!m.memberships.length||offset>=m.total_count)break;}
  if(project.is_public){await admin('/projects/'+project.id+'.json','PUT',{project:{is_public:false}});project=(await admin<{project:StoreProject}>('/projects/'+project.id+'.json?include=trackers,enabled_modules')).project;}
  if(project.is_public!==false)fail(503,'DerKumpel-Speicherprojekt muss privat sein.');
  const trackers=(await admin<{trackers:Tracker[]}>('/trackers.json')).trackers;
  const statuses=(await admin<{issue_statuses:{id:number;is_closed:boolean}[]}>('/issue_statuses.json')).issue_statuses;
  const usable=(t:Tracker)=>!!t.default_status&&statuses.some(s=>s.id===t.default_status!.id&&!s.is_closed);
  let tracker=trackers.find(t=>project.trackers?.some(x=>x.id===t.id)&&usable(t));
  if(!tracker){tracker=trackers.find(usable);if(!tracker)fail(503,'Kein vorhandener Redmine-Tracker mit offenem Standardstatus verfügbar.');await admin('/projects/'+project.id+'.json','PUT',{project:{tracker_ids:[...(project.trackers??[]).map(t=>t.id),tracker.id]}});}
  if(project.enabled_modules&&!project.enabled_modules.some(m=>m.name==='issue_tracking'))await admin('/projects/'+project.id+'.json','PUT',{project:{enabled_module_names:[...project.enabled_modules.map(m=>m.name),'issue_tracking']}});
  const verified=(await service<{project:StoreProject}>('/projects/'+project.id+'.json?include=trackers,enabled_modules')).project;
  if(verified.is_public!==false||!verified.trackers?.some(t=>t.id===tracker!.id))fail(503,'Speicherprojekt-Konfiguration nicht übernommen.');
  const status=tracker.default_status!.id;
  return {automatic:true,project:project.id,catalogProject:project.id,tracker:tracker.id,machineTracker:tracker.id,materialTracker:tracker.id,archiveTracker:tracker.id,correctionTracker:tracker.id,field:0,statuses:{draft:status,submitted:status,review:status,returned:status,closed:status},summaries:{},directoryKey,serviceKey};
}
function settings(config:AppConfig):Promise<Settings>{
  const mode=process.env.RAPPORT_STORAGE_MODE;
  if(mode==='native'||(mode!=='automatic'&&process.env.RAPPORT_ENABLED==='true'&&process.env.RAPPORT_DATA_FIELD_ID))return Promise.resolve(nativeSettings(config));
  if(mode==='disabled')return Promise.reject(new RedmineError(503,'Rapportwesen wurde deaktiviert.'));
  // Share only in-flight initialization; verify privacy and membership on subsequent requests.
  if(!setupPending)setupPending=automaticSettings(config).finally(()=>{setupPending=undefined;});
  return setupPending;
}

let pending:Promise<unknown>=Promise.resolve();
function serialized<T>(fn:()=>Promise<T>):Promise<T>{const run=pending.then(fn,fn);pending=run.catch(()=>undefined);return run;}
export function registerRapport(app:FastifyInstance,config:AppConfig,credentials:(r:FastifyRequest)=>CredentialEnvelope) {
  async function context(r:FastifyRequest){
    const creds=credentials(r),me=(await fetchCurrentUser(config,creds)).user;
    const mode=process.env.RAPPORT_STORAGE_MODE;
    if(mode==='disabled')fail(503,'Rapportwesen wurde deaktiviert.');
    const key=process.env.RAPPORT_DIRECTORY_KEY||process.env.DERKUMPEL_ADMIN_API_KEY||process.env.PUSH_POLL_API_KEY||'';
    if(!key)fail(503,'Server: Redmine-Administratorschlüssel für Gruppenabfrage fehlt.');
    if(config.redmineBaseUrl.protocol!=='https:')fail(503,'Rapportwesen benötigt HTTPS.');
    const directory=keyApi(config,key);
    const all=await directory<{groups:Person[]}>('/groups.json');const members=new Map<number,Member>();
    for(const name of groups){const g=all.groups.find(x=>x.name===name);if(!g)return fail(503,'Redmine-Gruppe fehlt: '+name);const result=await directory<{group:{users:Person[]}}>('/groups/'+g.id+'.json?include=users');for(const u of result.group.users){members.set(u.id,{id:u.id,name:u.name,groups:[...(members.get(u.id)?.groups??[]),name]});}}
    const actor=members.get(me.id);if(!actor)return fail(403,'Kein Zugriff auf das Rapportwesen');
    const s=await settings(config),service=keyApi(config,s.serviceKey);
    return {s,service,actor,members,dispatcher:actor.groups.includes(groups[0]!),creds};
  }
  type C=Awaited<ReturnType<typeof context>>;
  const detail=async(c:C,id:number)=>{const i=(await c.service<{issue:Issue}>('/issues/'+id+'.json?include=journals,allowed_statuses')).issue;return {i,r:decode(i,c.s)};};
  const allowed=(c:C,r:Report)=>{if(r.owner.id!==c.actor.id&&!c.dispatcher)fail(404,'Rapport nicht gefunden');};
  const list=async(c:C)=>(await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+(c.s.automatic?'':'&tracker_id='+c.s.tracker)+'&status_id=*')).filter(i=>!c.s.automatic||/^Rapport [0-9]+ \d{4}-\d{2}-\d{2}$/.test(i.subject));
  const listCorrections=async(c:C)=>c.s.correctionTracker?(await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+(c.s.automatic?'':'&tracker_id='+c.s.correctionTracker)+'&status_id=*')).filter(i=>!c.s.automatic||/^Rapportkorrektur [0-9]+$/.test(i.subject)):[];
  const getDay=async(c:C,employee:number,date:string,issues:Issue[])=>{
    const subject='Rapport '+employee+' '+date;
    const matches=issues.filter(i=>i.subject===subject);
    if(matches.length>1)fail(409,'Doppelter Tagesrapport in Redmine – bitte administrativ klären.');
    if(!matches.length)return null;
    const d=await detail(c,matches[0]!.id);if(d.r.owner.id!==employee||d.r.date!==date)fail(409,'Rapportkennung stimmt nicht');return d;
  };
  const payload=(c:C,d:Data)=>{if(c.s.automatic)return {is_private:true,description:'DERKUMPEL-RAPPORT/1\n'+JSON.stringify({...d,storageState:d.storageState??'draft'})};const a=summary(d);const values={owner:String(d.owner.id),date:d.date,work:String(a.work),target:String(a.target),pause:String(a.pause),difference:String(a.work-a.target),machines:String(d.lines.flatMap(l=>l.machines).reduce((n,m)=>n+m.minutes,0)),count:String(d.lines.length)};return {description:description(d),custom_fields:[{id:c.s.field,value:JSON.stringify(d)},...Object.entries(c.s.summaries).map(([k,id])=>({id,value:values[k as keyof typeof values]}))]};};
  const write=async(c:C,i:Issue,d:Data,notes:string,status?:number)=>{
    if(c.s.automatic&&!d.storageState){const prior=decode(i,c.s);d={...d,storageState:prior.state,storageReviewed:prior.storageReviewed,storageReturnNote:prior.storageReturnNote};}
    await c.service('/issues/'+i.id+'.json','PUT',{issue:{...payload(c,d),notes,...(status&&!c.s.automatic?{status_id:status}:{})}});
    const actual=await detail(c,i.id);if(JSON.stringify(actual.r.lines)!==JSON.stringify(d.lines)||actual.r.material!==d.material||JSON.stringify(actual.r.submitted)!==JSON.stringify(d.submitted)||(status!==undefined&&!c.s.automatic&&actual.i.status.id!==status)||(c.s.automatic&&actual.r.state!==d.storageState))fail(409,'Redmine hat die Änderung nicht vollständig übernommen. Bitte Konfiguration prüfen.');return actual.r;
  };
  const archiveRecord=async(c:C,r:Report)=>{if(!c.s.archiveTracker)return null;const matches=(await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+(c.s.automatic?'':'&tracker_id='+c.s.archiveTracker)+'&status_id=*')).filter(i=>i.subject==='Rapportarchiv '+r.id);if(matches.length>1)fail(409,'Doppelter Archivbeleg');if(!matches.length)return null;const {issue}=await c.service<{issue:Issue}>('/issues/'+matches[0]!.id+'.json?include=attachments');if(issue.project.id!==c.s.project||(!c.s.automatic&&issue.tracker.id!==c.s.archiveTracker)||(!c.s.automatic&&issue.status.id!==c.s.statuses.closed))fail(409,'Archivbeleg nicht korrekt gesperrt');return issue;};
  const archivedPdf=async(c:C,r:Report):Promise<Buffer|null>=>{const record=await archiveRecord(c,r);if(!record)return null;const a=record.attachments?.find(x=>x.filename==='Rapport-'+r.id+'.pdf');if(!a)fail(409,'Archiv-PDF fehlt');const url=new URL(a.content_url,config.redmineBaseUrl);if(url.origin!==config.redmineBaseUrl.origin||!validAttachmentPath(url.pathname))fail(502,'Ungültiger Archivanhang');const response=await fetch(url,{headers:{'X-Redmine-API-Key':c.s.serviceKey},redirect:'error',signal:AbortSignal.timeout(config.redmineTimeoutMs)});if(!response.ok)fail(502,'Archivanhang nicht lesbar');const bytes=Buffer.from(await response.arrayBuffer());if(record.description!=='SHA256 '+createHash('sha256').update(bytes).digest('hex'))fail(409,'Archiv-Prüfsumme stimmt nicht');return bytes;};
  const archive=async(c:C,r:Report)=>{if(!c.s.archiveTracker)fail(503,'Archivtracker nicht konfiguriert');if(r.state!=='closed'||!r.reviewed||!r.submitted)fail(409,'Nur vollständig bestätigte Rapporte archivieren');const existing=await archiveRecord(c,r);if(existing){await archivedPdf(c,r);return {id:existing.id};}const bytes=rapportPdf(r),filename='Rapport-'+r.id+'.pdf';const url=new URL('/uploads.json?filename='+encodeURIComponent(filename),config.redmineBaseUrl);const response=await fetch(url,{method:'POST',headers:{'X-Redmine-API-Key':c.s.serviceKey,'Content-Type':'application/octet-stream'},body:bytes,redirect:'error',signal:AbortSignal.timeout(config.redmineTimeoutMs)});if(!response.ok)fail(502,'Archivupload fehlgeschlagen');const token=(await response.json() as {upload?:{token?:string}}).upload?.token;if(!token)fail(502,'Archivupload ohne Token');const created=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.archiveTracker,status_id:c.s.statuses.closed,subject:'Rapportarchiv '+r.id,...(c.s.automatic?{is_private:true}:{}),description:'SHA256 '+createHash('sha256').update(bytes).digest('hex'),uploads:[{token,filename,content_type:'application/pdf'}]}});await archivedPdf(c,r);return {id:created.issue.id};};
  const note=(c:C,action:string)=>'DerKumpel: '+action+' — '+c.actor.name+' (Benutzer #'+c.actor.id+') · '+new Date().toISOString();
  // The directory credential is used exclusively for this explicitly scoped metadata catalogue.
  const normalized=(name:string)=>name.trim().normalize('NFC').toLocaleLowerCase('de');
  async function greenCatalogue(c:C){
    const admin=keyApi(config,c.s.directoryKey);
    function unique(items:{id:number;name:string}[],name:string,kind:string){
      const matches=items.filter(x=>normalized(x.name)===name);
      if(matches.length>1)fail(503,kind+' nicht eindeutig: '+name);
      return matches[0]?.id;
    }
    const configured=process.env.GREEN_PROJECT_IDENTIFIER?.trim();
    let project:StoreProject|undefined;
    if(configured){
      project=(await admin<{project:StoreProject}>('/projects/'+encodeURIComponent(configured)+'.json?include=trackers')).project;
      if(project.identifier!==configured)fail(503,'Grünpflegeprojekt nicht eindeutig.');
    }else{
      const matches:StoreProject[]=[];
      for(let offset=0;offset<100000;){
        const page=await admin<{projects:StoreProject[];total_count:number}>('/projects.json?limit=100&offset='+offset);
        matches.push(...page.projects.filter(p=>['grünpflegearbeiten','grünfplegearbeiten'].includes(normalized(p.name))));
        offset+=page.projects.length;
        if(!page.projects.length||offset>=page.total_count)break;
      }
      if(matches.length!==1)fail(503,'Technisches Projekt „Grünpflegearbeiten“ fehlt oder ist nicht eindeutig.');
      project=(await admin<{project:StoreProject}>('/projects/'+matches[0]!.id+'.json?include=trackers')).project;
    }
    if(!project||!Number.isSafeInteger(project.id)||[c.s.project,c.s.catalogProject].includes(project.id))fail(503,'Grünpflegeprojekt muss vom Rapportspeicher getrennt sein.');
    rememberInternalRapportProject(project.id);
    const trackers=(await admin<{trackers:{id:number;name:string}[]}>('/trackers.json')).trackers;
    const tracker=process.env.GREEN_TRACKER_ID?idEnv('GREEN_TRACKER_ID'):unique(trackers,'grünpflegearbeiten','Tracker')??unique(trackers,'grünfplegearbeiten','Tracker');
    if(!tracker||!project.trackers?.some(t=>t.id===tracker))fail(503,'Tracker „Grünpflegearbeiten“ fehlt im technischen Projekt.');
    const fields=(await admin<{custom_fields:{id:number;name:string;customized_type:string}[]}>('/custom_fields.json')).custom_fields.filter(f=>f.customized_type==='issue');
    const field=process.env.GREEN_MUNICIPALITY_FIELD_ID?idEnv('GREEN_MUNICIPALITY_FIELD_ID'):unique(fields,'ort','Ticketfeld');
    if(!field)fail(503,'Das benutzerdefinierte Ticketfeld „Ort“ wurde nicht gefunden.');
    // Catalogue records are usually created directly as closed (Erledigt), without a workflow.
    // Explicit wildcard is mandatory: Redmine otherwise defaults to open issues.
    const issues=await pages<Issue>(admin,'/issues.json?project_id='+project.id+'&tracker_id='+tracker+'&status_id=*');
    return issues.filter(i=>i.project.id===project.id&&i.tracker.id===tracker).map(i=>{
      const raw=i.custom_fields?.find(f=>f.id===field)?.value;
      const municipalities=[...new Set((Array.isArray(raw)?raw:[raw]).filter((v):v is string=>typeof v==='string').map(v=>v.trim().normalize('NFC')).filter(Boolean))];
      return {id:i.id,subject:i.subject,municipalities};
    });
  }
  async function sourceRefs(c:C,value:unknown,kind?:unknown):Promise<SourceRef[]> {
    const ids=[...new Set(arr(value??[],50).map(x=>{if(typeof x!=='number'||!Number.isSafeInteger(x)||x<=0)fail(400,'Ungültige Auftragsreferenz');return x;}))];
    if(!ids.length)return [];
    let green:Awaited<ReturnType<typeof greenCatalogue>>|undefined;
    const lookupGreen=async(id:number)=>{green??=await greenCatalogue(c);return green.find(t=>t.id===id);};
    const result:SourceRef[]=[];
    for(const id of ids){
      if(kind==='green'){const task=await lookupGreen(id);if(!task)fail(404,'Grünpflegeaufgabe nicht gefunden');result.push(task);continue;}
      // Backwards compatibility for queued captures: only allow the privileged lookup in the fixed catalogue.
      let issue:Issue|undefined;
      try{issue=(await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+id+'.json')).issue;}catch(e){if(!(e instanceof RedmineError&&[403,404].includes(e.status)))throw e;}
      if(issue&&![c.s.project,c.s.catalogProject].includes(issue.project.id)&&!internalRapportProject(issue.project.id,issue.project.name)){result.push({id:issue.id,subject:issue.subject});continue;}
      if(issue&&[c.s.project,c.s.catalogProject].includes(issue.project.id))fail(400,'Interne Vorgänge sind keine Aufträge');
      const task=await lookupGreen(id);if(!task)fail(404,'Auftragsreferenz nicht gefunden');result.push(task);
    }
    return result;
  }
  app.get('/api/rapport/green/tasks',async (r,reply)=>{
    reply.header('Cache-Control','no-store');
    const c=await context(r);
    return {tasks:await greenCatalogue(c)};
  });
  app.get('/api/rapport/users',async r=>{const c=await context(r);return {users:[...c.members.values()].sort((a,b)=>a.name.localeCompare(b.name,'de')),missingGroups:[],dispatcher:c.dispatcher};});
  app.get('/api/rapport/reports',async r=>{const c=await context(r),q=r.query as {from?:string;to?:string;all?:string};if(!validDate(q.from)||!validDate(q.to)||q.from>q.to)return fail(400,'Ungültiger Zeitraum');if(q.all==='1'&&!c.dispatcher)return fail(403,'Nur Disponenten');const reports=[...await list(c),...await listCorrections(c)].map(i=>decode(i,c.s)).filter(d=>d.date>=q.from!&&d.date<=q.to!&&(q.all==='1'||d.owner.id===c.actor.id));return {reports,dispatcher:c.dispatcher};});
  app.post('/api/rapport/reports/:id/correction',async r=>{const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten');if(!c.s.correctionTracker)fail(503,'Korrekturtracker nicht eingerichtet');const reason=str(obj(r.body).reason,1000);if(!reason)fail(400,'Korrekturbegründung erforderlich');return serialized(async()=>{const {r:original}=await detail(c,Number((r.params as {id:string}).id));if(original.state!=='closed')fail(409,'Nur abgeschlossene Rapporte korrigieren');const existing=(await listCorrections(c)).map(i=>decode(i,c.s)).filter(d=>d.correction?.reportId===original.id);if(existing.length)fail(409,'Zu diesem Beleg besteht bereits eine Korrektur. Bitte diese öffnen oder den aktuell abgeschlossenen Korrekturbeleg korrigieren.');const data:Data={version:1,owner:original.owner,date:original.date,lines:original.lines,material:original.material,correction:{reportId:original.id,reason,createdBy:{id:c.actor.id,name:c.actor.name},createdAt:new Date().toISOString()}};const created=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.correctionTracker,status_id:c.s.statuses.draft,subject:'Rapportkorrektur '+original.id,...payload(c,data)}});const actual=(await detail(c,created.issue.id)).r;if(actual.correction?.reportId!==original.id||actual.state!=='draft')fail(409,'Korrektur nicht vollständig angelegt');return actual;});});
  app.get('/api/rapport/reports/:id',async r=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return d;});
  app.post('/api/rapport/capture',async r=>{const c=await context(r),b=obj(r.body);if(b.actorId!==c.actor.id)return fail(403,'Erfasser stimmt nicht mit Anmeldung überein');if(!validDate(b.date))return fail(400,'Arbeitstag ungültig');const date=b.date;const line=parseLine(b.line,c.actor);line.sources=await sourceRefs(c,obj(b.line).sourceIds,obj(b.line).sourceKind);validateLines([line],date,false);if(line.machines.length||line.materials.length)fail(400,'Gemeinsame Ressourcen separat im verantwortlichen Rapport erfassen');const people=[...new Set(arr(b.employees,100).map(Number))];if(!people.length||people.some(id=>!c.members.has(id)))return fail(400,'Ungültige Mitarbeiterauswahl');return serialized(async()=>{const results=[];const issues=await list(c);for(const id of people){try{const existing=await getDay(c,id,date,issues);if(existing){const {i,r:d}=existing;const old=d.lines.find(l=>l.id===line.id);if(old){if(old.recordedBy.id!==c.actor.id||old.start!==line.start||old.end!==line.end||old.activity!==line.activity||JSON.stringify((old.sources??[]).map(s=>s.id))!==JSON.stringify((line.sources??[]).map(s=>s.id)))fail(409,'Vorgangs-ID bereits vergeben');results.push({employee:id,ok:true,reportId:i.id});continue;}if(!['draft','returned'].includes(d.state))fail(409,'Rapport bereits eingereicht oder abgeschlossen');const next:Data={version:1,owner:d.owner,date,lines:[...d.lines,line],material:d.material,...(d.submitted?{submitted:d.submitted}:{})};validateLines(next.lines,date,false);await write(c,i,next,note(c,'Leistung vorerfasst '+line.id));results.push({employee:id,ok:true,reportId:i.id});}else{const owner=c.members.get(id)!;const d:Data={version:1,owner:{id,name:owner.name},date,lines:[line],material:''};const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.tracker,status_id:c.s.statuses.draft,subject:'Rapport '+id+' '+date,...payload(c,d)}});const actual=await detail(c,result.issue.id);if(actual.r.owner.id!==id||actual.r.date!==date||actual.r.state!=='draft'||!actual.r.lines.some(l=>l.id===line.id&&l.start===line.start&&l.end===line.end))fail(409,'Redmine hat die Anlage nicht vollständig übernommen.');results.push({employee:id,ok:true,reportId:result.issue.id});}}catch(e){results.push({employee:id,ok:false,message:e instanceof RedmineError?e.message:'Übertragung fehlgeschlagen'});}}return {results};});});
  app.put('/api/rapport/reports/:id',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');if(d.state==='closed'||(!c.dispatcher&&!['draft','returned'].includes(d.state)))fail(409,'Rapport ist gesperrt');const reason=str(b.reason??'');if(c.dispatcher&&d.owner.id!==c.actor.id&&!reason)fail(400,'Korrekturbegründung erforderlich');if(!['draft','returned'].includes(d.state)&&!reason)fail(400,'Korrekturbegründung erforderlich');const lines=await Promise.all(arr(b.lines,200).map(async x=>{const prior=d.lines.find(l=>l.id===obj(x).id);const line=parseLine(x,c.actor,prior);if(obj(x).sourceIds!==undefined)line.sources=await sourceRefs(c,obj(x).sourceIds,obj(x).sourceKind);return line;}));validateLines(lines,d.date,false);const next:Data={version:1,owner:d.owner,date:d.date,lines,material:str(b.material??'',5000),...(d.submitted?{submitted:d.submitted}:{}),...(d.correction?{correction:d.correction}:{})};const prior=summary(d),after=summary(next);const changed=lines.filter(l=>JSON.stringify(l)!==JSON.stringify(d.lines.find(x=>x.id===l.id))).length;const removed=d.lines.filter(l=>!lines.some(x=>x.id===l.id)).length;return write(c,i,next,note(c,'Rapport korrigiert; Arbeitszeit '+fmt(prior.work)+' → '+fmt(after.work)+' h; '+changed+' geänderte/neue und '+removed+' entfernte Positionen'+(reason?': '+reason:'')));});});
  app.post('/api/rapport/reports/:id/transition',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');const action=b.action,reason=str(b.reason??'');if(action==='submit'&&d.owner.id===c.actor.id&&['draft','returned'].includes(d.state)){validateLines(d.lines,d.date,true);const next:Data={version:1,owner:d.owner,date:d.date,lines:d.lines,material:d.material,submitted:{by:{id:c.actor.id,name:c.actor.name},at:new Date().toISOString()},...(d.correction?{correction:d.correction}:{})};if(c.s.automatic)return write(c,i,{...next,storageState:'submitted'},note(c,'Eingereicht'));if(!i.allowed_statuses?.some(s=>s.id===c.s.statuses.submitted))fail(409,'Redmine-Workflow erlaubt Einreichung nicht');return write(c,i,next,note(c,'Eingereicht'),c.s.statuses.submitted);}
    if(!c.dispatcher)return fail(403,'Nur Disponenten');const next:State|undefined=action==='review'&&d.state==='submitted'?'review':action==='return'&&['submitted','review'].includes(d.state)?'returned':action==='close'&&['submitted','review'].includes(d.state)?'closed':undefined;if(!next)return fail(409,'Unzulässiger Statuswechsel');if(next==='returned'&&!reason)fail(400,'Rückgabebegründung erforderlich');if(next==='closed'){validateLines(d.lines,d.date,true);if(!d.submitted)fail(409,'Digitale Einreichung fehlt');}
    if(c.s.automatic){const data:Data={version:1,owner:d.owner,date:d.date,lines:d.lines,material:d.material,submitted:d.submitted,correction:d.correction,storageState:next,...(next==='closed'?{storageReviewed:{by:{id:c.actor.id,name:c.actor.name},at:new Date().toISOString()}}:{}),...(next==='returned'?{storageReturnNote:reason}:{})};return write(c,i,data,note(c,action+(reason?': '+reason:'')+(next==='closed'&&d.owner.id===c.actor.id?' (Selbstprüfung)':'')));}
    const personal=(await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+i.id+'.json?include=allowed_statuses')).issue;if(!personal.allowed_statuses?.some(s=>s.id===c.s.statuses[next]))fail(403,'Redmine-Workflow erlaubt Statuswechsel nicht');
    await redmineJson(config,c.creds,'/issues/'+i.id+'.json',{method:'PUT',body:JSON.stringify({issue:{status_id:c.s.statuses[next],notes:note(c,action+(reason?': '+reason:'')+(next==='closed'&&d.owner.id===c.actor.id?' (Selbstprüfung)':''))}})});const actual=await detail(c,i.id);if(actual.i.status.id!==c.s.statuses[next])fail(409,'Redmine hat den Statuswechsel nicht übernommen');return actual.r;});});
  app.get('/api/rapport/orders',async r=>{const c=await context(r);const q=(r.query as {q?:string}).q?.trim()??'';if(q.length<2||q.length>100)return {orders:[]};const personal:Get=<T>(path:string)=>redmineJson<T>(config,c.creds,path);const items=await pages<Issue>(personal,'/issues.json?status_id=*&subject='+encodeURIComponent('~'+q));return {orders:items.filter(i=>![c.s.project,c.s.catalogProject].includes(i.project.id)&&!internalRapportProject(i.project.id,i.project.name)&&i.subject.toLocaleLowerCase('de').includes(q.toLocaleLowerCase('de'))).slice(0,30).map(i=>({id:i.id,subject:i.subject}))};});
  app.get('/api/rapport/order/:id',async r=>{const c=await context(r),id=Number((r.params as {id:string}).id);if(!Number.isSafeInteger(id)||id<=0)return fail(400,'Auftragsnummer ungültig');const {issue}=await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+id+'.json');if([c.s.project,c.s.catalogProject].includes(issue.project.id)||internalRapportProject(issue.project.id,issue.project.name))return fail(404,'Auftrag nicht gefunden');return {id:issue.id,subject:issue.subject};});
  app.get('/api/rapport/catalog',async r=>{const c=await context(r);const items=await pages<Issue>(c.service,'/issues.json?project_id='+c.s.catalogProject+'&status_id=open');return {machines:items.filter(i=>c.s.automatic?i.subject.startsWith('DK Maschine: '):i.tracker.id===c.s.machineTracker).map(i=>({id:i.id,name:c.s.automatic?i.subject.slice('DK Maschine: '.length):i.subject})),materials:items.filter(i=>c.s.automatic?i.subject.startsWith('DK Material: '):i.tracker.id===c.s.materialTracker).map(i=>({id:i.id,name:c.s.automatic?i.subject.slice('DK Material: '.length):i.subject}))};});
  app.post('/api/rapport/catalog',async r=>{const c=await context(r);if(!c.dispatcher)return fail(403,'Nur Disponenten');const b=obj(r.body),name=str(b.name,200);if(!name||!['machine','material'].includes(String(b.kind)))return fail(400,'Ungültige Stammdaten');const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.catalogProject,tracker_id:b.kind==='machine'?c.s.machineTracker:c.s.materialTracker,...(c.s.automatic?{status_id:c.s.statuses.draft}:{}),subject:c.s.automatic?(b.kind==='machine'?'DK Maschine: ':'DK Material: ')+name:name,...(c.s.automatic?{is_private:true}:{}),description:note(c,'Stammdatum angelegt')}});return {id:result.issue.id,name};});
  app.get('/api/rapport/pdf',async(r,reply)=>{const c=await context(r),q=r.query as {ids?:string};const ids=[...new Set((q.ids??'').split(',').map(Number))];if(!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<=0))return fail(400,'Bitte maximal 100 gültige Rapporte auswählen');const reports=[];for(const id of ids){const {r:d}=await detail(c,id);allowed(c,d);reports.push(d);}return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapporte.pdf"').send(rapportPdfMany(reports));});
  app.post('/api/rapport/reports/:id/archive',async r=>{const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten');return serialized(async()=>{const {r:d}=await detail(c,Number((r.params as {id:string}).id));return archive(c,d);});});
  app.get('/api/rapport/reports/:id/pdf',async(r,reply)=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapport-'+d.date+'-'+d.owner.id+'.pdf"').send((d.state==='closed'?await archivedPdf(c,d):null)??rapportPdf(d));});
}
