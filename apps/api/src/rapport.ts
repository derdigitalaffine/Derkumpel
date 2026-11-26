import {resourceText,usageText,noteMarker,orderTicket,type ResourceUsage} from './resourceNotes.js';
import {holidaySubject,holidayTemplate,parseHolidays,validHolidayYear,overtimeRows,type HolidayCalendar,type Holiday} from './holidays.js';
import { equipmentSubject,equipmentTemplate,equipmentNames,equipmentAdditions,equipmentKey } from './equipmentCatalog.js';
import { materialSubject,materialTemplate,parseMaterials,materialRow,type MaterialItem } from './materialCatalog.js';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import type { CredentialEnvelope } from './session.js';
import { fetchCurrentUser, redmineJson, RedmineError, rememberInternalRapportProject, resetInternalRapportProjects, internalRapportProject } from './redmine.js';
import { rapportPdf, rapportPdfMany } from './rapportPdf.js';

type Person = { id: number; name: string };
type Member = Person & { groups: string[] };
type State = 'draft'|'submitted'|'review'|'returned'|'closed';
type SourceRef={id:number;subject:string;municipalities?:string[]};
type Line = { sharedResources?:ResourceUsage[]; greenEventId?:number; sources?:SourceRef[]; id: string; start: string; end: string; kind: 'work'|'pause'; activity: string; order: string; machines: {name:string; minutes:number}[]; materials: {name:string; quantity:number; unit:string}[]; recordedBy: Person; recordedAt:string };
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
  for(let i=1;i<sorted.length;i++)if(sorted[i]!.start<sorted[i-1]!.end)fail(409,'Zeitüberschneidung: '+time(sorted[i-1]!.start)+'–'+time(sorted[i-1]!.end)+' und '+time(sorted[i]!.start)+'–'+time(sorted[i]!.end)+'.');
}
export function validateQuarterTimes(line:Pick<Line,'start'|'end'>,prior?:Pick<Line,'start'|'end'>){
  if(prior&&Date.parse(prior.start)===Date.parse(line.start)&&Date.parse(prior.end)===Date.parse(line.end))return;
  if(!Number.isFinite(Date.parse(line.start))||!Number.isFinite(Date.parse(line.end))||Date.parse(line.start)%900000!==0||Date.parse(line.end)%900000!==0)fail(400,'Rapportbeginn und -ende müssen auf :00, :15, :30 oder :45 liegen.');
}
function parseLine(value:unknown,actor:Person,prior?:Line):Line {
  const v=obj(value);const start=instant(v.start),end=instant(v.end);
  if(v.kind!=='work'&&v.kind!=='pause')return fail(400,'Ungültiger Positionstyp');
  if((Date.parse(end)-Date.parse(start))%60000!==0)fail(400,'Nur minutengenaue Zeiträume erlaubt.');
  const machines=arr(v.machines??[],20).map(x=>{const m=obj(x),minutes=positive(m.minutes,1440);if(!Number.isInteger(minutes))fail(400,'Maschinenzeit muss in Minuten angegeben werden');return {name:str(m.name,200),minutes};});
  const materials=arr(v.materials??[],30).map(x=>{const m=obj(x);return {name:str(m.name,200),quantity:positive(m.quantity,1e8),unit:str(m.unit,40)};});
  if(machines.some(m=>!m.name||/[\r\n]/.test(m.name)||m.name.startsWith('#'))||materials.some(m=>!m.name||!m.unit))fail(400,'Maschine oder Material unvollständig');
  if(v.kind==='pause'&&(machines.length||materials.length))fail(400,'Keine Maschinen oder Materialien in Pausen');
  return {...(prior?.greenEventId?{greenEventId:prior.greenEventId}:{}),...(prior?.sharedResources?{sharedResources:prior.sharedResources}:{}),sources:prior?.sources??[],id:uid(v.id),start,end,kind:v.kind,activity:str(v.activity??''),order:str(v.order??'',200),machines,materials,recordedBy:prior?.recordedBy??actor,recordedAt:prior?.recordedAt??new Date().toISOString()};
}
export function summary(data:Data) {return {work:data.lines.filter(l=>l.kind==='work').reduce((n,l)=>n+duration(l),0),pause:data.lines.filter(l=>l.kind==='pause').reduce((n,l)=>n+duration(l),0),target:target(data.date)};}
const fmt=(n:number)=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
const time=(s:string)=>new Date(s).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const revision=(i:Issue)=>createHash('sha256').update(JSON.stringify([i.updated_on,i.status.id,i.custom_fields,i.description])).digest('hex');
function description(d:Data) {
  const safe=(s:string)=>s.replace(/[\r\n|]/g,' ').replace(/</g,'‹').replace(/>/g,'›');
  return [d.correction?'Korrektur zu Rapport #'+d.correction.reportId+' — '+safe(d.correction.reason):'Tagesrapport '+d.date.split('-').reverse().join('.')+' — '+safe(d.owner.name),'','| Von | Bis | Stunden | Art der Leistung | Auftrag |','| --- | --- | --- | --- | --- |',...d.lines.map(l=>'| '+[time(l.start),time(l.end),fmt(duration(l)),safe(l.kind==='pause'?'Pause':l.activity),safe([l.order,...(l.sources??[]).map(s=>'#'+s.id)].filter(Boolean).join(', '))].join(' | ')+' |'),'','Arbeitszeit: '+fmt(summary(d).work)+' h; explizite Pausen: '+fmt(summary(d).pause)+' h','Material: '+safe(d.material),...d.lines.flatMap(l=>[...l.machines.map(m=>'Maschine: '+safe(m.name)+' '+fmt(m.minutes)+' h'),...l.materials.map(m=>'Material: '+safe(m.name)+' '+m.quantity+' '+safe(m.unit))])].join('\n');
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
    let r:Response;try{r=await fetch(url,{method,redirect:'error',headers:{'X-Redmine-API-Key':key,Accept:'application/json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(config.redmineTimeoutMs)});}catch(e){if(e instanceof Error&&['TimeoutError','AbortError'].includes(e.name))fail(504,'Redmine-Zeitüberschreitung: '+method+' '+url.pathname);throw new RedmineError(502,'Redmine-Verbindung fehlgeschlagen: '+method+' '+url.pathname);}
    if(!r.ok)return fail(r.status===401?503:r.status,'Redmine-Rapportzugriff fehlgeschlagen ('+r.status+'): '+method+' '+url.pathname);
    return (r.status===204?undefined:await r.json()) as T;
  };
}
async function pages<T>(get:Get,path:string):Promise<T[]> {
  const out:T[]=[];for(let offset=0;offset<100000;){const p=await get<{issues:T[];total_count?:number}>(path+'&limit=100&offset='+offset);if(!Array.isArray(p.issues))fail(502,'Ungültige Redmine-Liste');out.push(...p.issues);offset+=p.issues.length;if(!p.issues.length||offset>=(p.total_count??offset))return out;}return fail(503,'Zu viele Rapporte, Zeitraum begrenzen.');
}
type StoreProject={id:number;identifier:string;name:string;is_public:boolean;trackers?:{id:number;name:string}[];enabled_modules?:{name:string}[]};
type Tracker={id:number;name:string;default_status?:{id:number}};
type Selection={storageProjectId:number|null;storageTrackerId:number|null;greenProjectId:number|null;greenTrackerId:number|null;greenFieldId:number|null};
const emptySelection:Selection={storageProjectId:null,storageTrackerId:null,greenProjectId:null,greenTrackerId:null,greenFieldId:null};
function parseSelection(raw:unknown):Selection{
  const v=obj(raw);const result={...emptySelection};for(const k of Object.keys(result) as (keyof Selection)[]){const n=v[k];if(n!==null&&(typeof n!=='number'||!Number.isSafeInteger(n)||n<=0))fail(400,'Ungültige Einstellung: '+k);result[k]=n as number|null;}
  if(result.storageProjectId!==null&&result.storageProjectId===result.greenProjectId)fail(400,'Rapportspeicher und Grünpflegekatalog müssen getrennt sein');
  return result;
}
function settingsFile(){return process.env.RAPPORT_SETTINGS_FILE||'/app/push-data/rapport-settings.json';}
function readSelection():Selection{
  try{return parseSelection(JSON.parse(readFileSync(settingsFile(),'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {...emptySelection};throw new RedmineError(503,'Gespeicherte erweiterte Einstellungen sind nicht lesbar.');}
}
async function persistSelection(value:Selection){
  const path=settingsFile(),temp=path+'.'+randomUUID()+'.tmp';
  try{await mkdir(dirname(path),{recursive:true});await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,path);}catch{await unlink(temp).catch(()=>undefined);fail(503,'Erweiterte Einstellungen konnten nicht im persistenten Servervolume gespeichert werden.');}
}
async function allProjects(get:Get):Promise<StoreProject[]>{
  const out:StoreProject[]=[];for(let offset=0;offset<100000;){const p=await get<{projects:StoreProject[];total_count:number}>('/projects.json?limit=100&offset='+offset);out.push(...p.projects);offset+=p.projects.length;if(!p.projects.length||offset>=p.total_count)return out;}return fail(503,'Zu viele Redmine-Projekte.');
}
async function automaticSettings(config:AppConfig,selection:Selection):Promise<Settings>{
  if(config.redmineBaseUrl.protocol!=='https:')fail(503,'Rapportwesen benötigt HTTPS.');
  const directoryKey=process.env.RAPPORT_DIRECTORY_KEY||process.env.DERKUMPEL_ADMIN_API_KEY||process.env.PUSH_POLL_API_KEY||'';
  if(!directoryKey)fail(503,'Server: Redmine-Administratorschlüssel fehlt (DERKUMPEL_ADMIN_API_KEY oder PUSH_POLL_API_KEY).');
  const serviceKey=process.env.RAPPORT_SERVICE_KEY||directoryKey;
  const admin=keyApi(config,directoryKey),service=keyApi(config,serviceKey);
  const configuredIdentifier=process.env.DERKUMPEL_PROJECT_IDENTIFIER?.trim();
  const identifier=selection.storageProjectId?String(selection.storageProjectId):configuredIdentifier||'derkumpel';
  let project:StoreProject;
  try{project=(await admin<{project:StoreProject}>('/projects/'+encodeURIComponent(identifier)+'.json?include=trackers,enabled_modules')).project;}catch(e){
    if(!(e instanceof RedmineError&&e.status===404))throw e;
    if(configuredIdentifier||selection.storageProjectId)fail(503,'Das Redmine-Speicherprojekt '+identifier+' wurde nicht gefunden.');
    const matches:StoreProject[]=[];
    for(let offset=0;offset<100000;){const page=await admin<{projects:StoreProject[];total_count:number}>('/projects.json?limit=100&offset='+offset);matches.push(...page.projects.filter(p=>p.name.toLocaleLowerCase('de')==='derkumpel'));offset+=page.projects.length;if(!page.projects.length||offset>=page.total_count)break;}
    if(matches.length!==1)fail(503,'Projekt DerKumpel fehlt oder ist nicht eindeutig. DERKUMPEL_PROJECT_IDENTIFIER setzen.');
    project=(await admin<{project:StoreProject}>('/projects/'+matches[0]!.id+'.json?include=trackers,enabled_modules')).project;
  }
  if(!project||!Number.isSafeInteger(project.id)||(selection.storageProjectId?project.id!==selection.storageProjectId:configuredIdentifier&&project.identifier!==configuredIdentifier))fail(503,'Speicherprojekt nicht eindeutig.');
  const [technicalResult,directoryResult,trackerResult,statusResult]=await Promise.all([service<{user:{id:number}}>('/users/current.json'),admin<{user:{id:number}}>('/users/current.json'),admin<{trackers:Tracker[]}>('/trackers.json'),admin<{issue_statuses:{id:number;is_closed:boolean}[]}>('/issue_statuses.json')]);
  const technical=technicalResult.user,directoryActor=directoryResult.user;
  // Never remove existing project memberships. Refuse an unsafe shared storage project.
  for(let offset=0;offset<100000;){const m=await admin<{memberships:{user?:{id:number};group?:{id:number}}[];total_count:number}>('/projects/'+project.id+'/memberships.json?limit=100&offset='+offset);if(!Array.isArray(m.memberships))fail(503,'Projektmitgliedschaften nicht prüfbar');if(m.memberships.some(x=>x.group||![technical.id,directoryActor.id].includes(x.user?.id??0)))fail(503,'DerKumpel-Speicherprojekt darf außer den technischen Konten keine Mitglieder enthalten.');offset+=m.memberships.length;if(!m.memberships.length||offset>=m.total_count)break;}
  if(project.is_public){await admin('/projects/'+project.id+'.json','PUT',{project:{is_public:false}});project=(await admin<{project:StoreProject}>('/projects/'+project.id+'.json?include=trackers,enabled_modules')).project;}
  if(project.is_public!==false)fail(503,'DerKumpel-Speicherprojekt muss privat sein.');
  const trackers=trackerResult.trackers,statuses=statusResult.issue_statuses;
  const usable=(t:Tracker)=>!!t.default_status&&statuses.some(s=>s.id===t.default_status!.id)&&t.id!==selection.greenTrackerId&&!['grünpflegearbeiten','grünfplegearbeiten'].includes(t.name.toLocaleLowerCase('de'));
  let tracker=selection.storageTrackerId?trackers.find(t=>t.id===selection.storageTrackerId&&usable(t)):trackers.find(t=>project.trackers?.some(x=>x.id===t.id)&&usable(t))??trackers.find(t=>usable(t)&&statuses.some(s=>s.id===t.default_status!.id&&!s.is_closed))??trackers.find(usable);
  if(!tracker)fail(503,'Kein geeigneter Speichertracker mit Standardstatus verfügbar.');
  if(!project.trackers?.some(t=>t.id===tracker!.id))await admin('/projects/'+project.id+'.json','PUT',{project:{tracker_ids:[...(project.trackers??[]).map(t=>t.id),tracker.id]}});
  if(project.enabled_modules&&!project.enabled_modules.some(m=>m.name==='issue_tracking'))await admin('/projects/'+project.id+'.json','PUT',{project:{enabled_module_names:[...project.enabled_modules.map(m=>m.name),'issue_tracking']}});
  const verified=(await service<{project:StoreProject}>('/projects/'+project.id+'.json?include=trackers,enabled_modules')).project;
  if(verified.is_public!==false||!verified.trackers?.some(t=>t.id===tracker!.id))fail(503,'Speicherprojekt-Konfiguration nicht übernommen.');
  rememberInternalRapportProject(project.id);
  const status=tracker.default_status!.id;
  return {automatic:true,project:project.id,catalogProject:project.id,tracker:tracker.id,machineTracker:tracker.id,materialTracker:tracker.id,archiveTracker:tracker.id,correctionTracker:tracker.id,field:0,statuses:{draft:status,submitted:status,review:status,returned:status,closed:status},summaries:{},directoryKey,serviceKey};
}

let pending:Promise<unknown>=Promise.resolve();
function serialized<T>(fn:()=>Promise<T>):Promise<T>{const run=pending.then(fn,fn);pending=run.catch(()=>undefined);return run;}
export function registerRapport(app:FastifyInstance,config:AppConfig,credentials:(r:FastifyRequest)=>CredentialEnvelope) {
  let selection:Selection|undefined;
  const selected=()=>selection??=readSelection();
  let setupCache:{value:Settings;until:number}|undefined,setupPending:Promise<Settings>|undefined;
  function settings():Promise<Settings>{
    const mode=process.env.RAPPORT_STORAGE_MODE;
    if(mode==='native'||(mode!=='automatic'&&process.env.RAPPORT_ENABLED==='true'&&process.env.RAPPORT_DATA_FIELD_ID&&!selected().storageProjectId))return Promise.resolve(nativeSettings(config));
    if(mode==='disabled')return Promise.reject(new RedmineError(503,'Rapportwesen wurde deaktiviert.'));
    if(setupCache&&setupCache.until>Date.now())return Promise.resolve(setupCache.value);
    if(!setupPending)setupPending=automaticSettings(config,selected()).then(value=>{setupCache={value,until:Date.now()+30000};return value;}).finally(()=>{setupPending=undefined;});
    return setupPending;
  }
  // Load configured project IDs before ordinary ticket routes can return them.
  try{const s=selected();for(const id of [s.storageProjectId,s.greenProjectId])if(id)rememberInternalRapportProject(id);}catch(e){app.log.error({message:e instanceof Error?e.message:'Settings invalid'});}
  const adminKey=()=>{const key=process.env.RAPPORT_DIRECTORY_KEY||process.env.DERKUMPEL_ADMIN_API_KEY||process.env.PUSH_POLL_API_KEY||'';if(!key)fail(503,'Server: Redmine-Administratorschlüssel für Gruppenabfrage fehlt.');if(config.redmineBaseUrl.protocol!=='https:')fail(503,'Rapportwesen benötigt HTTPS.');return key;};
  let rosterCache:{members:Map<number,Member>;until:number}|undefined,rosterPending:Promise<Map<number,Member>>|undefined;
  async function roster(){
    if(rosterCache&&rosterCache.until>Date.now())return rosterCache.members;
    if(!rosterPending)rosterPending=(async()=>{const directory=keyApi(config,adminKey()),all=await directory<{groups:Person[]}>('/groups.json');const members=new Map<number,Member>();
      const results=await Promise.all(groups.map(async name=>{const g=all.groups.find(x=>x.name===name);if(!g)fail(503,'Redmine-Gruppe fehlt: '+name);return {name,users:(await directory<{group:{users:Person[]}}>('/groups/'+g.id+'.json?include=users')).group.users};}));
      for(const {name,users} of results)for(const u of users)members.set(u.id,{id:u.id,name:u.name,groups:[...(members.get(u.id)?.groups??[]),name]});
      rosterCache={members,until:Date.now()+15000};return members;
    })().finally(()=>{rosterPending=undefined;});
    return rosterPending;
  }
  async function identity(r:FastifyRequest){
    const creds=credentials(r),me=(await fetchCurrentUser(config,creds)).user;
    if(process.env.RAPPORT_STORAGE_MODE==='disabled')fail(503,'Rapportwesen wurde deaktiviert.');
    const members=await roster(),actor=members.get(me.id);if(!actor)fail(403,'Kein Zugriff auf das Rapportwesen');
    return {creds,actor,members,dispatcher:actor.groups.includes(groups[0]!)};
  }
  async function administrator(r:FastifyRequest){
    const me=await fetchCurrentUser(config,credentials(r));
    if(me.user.admin!==true)fail(403,'Nur Redmine-Administratoren dürfen erweiterte Einstellungen ändern.');
    return keyApi(config,adminKey());
  }
  async function context(r:FastifyRequest){
    const actorContext=await identity(r),s=await settings(),service=keyApi(config,s.serviceKey);
    return {...actorContext,s,service};
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
  type GreenScope={s:Pick<Settings,'directoryKey'|'project'|'catalogProject'>};
  async function greenStore(c:GreenScope){
    const admin=keyApi(config,c.s.directoryKey);
    function unique(items:{id:number;name:string}[],name:string,kind:string){
      const matches=items.filter(x=>normalized(x.name)===name);
      if(matches.length>1)fail(503,kind+' nicht eindeutig: '+name);
      return matches[0]?.id;
    }
    const chosen=selected();
    const configured=chosen.greenProjectId?String(chosen.greenProjectId):process.env.GREEN_PROJECT_IDENTIFIER?.trim();
    let project:StoreProject|undefined;
    if(configured){
      project=(await admin<{project:StoreProject}>('/projects/'+encodeURIComponent(configured)+'.json?include=trackers')).project;
      if(chosen.greenProjectId?project.id!==chosen.greenProjectId:project.identifier!==configured)fail(503,'Grünpflegeprojekt nicht eindeutig.');
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
    if(!project||!Number.isSafeInteger(project.id)||[c.s.project,c.s.catalogProject].includes(project.id)||normalized(project.name)==='derkumpel'||normalized(project.identifier)===normalized(process.env.DERKUMPEL_PROJECT_IDENTIFIER||'derkumpel'))fail(503,'Grünpflegeprojekt muss vom Rapportspeicher getrennt sein.');
    const trackers=(await admin<{trackers:Tracker[]}>('/trackers.json')).trackers;
    const tracker=chosen.greenTrackerId??(process.env.GREEN_TRACKER_ID?idEnv('GREEN_TRACKER_ID'):unique(trackers,'grünpflegearbeiten','Tracker')??unique(trackers,'grünfplegearbeiten','Tracker'));
    if(!tracker||!project.trackers?.some(t=>t.id===tracker))fail(503,'Tracker „Grünpflegearbeiten“ fehlt im technischen Projekt.');
    const fields=(await admin<{custom_fields:{id:number;name:string;customized_type:string}[]}>('/custom_fields.json')).custom_fields.filter(f=>f.customized_type==='issue');
    const field=chosen.greenFieldId??(process.env.GREEN_MUNICIPALITY_FIELD_ID?idEnv('GREEN_MUNICIPALITY_FIELD_ID'):unique(fields,'ort','Ticketfeld'));
    if(!field||!fields.some(f=>f.id===field))fail(503,'Das benutzerdefinierte Ticketfeld „Ort“ wurde nicht gefunden.');
    // Catalogue records are usually created directly as closed (Erledigt), without a workflow.
    // Explicit wildcard is mandatory: Redmine otherwise defaults to open issues.
    if(project.is_public!==false)fail(503,'Grünpflegeprojekt muss privat sein.');
    rememberInternalRapportProject(project.id);
    const issues=(await pages<Issue>(admin,'/issues.json?project_id='+project.id+'&tracker_id='+tracker+'&status_id=*')).filter(i=>i.project.id===project.id&&i.tracker.id===tracker);
    const tasks=issues.filter(i=>!i.subject.startsWith('DK Grünpflege-Einsatz ')).map(i=>{
      const raw=i.custom_fields?.find(f=>f.id===field)?.value;
      const municipalities=[...new Set((Array.isArray(raw)?raw:[raw]).filter((v):v is string=>typeof v==='string').map(v=>v.trim().normalize('NFC')).filter(Boolean))];
      return {id:i.id,subject:i.subject,municipalities};
    });
    return {admin,project,tracker,field,issues,tasks,defaultStatusId:trackers.find(t=>t.id===tracker)?.default_status?.id};
  }
  async function greenCatalogue(c:GreenScope){return (await greenStore(c)).tasks;}
  type Participation={employee:number;start:string;end:string};
  type Usage=ResourceUsage;
  type GreenEvent={version:1;participation?:Participation[];materials?:Usage[];operationId:string;actor:Person;employees:number[];sources:SourceRef[];startedAt:string;endedAt?:string;start?:string;end?:string;activity?:string;phase:'start'|'stop'|'finish'};
  const eventSubject=(actor:number,operation:string,phase:string)=>'DK Grünpflege-Einsatz '+actor+' '+operation+' '+phase;
  function readEvent(issue:Issue):GreenEvent {
    const m=/^DERKUMPEL-GREEN\/1(?:\r\n|\n|\r)/.exec(issue.description??'');if(!m)fail(409,'Ungültiger Grünpflege-Einsatz #'+issue.id);
    try{const d=JSON.parse(issue.description!.slice(m[0].length)) as GreenEvent;if(d.version!==1||!d.actor||!Array.isArray(d.sources)||!Array.isArray(d.employees)||issue.subject!==eventSubject(d.actor.id,d.operationId,d.phase))throw Error('invalid');return d;}catch{return fail(409,'Ungültiger Grünpflege-Einsatz #'+issue.id);}
  }
  async function greenEvent(c:C,body:unknown){
    const b=obj(body),operationId=uid(b.operationId),phase=b.phase;
    if(phase!=='start'&&phase!=='stop'&&phase!=='finish')fail(400,'Ungültiges Einsatzereignis');
    if(b.actorId!==c.actor.id)fail(403,'Erfasser stimmt nicht überein');
    const startedAt=instant(b.startedAt);
    const store=await greenStore(c),subject=eventSubject(c.actor.id,operationId,phase);
    const find=async(s:string)=>{const matches=store.issues.filter(i=>i.subject===s);if(matches.length>1)fail(409,'Doppelter Grünpflege-Einsatz');if(!matches.length)return null;const {issue}=await store.admin<{issue:Issue}>('/issues/'+matches[0]!.id+'.json');if(issue.project.id!==store.project.id||issue.tracker.id!==store.tracker||issue.subject!==s)fail(409,'Einsatzkennung stimmt nicht');return {issue,data:readEvent(issue)};};
    const employees=[...new Set(arr(b.employees,100).map(Number))].sort((a,b)=>a-b);
    if(!employees.length||employees.some(id=>!c.members.has(id)))fail(400,'Ungültige Kolonne');
    const ids=[...new Set(arr(b.sourceIds,50).map(Number))].sort((a,b)=>a-b);
    if(!ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<=0))fail(400,'Ungültige Aufgabenauswahl');
    const prior=await find(subject);
    let sources:SourceRef[];
    if(phase!=='start'){
      const begun=await find(eventSubject(c.actor.id,operationId,'start'));if(!begun)fail(409,'Arbeitsbeginn noch nicht synchronisiert');
      if(begun.data.startedAt!==startedAt||JSON.stringify(begun.data.employees)!==JSON.stringify(employees)||JSON.stringify(begun.data.sources.map(s=>s.id))!==JSON.stringify(ids))fail(409,'Einsatzdaten stimmen nicht mit Arbeitsbeginn überein');
      sources=begun.data.sources;
    }else if(prior){sources=prior.data.sources;}
    else{sources=ids.map(id=>{const task=store.tasks.find(t=>t.id===id);if(!task)fail(409,'Aufgabe #'+id+' wurde aus dem Katalog entfernt. Einsatz lokal erhalten.');return task;});}
    if(JSON.stringify(sources.map(s=>s.id))!==JSON.stringify(ids))fail(409,'Aufgabenauswahl stimmt nicht überein');
    const data:GreenEvent={version:1,operationId,actor:{id:c.actor.id,name:c.actor.name},employees,sources,startedAt,phase};
    if(phase!=='start'){
      data.endedAt=instant(b.endedAt);
      if(Date.parse(data.endedAt)<=Date.parse(startedAt))fail(400,'Ungültige tatsächliche Einsatzdauer');
      if(phase==='finish'){
        const stopped=await find(eventSubject(c.actor.id,operationId,'stop'));
        if(!stopped||stopped.data.endedAt!==data.endedAt)fail(409,'Arbeitsende noch nicht eindeutig synchronisiert');
        data.start=instant(b.start);data.end=instant(b.end);data.activity=str(b.activity??'');if(!prior)validateQuarterTimes({start:data.start,end:data.end});
        if(Date.parse(data.end)<=Date.parse(data.start)||Date.parse(data.end)-Date.parse(data.start)>86400000||(Date.parse(data.end)-Date.parse(data.start))%900000!==0)fail(400,'Ungültige Rapportdauer');
        if(b.participation!==undefined){const seen=new Set<number>();data.participation=arr(b.participation,100).map(v=>{const x=obj(v),employee=Number(x.employee),start=instant(x.start),end=instant(x.end);if(!employees.includes(employee)||seen.has(employee)||start<data.start!||end>data.end!||end<=start||dateInBerlin(new Date(start))!==dateInBerlin(new Date(data.start!)))fail(400,'Ungültige individuelle Teilnahme');seen.add(employee);validateQuarterTimes({start,end});return {employee,start,end};}).sort((a,b)=>a.employee-b.employee);if(!data.participation.length)fail(400,'Mindestens eine Person rapportieren');}
        if(b.materials!==undefined)data.materials=arr(b.materials,50).map(v=>{const x=obj(v),name=str(x.name,200),unit=str(x.unit,40),quantity=positive(x.quantity,1e8),note=str(x.note??'',300),code=x.code===undefined?undefined:str(x.code,60);if(!name||!unit)fail(400,'Material und Einheit erforderlich');if(x.kind!==undefined&&x.kind!=='machine'&&x.kind!=='material')fail(400,'Ungültiger Ressourcentyp');if(x.kind==='machine'&&(!Number.isInteger(quantity)||quantity>1440||unit!=='min'))fail(400,'Gerätezeit in Minuten erforderlich');return {...(code?{code}:{}),name,unit,quantity,note,...(x.kind==='machine'?{kind:'machine' as const}:{})};});
      }
    }
    const commentGreen=async(event:GreenEvent,eventId:number)=>{
      if(event.phase!=='finish'||!event.materials?.length)return;
      const body='DerKumpel – gemeinsamer Grünpflegeeinsatz vom '+dateInBerlin(new Date(event.start!)).split('-').reverse().join('.')+' (Einsatz #'+eventId+').\n'+usageText(event.materials).join('\n')+'\nGemeinsame Ressourcen für '+event.sources.length+' ausgewählte Aufgabe(n); nicht pro Aufgabe oder Mitarbeiter addieren. Ticketstatus unverändert.';
      // Deleted catalogue tasks do not invalidate historical reports.
      for(const source of event.sources){if(!store.tasks.some(t=>t.id===source.id))continue;
        await resourceJournal(store.admin,source.id,'green-'+eventId,body,i=>i.project.id===store.project.id&&i.tracker.id===store.tracker&&store.tasks.some(t=>t.id===i.id));}
    };
    if(prior){const comparable=(d:GreenEvent)=>JSON.stringify({...d,actor:{id:d.actor.id,name:''}});if(comparable(prior.data)!==comparable(data))fail(409,'Einsatzereignis bereits mit abweichenden Daten gespeichert');await commentGreen(prior.data,prior.issue.id);return {id:prior.issue.id};}
    const statuses=(await store.admin<{issue_statuses:{id:number;is_closed:boolean}[]}>('/issue_statuses.json')).issue_statuses;
    const closed=store.defaultStatusId;
    if(!closed||!statuses.some(s=>s.id===closed&&s.is_closed))fail(503,'Grünpflegetracker benötigt einen geschlossenen Standardstatus (Erledigt), damit technische Ereignisse ohne Workflow angelegt werden können.');
    const places=[...new Set(sources.flatMap(s=>s.municipalities??[]))];
    const created=await store.admin<{issue:Issue}>('/issues.json','POST',{issue:{project_id:store.project.id,tracker_id:store.tracker,status_id:closed,is_private:true,subject,description:'DERKUMPEL-GREEN/1\n'+JSON.stringify(data),...(places.length===1?{custom_fields:[{id:store.field,value:places[0]}]}:{})}});
    const {issue}=await store.admin<{issue:Issue}>('/issues/'+created.issue.id+'.json');
    if(issue.project.id!==store.project.id||issue.tracker.id!==store.tracker||issue.status.id!==closed||JSON.stringify(readEvent(issue))!==JSON.stringify(data))fail(409,'Redmine hat das Einsatzereignis nicht vollständig übernommen.');
    await commentGreen(data,issue.id);return {id:issue.id};
  }
  app.post('/api/rapport/green/event',async r=>{const c=await context(r);return serialized(()=>greenEvent(c,r.body));});
  async function greenCaptureSources(c:C,value:unknown,line:Line,employees:number[]){
    const operationId=uid(value),store=await greenStore(c),subject=eventSubject(c.actor.id,operationId,'finish');
    const matches=store.issues.filter(i=>i.subject===subject);if(matches.length!==1)fail(409,'Arbeitsende noch nicht eindeutig synchronisiert');
    const {issue}=await store.admin<{issue:Issue}>('/issues/'+matches[0]!.id+'.json');
    if(issue.project.id!==store.project.id||issue.tracker.id!==store.tracker||issue.subject!==subject)fail(409,'Einsatzkennung stimmt nicht');
    const event=readEvent(issue);if(event.actor.id!==c.actor.id||event.activity!==line.activity||employees.some(id=>event.participation?!event.participation.some(x=>x.employee===id&&x.start===line.start&&x.end===line.end):!event.employees.includes(id)||event.start!==line.start||event.end!==line.end))fail(409,'Rapport stimmt nicht mit gespeichertem Einsatz überein');
    line.greenEventId=issue.id;if(event.materials?.length)line.sharedResources=event.materials;return event.sources;
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
  app.get('/api/rapport/settings/access',async r=>{const me=await fetchCurrentUser(config,credentials(r));return {allowed:me.user.admin===true};});
  app.get('/api/rapport/settings',async(r,reply)=>{
    reply.header('Cache-Control','no-store');const admin=await administrator(r);
    const [projects,trackers,fields]=await Promise.all([allProjects(admin),admin<{trackers:Tracker[]}>('/trackers.json'),admin<{custom_fields:{id:number;name:string;customized_type:string;field_format?:string}[]}>('/custom_fields.json')]);
    const current=selected();const storage=projects.find(p=>p.identifier===(process.env.DERKUMPEL_PROJECT_IDENTIFIER||'derkumpel'))??projects.find(p=>p.name.toLocaleLowerCase('de')==='derkumpel');
    const green=projects.find(p=>p.identifier===process.env.GREEN_PROJECT_IDENTIFIER)??projects.find(p=>['grünpflegearbeiten','grünfplegearbeiten'].includes(p.name.toLocaleLowerCase('de')));
    return {selection:current,defaults:{storageProjectId:storage?.id??null,storageTrackerId:trackers.trackers.find(t=>storage?.trackers?.some(x=>x.id===t.id))?.id??null,greenProjectId:green?.id??null,greenTrackerId:Number(process.env.GREEN_TRACKER_ID)||trackers.trackers.find(t=>t.name.toLocaleLowerCase('de')==='grünpflegearbeiten')?.id||null,greenFieldId:Number(process.env.GREEN_MUNICIPALITY_FIELD_ID)||fields.custom_fields.find(f=>f.customized_type==='issue'&&f.name.toLocaleLowerCase('de')==='ort')?.id||null},projects:projects.map(p=>({id:p.id,name:p.name,identifier:p.identifier,isPublic:p.is_public})),trackers:trackers.trackers.map(t=>({id:t.id,name:t.name,defaultStatusId:t.default_status?.id??null})),fields:fields.custom_fields.filter(f=>f.customized_type==='issue').map(f=>({id:f.id,name:f.name,format:f.field_format??''})),mode:process.env.RAPPORT_STORAGE_MODE??'automatic'};
  });
  app.get('/api/rapport/settings/project/:id',async r=>{
    const admin=await administrator(r),id=Number((r.params as {id:string}).id);if(!Number.isSafeInteger(id)||id<=0)fail(400,'Ungültiges Projekt');
    const {project}=await admin<{project:StoreProject}>('/projects/'+id+'.json?include=trackers,enabled_modules');return {id:project.id,name:project.name,trackers:project.trackers??[],isPublic:project.is_public};
  });
  app.put('/api/rapport/settings',async r=>{
    const admin=await administrator(r),next=parseSelection(r.body);
    if(!next.storageProjectId||!next.storageTrackerId)fail(400,'Bitte Speicherprojekt und Speichertracker auswählen.');
    const greenCount=[next.greenProjectId,next.greenTrackerId,next.greenFieldId].filter(x=>x!==null).length;
    if(greenCount!==0&&greenCount!==3)fail(400,'Grünpflege bitte vollständig zuordnen oder alle drei Felder leer lassen.');
    if(next.storageTrackerId===next.greenTrackerId)fail(400,'Speichertracker und Grünpflegetracker müssen getrennt sein.');
    if(process.env.RAPPORT_STORAGE_MODE==='native'||process.env.RAPPORT_STORAGE_MODE==='disabled'||(!selected().storageProjectId&&process.env.RAPPORT_STORAGE_MODE!=='automatic'&&process.env.RAPPORT_ENABLED==='true'&&process.env.RAPPORT_DATA_FIELD_ID))fail(409,'Servermodus erlaubt keine automatische Speicherzuordnung. RAPPORT_STORAGE_MODE=automatic setzen.');
    return serialized(async()=>{
      if(greenCount){const [green,fields]=await Promise.all([admin<{project:StoreProject}>('/projects/'+next.greenProjectId+'.json?include=trackers'),admin<{custom_fields:{id:number;customized_type:string}[]}>('/custom_fields.json')]);
      if(green.project.id!==next.greenProjectId||!green.project.trackers?.some(t=>t.id===next.greenTrackerId))fail(400,'Grünpflegetracker ist im gewählten Projekt nicht aktiviert.');
      if(green.project.is_public!==false)fail(400,'Grünpflegeprojekt muss privat sein.');
      if(!fields.custom_fields.some(f=>f.id===next.greenFieldId&&f.customized_type==='issue'))fail(400,'Ortsfeld ist kein Ticketfeld.');}
      // Do not move or abandon existing records when changing the storage project.
      const prev=selected();let oldProjectId=prev.storageProjectId;
      if(!oldProjectId){const all=await allProjects(admin);oldProjectId=all.find(p=>p.identifier===(process.env.DERKUMPEL_PROJECT_IDENTIFIER||'derkumpel'))?.id??all.find(p=>p.name.toLocaleLowerCase('de')==='derkumpel')?.id??null;}
      if(oldProjectId&&oldProjectId!==next.storageProjectId){const old=await pages<Issue>(admin,'/issues.json?project_id='+oldProjectId+'&status_id=*');if(old.some(i=>/^(Rapport |Rapportkorrektur |Rapportarchiv |DK Maschine: |DK Material: |DK Materialkatalog$|DK Arbeitsgerätekatalog$|DK Feiertage RLP )/.test(i.subject)))fail(409,'Bisheriger Speicher enthält Daten. Projektwechsel ohne Migration nicht möglich.');}
      if(setupPending)await setupPending.catch(()=>undefined);
      const ready=await automaticSettings(config,next);
      await persistSelection(next);selection=next;setupCache={value:ready,until:Date.now()+30000};resetInternalRapportProjects([ready.project,ready.catalogProject,...(next.greenProjectId?[next.greenProjectId]:[])]);
      return {selection:next,storageProjectId:ready.project,storageTrackerId:ready.tracker};
    });
  });
  app.get('/api/rapport/settings/check',async r=>{
    await administrator(r);setupCache=undefined;const started=Date.now();
    const checks:{label:string;ok:boolean;detail:string}[]=[];
    let s:Settings|undefined;try{s=await settings();checks.push({label:'Rapportspeicher',ok:true,detail:'Projekt #'+s.project+', Tracker #'+s.tracker});}catch(e){checks.push({label:'Rapportspeicher',ok:false,detail:e instanceof Error?e.message:'Unbekannter Fehler'});}
    try{const m=await roster();checks.push({label:'Bauhofgruppen',ok:true,detail:m.size+' Mitarbeiter'});}catch(e){checks.push({label:'Bauhofgruppen',ok:false,detail:e instanceof Error?e.message:'Unbekannter Fehler'});}
    if(s){try{const issues=await pages<Issue>(keyApi(config,s.serviceKey),'/issues.json?project_id='+s.project+'&status_id=*');const reports=issues.filter(i=>i.project.id===s!.project&&/^Rapport [0-9]+ /.test(i.subject));const bad=reports.filter(i=>{try{decode(i,s!);return false;}catch{return true;}});checks.push({label:'Gespeicherte Rapporte',ok:bad.length===0,detail:reports.length+' Tagesrapporte im Projekt #'+s.project+(bad.length?' · Nicht lesbare Tickets: '+bad.slice(0,20).map(i=>'#'+i.id).join(', '):'')});}catch(e){checks.push({label:'Speicher lesen',ok:false,detail:e instanceof Error?e.message:'Unbekannter Fehler'});}
      try{const tasks=await greenCatalogue({s} as C);checks.push({label:'Grünpflegekatalog',ok:true,detail:tasks.length+' Aufgaben, '+new Set(tasks.flatMap(t=>t.municipalities)).size+' Orte'});}catch(e){checks.push({label:'Grünpflegekatalog',ok:false,detail:e instanceof Error?e.message:'Unbekannter Fehler'});}
    }
    return {checks,elapsedMs:Date.now()-started};
  });
  app.get('/api/rapport/green/tasks',async (r,reply)=>{
    reply.header('Cache-Control','no-store');
    await identity(r);const choice=selected(),known=setupCache?.value;
    const s={directoryKey:adminKey(),project:known?.project??choice.storageProjectId??(Number(process.env.RAPPORT_PROJECT_ID)||0),catalogProject:known?.catalogProject??(Number(process.env.RAPPORT_CATALOG_PROJECT_ID)||0)};
    return {tasks:await greenCatalogue({s})};
  });
  app.get('/api/rapport/users',async r=>{const c=await identity(r);return {users:[...c.members.values()].sort((a,b)=>a.name.localeCompare(b.name,'de')),missingGroups:[],dispatcher:c.dispatcher};});
  // Holiday tickets remain editable in Redmine. A missing year is initialized once,
  // but existing descriptions are never regenerated or silently overwritten.
  async function holidayCalendar(c:C,year:number,items?:Issue[]):Promise<HolidayCalendar>{
    if(!validHolidayYear(year))fail(400,'Kalenderjahr muss zwischen 2000 und 2100 liegen.');
    if(!c.s.automatic)fail(409,'Feiertagskalender benötigt automatischen DerKumpel-Speichermodus.');
    const subject=holidaySubject(year);
    const matches=(items??await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+'&status_id=*')).filter(i=>i.project.id===c.s.project&&i.subject===subject);
    if(matches.length>1)fail(409,'Mehrere Feiertagskalender für '+year+' vorhanden.');
    let id=matches[0]?.id;
    if(!id){const created=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.tracker,status_id:c.s.statuses.draft,is_private:true,subject,description:holidayTemplate(year)}});id=created.issue.id;}
    const {issue}=await c.service<{issue:Issue}>('/issues/'+id+'.json');
    if(issue.project.id!==c.s.project||issue.subject!==subject)fail(409,'Feiertagskalender nicht eindeutig.');
    const description=issue.description??'';
    return {year,ticketId:issue.id,revision:revision(issue),description,...parseHolidays(description,year)};
  }
  app.get('/api/rapport/review/access',async r=>({allowed:(await identity(r)).dispatcher}));
  app.get('/api/rapport/holidays/:year',async r=>{const c=await context(r),year=Number((r.params as {year:string}).year);return serialized(()=>holidayCalendar(c,year));});
  app.put('/api/rapport/holidays/:year',async r=>{
    const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten pflegen Feiertage');
    const year=Number((r.params as {year:string}).year),b=obj(r.body);
    if(typeof b.description!=='string'||b.description.length>30000)fail(400,'Kalenderbeschreibung ungültig');
    const description=b.description;
    if(!validHolidayYear(year))fail(400,'Kalenderjahr ungültig');
    const parsed=parseHolidays(description,year);if(parsed.warnings.length)fail(400,parsed.warnings.join('; '));
    return serialized(async()=>{const calendar=await holidayCalendar(c,year);if(calendar.revision!==b.revision)fail(409,'Feiertagskalender wurde geändert. Bitte neu laden.');
      await c.service('/issues/'+calendar.ticketId+'.json','PUT',{issue:{description,notes:note(c,'Feiertagskalender '+year+' geändert')}});
      const actual=await holidayCalendar(c,year);if(actual.description.replace(/\r\n|\r/g,'\n')!==description.replace(/\r\n|\r/g,'\n'))fail(409,'Feiertagskalender nicht vollständig übernommen.');return actual;});
  });
  app.get('/api/rapport/review',async r=>{
    const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten');
    const q=r.query as {from?:string;to?:string};
    if(!validDate(q.from)||!validDate(q.to)||q.from>q.to||Date.parse(q.to)-Date.parse(q.from)>366*86400000)fail(400,'Zeitraum ungültig (maximal 367 Tage)');
    const from=q.from,to=q.to,first=Number(from.slice(0,4)),last=Number(to.slice(0,4));if(!validHolidayYear(first)||!validHolidayYear(last))fail(400,'Kalenderjahr ungültig');
    const items=c.s.automatic?await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+'&status_id=*'):[...await list(c),...await listCorrections(c)];
    const reports=items.filter(i=>i.project.id===c.s.project&&(!c.s.automatic||/^Rapport [0-9]+ \d{4}-\d{2}-\d{2}$/.test(i.subject)||/^Rapportkorrektur [0-9]+$/.test(i.subject))).map(i=>decode(i,c.s)).filter(d=>d.date>=from&&d.date<=to);
    const holidays:Holiday[]=[],calendarWarnings:string[]=[];
    for(let year=first;year<=last;year++){try{const cal=await serialized(async()=>holidayCalendar(c,year));if(cal.warnings.length)calendarWarnings.push(...cal.warnings.map(w=>year+': '+w));else holidays.push(...cal.holidays);}catch(e){calendarWarnings.push(year+': '+(e instanceof Error?e.message:'Feiertagskalender nicht verfügbar'));}}
    return {reports,holidays,calendarWarnings,overtime:calendarWarnings.length?[]:overtimeRows(reports,holidays)};
  });
  app.get('/api/rapport/reports',async r=>{const c=await context(r),q=r.query as {from?:string;to?:string;all?:string};if(!validDate(q.from)||!validDate(q.to)||q.from>q.to)return fail(400,'Ungültiger Zeitraum');if(q.all==='1'&&!c.dispatcher)return fail(403,'Nur Disponenten');const reports=(c.s.automatic?(await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+'&status_id=*')).filter(i=>i.project.id===c.s.project&&(/^Rapport [0-9]+ [0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(i.subject)||/^Rapportkorrektur [0-9]+$/.test(i.subject))):[...await list(c),...await listCorrections(c)]).map(i=>decode(i,c.s)).filter(d=>d.date>=q.from!&&d.date<=q.to!&&(q.all==='1'||d.owner.id===c.actor.id));return {reports,dispatcher:c.dispatcher};});
  app.post('/api/rapport/reports/:id/correction',async r=>{const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten');if(!c.s.correctionTracker)fail(503,'Korrekturtracker nicht eingerichtet');const reason=str(obj(r.body).reason,1000);if(!reason)fail(400,'Korrekturbegründung erforderlich');return serialized(async()=>{const {r:original}=await detail(c,Number((r.params as {id:string}).id));if(original.state!=='closed')fail(409,'Nur abgeschlossene Rapporte korrigieren');const existing=(await listCorrections(c)).map(i=>decode(i,c.s)).filter(d=>d.correction?.reportId===original.id);if(existing.length)fail(409,'Zu diesem Beleg besteht bereits eine Korrektur. Bitte diese öffnen oder den aktuell abgeschlossenen Korrekturbeleg korrigieren.');const data:Data={version:1,owner:original.owner,date:original.date,lines:original.lines,material:original.material,correction:{reportId:original.id,reason,createdBy:{id:c.actor.id,name:c.actor.name},createdAt:new Date().toISOString()}};const created=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.correctionTracker,status_id:c.s.statuses.draft,subject:'Rapportkorrektur '+original.id,...payload(c,data)}});const actual=(await detail(c,created.issue.id)).r;if(actual.correction?.reportId!==original.id||actual.state!=='draft')fail(409,'Korrektur nicht vollständig angelegt');return actual;});});
  app.get('/api/rapport/reports/:id',async r=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return d;});
  app.post('/api/rapport/capture',async r=>{const c=await context(r),b=obj(r.body);if(b.actorId!==c.actor.id)return fail(403,'Erfasser stimmt nicht mit Anmeldung überein');if(!validDate(b.date))return fail(400,'Arbeitstag ungültig');const date=b.date;const line=parseLine(b.line,c.actor);validateLines([line],date,false);if(line.machines.length||line.materials.length)fail(400,'Gemeinsame Ressourcen separat im verantwortlichen Rapport erfassen');const people=[...new Set(arr(b.employees,100).map(Number))];if(!people.length||people.some(id=>!c.members.has(id)))return fail(400,'Ungültige Mitarbeiterauswahl');return serialized(async()=>{line.sources=obj(b.line).greenOperationId?await greenCaptureSources(c,obj(b.line).greenOperationId,line,people):await sourceRefs(c,obj(b.line).sourceIds,obj(b.line).sourceKind);const results:{employee:number;ok:boolean;reportId?:number;message?:string;status?:number;conflict?:{kind:'overlap';reportId?:number}}[]=[];const issues=await list(c);for(const id of people){try{const existing=await getDay(c,id,date,issues);if(existing){const {i,r:d}=existing;const old=d.lines.find(l=>l.id===line.id);if(old){if(old.recordedBy.id!==c.actor.id||old.start!==line.start||old.end!==line.end||old.activity!==line.activity||JSON.stringify((old.sources??[]).map(s=>s.id))!==JSON.stringify((line.sources??[]).map(s=>s.id))||(old.greenEventId!==undefined&&old.greenEventId!==line.greenEventId))fail(409,'Vorgangs-ID bereits vergeben');results.push({employee:id,ok:true,reportId:i.id});continue;}validateQuarterTimes(line);if(!['draft','returned'].includes(d.state))fail(409,'Rapport bereits eingereicht oder abgeschlossen');const next:Data={version:1,owner:d.owner,date,lines:[...d.lines,line],material:d.material,...(d.submitted?{submitted:d.submitted}:{})};try{validateLines(next.lines,date,false);}catch(e){if(e instanceof RedmineError&&e.status===409){const mayView=d.owner.id===c.actor.id||c.dispatcher;results.push({employee:id,ok:false,status:409,message:mayView?'Redmine-Rapport #'+i.id+': '+e.message+' Bitte Tagesrapport prüfen.':'Arbeitszeit überschneidet sich mit einem vorhandenen Rapport. Bitte Beginn korrigieren oder mit dem Mitarbeiter klären.',conflict:{kind:'overlap',...(mayView?{reportId:i.id}:{})}});continue;}throw e;}await write(c,i,next,note(c,'Leistung vorerfasst '+line.id));results.push({employee:id,ok:true,reportId:i.id});}else{validateQuarterTimes(line);const owner=c.members.get(id)!;const d:Data={version:1,owner:{id,name:owner.name},date,lines:[line],material:''};const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.tracker,status_id:c.s.statuses.draft,subject:'Rapport '+id+' '+date,...payload(c,d)}});const actual=await detail(c,result.issue.id);if(actual.r.owner.id!==id||actual.r.date!==date||actual.r.state!=='draft'||!actual.r.lines.some(l=>l.id===line.id&&l.start===line.start&&l.end===line.end))fail(409,'Redmine hat die Anlage nicht vollständig übernommen.');results.push({employee:id,ok:true,reportId:result.issue.id});}}catch(e){results.push({employee:id,ok:false,status:e instanceof RedmineError?e.status:502,message:e instanceof RedmineError?e.message:'Übertragung fehlgeschlagen'});}}return {results};});});
  app.post('/api/rapport/capture/check',async r=>{
    const c=await context(r),b=obj(r.body);
    if(b.actorId!==c.actor.id)fail(403,'Erfasser stimmt nicht mit Anmeldung überein');
    if(!validDate(b.date))fail(400,'Arbeitstag ungültig');const date=b.date;
    const line=parseLine(b.line,c.actor),people=[...new Set(arr(b.employees,100).map(Number))];
    if(!people.length||people.some(id=>!c.members.has(id)))fail(400,'Ungültige Mitarbeiterauswahl');
    return serialized(async()=>{const issues=await list(c);const results=[];
      for(const id of people){const existing=await getDay(c,id,date,issues);if(!existing){results.push({employee:id,stored:false,editable:true,overlap:false});continue;}
        const d=existing.r,old=d.lines.find(l=>l.id===line.id);const mayView=d.owner.id===c.actor.id||c.dispatcher;
        const overlaps=d.lines.filter(l=>l.start<line.end&&l.end>line.start);
        results.push({employee:id,stored:!!old,editable:!old&&['draft','returned'].includes(d.state),overlap:overlaps.length>0,...(mayView?{reportId:d.id,overlaps:overlaps.map(l=>({start:l.start,end:l.end,activity:l.activity}))}:{})});
      }return {results};
    });
  });
  app.put('/api/rapport/reports/:id',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');if(d.state==='closed'||(!c.dispatcher&&!['draft','returned'].includes(d.state)))fail(409,'Rapport ist gesperrt');const reason=str(b.reason??'');if(c.dispatcher&&d.owner.id!==c.actor.id&&!reason)fail(400,'Korrekturbegründung erforderlich');if(!['draft','returned'].includes(d.state)&&!reason)fail(400,'Korrekturbegründung erforderlich');const lines=await Promise.all(arr(b.lines,200).map(async x=>{const prior=d.lines.find(l=>l.id===obj(x).id);const line=parseLine(x,c.actor,prior);validateQuarterTimes(line,prior);if(obj(x).sourceIds!==undefined)line.sources=await sourceRefs(c,obj(x).sourceIds,obj(x).sourceKind);return line;}));validateLines(lines,d.date,false);const next:Data={version:1,owner:d.owner,date:d.date,lines,material:str(b.material??'',5000),...(d.submitted?{submitted:d.submitted}:{}),...(d.correction?{correction:d.correction}:{})};await registerEquipment(c,lines.flatMap(l=>l.machines.map(m=>m.name)),d.lines.flatMap(l=>l.machines.map(m=>m.name)));const prior=summary(d),after=summary(next);const changed=lines.filter(l=>JSON.stringify(l)!==JSON.stringify(d.lines.find(x=>x.id===l.id))).length;const removed=d.lines.filter(l=>!lines.some(x=>x.id===l.id)).length;return write(c,i,next,note(c,'Rapport korrigiert; Arbeitszeit '+fmt(prior.work)+' → '+fmt(after.work)+' h; '+changed+' geänderte/neue und '+removed+' entfernte Positionen'+(reason?': '+reason:'')));});});
  // Journal writes only: no status, assignment, or other ticket fields.
  async function resourceJournal(get:Get,id:number,scope:string,body:string,check:(i:Issue)=>boolean){
    const path='/issues/'+id+'.json?include=journals';
    const {issue}=await get<{issue:Issue}>(path);
    if(issue.id!==id||!check(issue))fail(403,'Originalticket #'+id+' ist kein zulässiger Auftrag.');
    const marker=noteMarker(scope,id,body);
    if(issue.journals?.some(j=>j.notes?.includes(marker)))return;
    if(!Array.isArray(issue.journals))fail(409,'Kommentare von Ticket #'+id+' können nicht geprüft werden.');
    await get('/issues/'+id+'.json','PUT',{issue:{notes:body+'\n\n'+marker}});
    const {issue:updated}=await get<{issue:Issue}>(path);
    if(!updated.journals?.some(j=>j.notes?.includes(marker)))fail(409,'Ressourcenkommentar in Ticket #'+id+' wurde nicht bestätigt.');
  }
  async function reportResourceNotes(c:C,d:Report){
    const personal:Get=<T>(path:string,method='GET',body?:unknown)=>redmineJson<T>(config,c.creds,path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})});
    const byTicket=new Map<number,string[]>();
    const gather=(report:Report)=>{const map=new Map<number,string[]>();for(const l of report.lines){if(l.kind!=='work')continue;
      // Shared green resources are journaled once on the shared finish, never per person.
      const content=resourceText(l.machines,l.materials);if(!content.length)continue;
      const ids=[...new Set([orderTicket(l.order),...(l.greenEventId?[]:(l.sources??[]).filter(s=>!s.municipalities).map(s=>s.id))].filter(Boolean))];
      for(const id of ids){const lines=map.get(id)??[];lines.push(...content);map.set(id,lines);}
    }return map;};
    const current=gather(d);for(const [id,lines] of current)byTicket.set(id,lines);
    if(d.correction){const original=(await detail(c,d.correction.reportId)).r;for(const id of gather(original).keys())if(!byTicket.has(id))byTicket.set(id,[]);}
    for(const [id,lines] of byTicket){
      const body='DerKumpel – Ressourcenrapport vom '+d.date.split('-').reverse().join('.')+' (Beleg #'+d.id+').'+(d.correction?' Korrektur – ersetzt die Ressourcenangaben aus Beleg #'+d.correction.reportId+'.':'')+'\n'+(lines.length?lines.join('\n'):'Keine Ressourcen mehr für diesen Auftrag rapportiert.')+'\nZur Abnahme erfasst; der Ticketstatus bleibt unverändert.';
      try{await resourceJournal(personal,id,'rapport-'+d.id,body,i=>![c.s.project,c.s.catalogProject].includes(i.project.id)&&!internalRapportProject(i.project.id,i.project.name));}
      catch(e){fail(e instanceof RedmineError?e.status:502,'Ressourcenkommentar in Originalticket #'+id+' fehlgeschlagen: '+(e instanceof Error?e.message:String(e))+' – Rapport bleibt zur Prüfung offen. Erneut abschließen, bereits bestätigte Kommentare werden erkannt.');}
    }
  }
  app.post('/api/rapport/reports/:id/transition',async r=>{const c=await context(r),b=obj(r.body);return serialized(async()=>{const {i,r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);if(d.revision!==b.revision)fail(409,'Rapport wurde geändert. Bitte neu laden.');const action=b.action,reason=str(b.reason??'');if(action==='submit'&&d.owner.id===c.actor.id&&['draft','returned'].includes(d.state)){validateLines(d.lines,d.date,true);const next:Data={version:1,owner:d.owner,date:d.date,lines:d.lines,material:d.material,submitted:{by:{id:c.actor.id,name:c.actor.name},at:new Date().toISOString()},...(d.correction?{correction:d.correction}:{})};if(c.s.automatic)return write(c,i,{...next,storageState:'submitted'},note(c,'Eingereicht'));if(!i.allowed_statuses?.some(s=>s.id===c.s.statuses.submitted))fail(409,'Redmine-Workflow erlaubt Einreichung nicht');return write(c,i,next,note(c,'Eingereicht'),c.s.statuses.submitted);}
    if(!c.dispatcher)return fail(403,'Nur Disponenten');const next:State|undefined=action==='review'&&d.state==='submitted'?'review':action==='return'&&['submitted','review'].includes(d.state)?'returned':action==='close'&&['submitted','review'].includes(d.state)?'closed':undefined;if(!next)return fail(409,'Unzulässiger Statuswechsel');if(next==='returned'&&!reason)fail(400,'Rückgabebegründung erforderlich');if(next==='closed'){validateLines(d.lines,d.date,true);if(!d.submitted)fail(409,'Digitale Einreichung fehlt');await reportResourceNotes(c,d);}
    if(c.s.automatic){const data:Data={version:1,owner:d.owner,date:d.date,lines:d.lines,material:d.material,submitted:d.submitted,correction:d.correction,storageState:next,...(next==='closed'?{storageReviewed:{by:{id:c.actor.id,name:c.actor.name},at:new Date().toISOString()}}:{}),...(next==='returned'?{storageReturnNote:reason}:{})};return write(c,i,data,note(c,action+(reason?': '+reason:'')+(next==='closed'&&d.owner.id===c.actor.id?' (Selbstprüfung)':'')));}
    const personal=(await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+i.id+'.json?include=allowed_statuses')).issue;if(!personal.allowed_statuses?.some(s=>s.id===c.s.statuses[next]))fail(403,'Redmine-Workflow erlaubt Statuswechsel nicht');
    await redmineJson(config,c.creds,'/issues/'+i.id+'.json',{method:'PUT',body:JSON.stringify({issue:{status_id:c.s.statuses[next],notes:note(c,action+(reason?': '+reason:'')+(next==='closed'&&d.owner.id===c.actor.id?' (Selbstprüfung)':''))}})});const actual=await detail(c,i.id);if(actual.i.status.id!==c.s.statuses[next])fail(409,'Redmine hat den Statuswechsel nicht übernommen');return actual.r;});});
  app.get('/api/rapport/orders',async r=>{const c=await context(r);const q=(r.query as {q?:string}).q?.trim()??'';if(q.length<2||q.length>100)return {orders:[]};const personal:Get=<T>(path:string)=>redmineJson<T>(config,c.creds,path);const items=await pages<Issue>(personal,'/issues.json?status_id=*&subject='+encodeURIComponent('~'+q));return {orders:items.filter(i=>![c.s.project,c.s.catalogProject].includes(i.project.id)&&!internalRapportProject(i.project.id,i.project.name)&&i.subject.toLocaleLowerCase('de').includes(q.toLocaleLowerCase('de'))).slice(0,30).map(i=>({id:i.id,subject:i.subject}))};});
  app.get('/api/rapport/order/:id',async r=>{const c=await context(r),id=Number((r.params as {id:string}).id);if(!Number.isSafeInteger(id)||id<=0)return fail(400,'Auftragsnummer ungültig');const {issue}=await redmineJson<{issue:Issue}>(config,c.creds,'/issues/'+id+'.json');if([c.s.project,c.s.catalogProject].includes(issue.project.id)||internalRapportProject(issue.project.id,issue.project.name))return fail(404,'Auftrag nicht gefunden');return {id:issue.id,subject:issue.subject};});
  async function registerEquipment(c:C,incoming:string[],previous:string[]=[]):Promise<number|undefined>{
    // No side effects when only previously known positions are edited.
    const candidates=equipmentAdditions(previous,incoming);if(!candidates.length)return;
    const project=c.s.automatic?c.s.project:c.s.catalogProject;
    const items=(await pages<Issue>(c.service,'/issues.json?project_id='+project+'&status_id=*')).filter(i=>i.project.id===project);
    const oldNames=items.filter(i=>c.s.automatic?i.subject.startsWith('DK Maschine: '):i.tracker.id===c.s.machineTracker).map(i=>c.s.automatic?i.subject.slice('DK Maschine: '.length):i.subject);
    if(!c.s.automatic){for(const name of equipmentAdditions(oldNames,candidates))await c.service('/issues.json','POST',{issue:{project_id:project,tracker_id:c.s.machineTracker,subject:name,description:note(c,'Arbeitsgerät aus Rapport ergänzt')}});return;}
    const matches=items.filter(i=>i.subject===equipmentSubject);if(matches.length>1)fail(409,'Mehrere Arbeitsgerätekataloge vorhanden');
    let issue:Issue;
    if(matches[0]){issue=(await c.service<{issue:Issue}>('/issues/'+matches[0].id+'.json')).issue;if(issue.project.id!==project||issue.subject!==equipmentSubject)fail(409,'Arbeitsgerätekatalog nicht eindeutig');}
    else{const additions=equipmentAdditions(oldNames,candidates);if(!additions.length)return items.find(i=>i.subject.startsWith('DK Maschine: ')&&equipmentKey(i.subject.slice('DK Maschine: '.length))===equipmentKey(candidates[0]!))?.id;const created=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:project,tracker_id:c.s.tracker,status_id:c.s.statuses.draft,subject:equipmentSubject,is_private:true,description:equipmentTemplate+additions.join('\n')+'\n'}});issue=(await c.service<{issue:Issue}>('/issues/'+created.issue.id+'.json')).issue;if(issue.project.id!==project||issue.subject!==equipmentSubject||equipmentAdditions(equipmentNames(issue.description??''),additions).length)fail(409,'Arbeitsgeräte nicht vollständig gespeichert');return issue.id;}
    const additions=equipmentAdditions([...oldNames,...equipmentNames(issue.description??'')],candidates);if(!additions.length)return issue.id;
    const {issue:latest}=await c.service<{issue:Issue}>('/issues/'+issue.id+'.json');if(latest.description!==issue.description||latest.updated_on!==issue.updated_on)fail(409,'Arbeitsgerätekatalog wurde gleichzeitig geändert. Bitte erneut speichern.');
    await c.service('/issues/'+issue.id+'.json','PUT',{issue:{description:(issue.description??'').trimEnd()+'\n'+additions.join('\n')+'\n',notes:note(c,'Arbeitsgeräte ergänzt: '+additions.join(', '))}});
    const {issue:updated}=await c.service<{issue:Issue}>('/issues/'+issue.id+'.json');if(equipmentAdditions(equipmentNames(updated.description??''),additions).length)fail(409,'Arbeitsgeräte nicht vollständig gespeichert');return issue.id;
  }
  async function materialTicket(c:C){
    if(!c.s.automatic)fail(409,'Zeilenbasierter Materialkatalog benötigt den automatischen DerKumpel-Speichermodus.');
    const matches=(await pages<Issue>(c.service,'/issues.json?project_id='+c.s.project+'&status_id=*')).filter(i=>i.project.id===c.s.project&&i.subject===materialSubject);
    if(matches.length>1)fail(409,'Mehrere Materialkataloge vorhanden. Bitte in Redmine bereinigen.');
    let id=matches[0]?.id;
    if(!id){const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.project,tracker_id:c.s.tracker,status_id:c.s.statuses.draft,subject:materialSubject,is_private:true,description:materialTemplate}});id=result.issue.id;}
    const {issue}=await c.service<{issue:Issue}>('/issues/'+id+'.json');
    if(issue.project.id!==c.s.project||issue.subject!==materialSubject)fail(409,'Materialkatalog nicht eindeutig');
    return issue;
  }
  app.get('/api/rapport/materials',async r=>{const c=await context(r);return serialized(async()=>{const issue=await materialTicket(c);return {ticketId:issue.id,...parseMaterials(issue.description??'')};});});
  app.post('/api/rapport/materials',async r=>{const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten pflegen den Materialkatalog');const b=obj(r.body);
    if(b.kind!==undefined&&b.kind!=='machine'&&b.kind!=='material')fail(400,'Ungültiger Ressourcentyp');const item:MaterialItem={code:str(b.code,60),name:str(b.name,200),unit:str(b.unit,40),category:str(b.category??'',100),...(b.price===undefined||b.price===null?{}:{price:Number(b.price)}),...(b.kind==='machine'?{kind:'machine'}:{})};
    if(Object.values(item).some(v=>typeof v==='string'&&/[\r\n|]/.test(v))||parseMaterials(materialRow(item)).items.length!==1)fail(400,'Ungültige Materialzeile');
    return serialized(async()=>{const issue=await materialTicket(c),parsed=parseMaterials(issue.description??'');if(parsed.warnings.length)fail(409,'Materialkatalog enthält fehlerhafte Zeilen. Bitte in Redmine korrigieren.');
      const old=parsed.items.find(x=>x.code.toLowerCase()===item.code.toLowerCase());if(old){if(JSON.stringify(old)===JSON.stringify(item))return {ticketId:issue.id,...parsed};fail(409,'Materialkennung bereits vergeben');}
      const {issue:latest}=await c.service<{issue:Issue}>('/issues/'+issue.id+'.json');if(latest.description!==issue.description||latest.updated_on!==issue.updated_on)fail(409,'Materialkatalog wurde gleichzeitig geändert. Bitte neu laden.');
      await c.service('/issues/'+issue.id+'.json','PUT',{issue:{description:(issue.description??'').trimEnd()+'\n'+materialRow(item)+'\n',notes:note(c,'Materialzeile ergänzt: '+item.code)}});
      const {issue:updated}=await c.service<{issue:Issue}>('/issues/'+issue.id+'.json');const result=parseMaterials(updated.description??'');if(!result.items.some(x=>JSON.stringify(x)===JSON.stringify(item)))fail(409,'Materialzeile nicht vollständig gespeichert');
      return {ticketId:issue.id,...result};
    });
  });
  app.get('/api/rapport/catalog',async r=>{const c=await context(r);const items=await pages<Issue>(c.service,'/issues.json?project_id='+c.s.catalogProject+'&status_id='+(c.s.automatic?'*':'open'));const material=items.find(i=>i.project.id===c.s.project&&i.subject===materialSubject);const materialRows=material?parseMaterials(material.description??'').items:[];const equipment=items.find(i=>i.project.id===c.s.project&&i.subject===equipmentSubject);return {equipmentRows:equipment?equipmentNames(equipment.description??''):[],materialRows,machines:items.filter(i=>c.s.automatic?i.subject.startsWith('DK Maschine: '):i.tracker.id===c.s.machineTracker).map(i=>({id:i.id,name:c.s.automatic?i.subject.slice('DK Maschine: '.length):i.subject})),materials:items.filter(i=>c.s.automatic?i.subject.startsWith('DK Material: '):i.tracker.id===c.s.materialTracker).map(i=>({id:i.id,name:c.s.automatic?i.subject.slice('DK Material: '.length):i.subject}))};});
  app.post('/api/rapport/catalog',async r=>{const c=await context(r);if(!c.dispatcher)return fail(403,'Nur Disponenten');const b=obj(r.body),name=str(b.name,200);if(!name||!['machine','material'].includes(String(b.kind)))return fail(400,'Ungültige Stammdaten');if(b.kind==='machine'&&c.s.automatic){if(name.startsWith('#')||/[\r\n]/.test(name))fail(400,'Ungültiges Arbeitsgerät');const id=await serialized(()=>registerEquipment(c,[name]));if(!id)fail(409,'Arbeitsgerätekatalog nicht verfügbar');return {id,name};}const result=await c.service<{issue:Issue}>('/issues.json','POST',{issue:{project_id:c.s.catalogProject,tracker_id:b.kind==='machine'?c.s.machineTracker:c.s.materialTracker,...(c.s.automatic?{status_id:c.s.statuses.draft}:{}),subject:c.s.automatic?(b.kind==='machine'?'DK Maschine: ':'DK Material: ')+name:name,...(c.s.automatic?{is_private:true}:{}),description:note(c,'Stammdatum angelegt')}});return {id:result.issue.id,name};});
  app.get('/api/rapport/pdf',async(r,reply)=>{const c=await context(r),q=r.query as {ids?:string};const ids=[...new Set((q.ids??'').split(',').map(Number))];if(!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<=0))return fail(400,'Bitte maximal 100 gültige Rapporte auswählen');const reports:Report[]=[];for(let i=0;i<ids.length;i+=6){const batch=await Promise.all(ids.slice(i,i+6).map(async id=>{const {r:d}=await detail(c,id);allowed(c,d);return d;}));reports.push(...batch);}return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapporte.pdf"').send(rapportPdfMany(reports));});
  app.post('/api/rapport/reports/:id/archive',async r=>{const c=await context(r);if(!c.dispatcher)fail(403,'Nur Disponenten');return serialized(async()=>{const {r:d}=await detail(c,Number((r.params as {id:string}).id));return archive(c,d);});});
  app.get('/api/rapport/reports/:id/archived-pdf',async(r,reply)=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);const bytes=await archivedPdf(c,d);if(!bytes)fail(404,'Kein PDF-Archiv vorhanden');return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapportarchiv-'+d.id+'.pdf"').send(bytes);});
  app.get('/api/rapport/reports/:id/pdf',async(r,reply)=>{const c=await context(r),{r:d}=await detail(c,Number((r.params as {id:string}).id));allowed(c,d);return reply.type('application/pdf').header('Content-Disposition','attachment; filename="Rapport-'+d.date.split('-').reverse().join('.')+'-'+d.owner.id+'.pdf"').send(rapportPdf(d));});
}
