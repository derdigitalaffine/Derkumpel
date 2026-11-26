import { api, ApiError, AuthRequiredError } from './api';
import { db,getSetting,type RapportCaptureBody,type RapportQueueRecord } from './db';
import type { CurrentUser } from './types';
export async function currentRapportQueue():Promise<RapportQueueRecord[]>{
  const actor=await getSetting<CurrentUser|null>('lastUser',null);
  if(!actor)return [];
  return db.rapportQueue.where('ownerId').equals(actor.id).sortBy('createdAt');
}
export async function queueCapture(body:RapportCaptureBody){
  await db.rapportQueue.add({id:body.line.id,ownerId:body.actorId,createdAt:Date.now(),body,state:'pending'});
}
let running:Promise<void>|undefined;
async function replay(){
  if(!navigator.onLine)return;
  const rows=await currentRapportQueue();
  if(!rows.some(r=>r.state!=='conflict'))return;
  const me=await api.me();
  for(const record of rows){
    if(record.ownerId!==me.id||record.state==='conflict')continue;
    try{
      const response=await api.rapportCapture(record.body);
      const failures=response.results.filter(r=>!r.ok);
      if(!failures.length&&response.results.length===record.body.employees.length){await db.rapportQueue.delete(record.id);continue;}
      const success=new Set(response.results.filter(r=>r.ok).map(r=>r.employee));
      const employees=record.body.employees.filter(id=>!success.has(id));
      const conflicts=failures.flatMap(r=>r.conflict?[{employee:r.employee,...r.conflict}]:[]);const retryable=failures.length>0&&failures.every(r=>r.status!==undefined&&r.status>=500);
      await db.rapportQueue.update(record.id,{body:{...record.body,employees},state:retryable?'retrying':'conflict',conflicts,message:failures.map(r=>'#'+r.employee+': '+r.message).join('; ')||'Unvollständige Antwort'});
    }catch(error){
      if(error instanceof AuthRequiredError)throw error;
      const permanent=error instanceof ApiError&&[400,403,404,409,422].includes(error.status);
      await db.rapportQueue.update(record.id,{state:permanent?'conflict':'retrying',message:error instanceof Error?error.message:'Übertragung fehlgeschlagen'});
    }
  }
}
export function replayRapportQueue():Promise<void>{if(!running)running=replay().finally(()=>{running=undefined;});return running;}
export async function retryRapportQueue(id:string){
  const r=(await currentRapportQueue()).find(x=>x.id===id);if(!r)return;
  await db.rapportQueue.update(id,{state:'pending',message:undefined,conflicts:undefined});await replayRapportQueue();
}
export async function discardRapportQueue(id:string){
  if((await currentRapportQueue()).some(r=>r.id===id))await db.rapportQueue.delete(id);
}

export async function rescheduleRapportQueue(id:string,start:string,end:string,date:string,activity:string){
  if(running)await running;
  const r=(await currentRapportQueue()).find(x=>x.id===id);
  if(!r||r.state!=='conflict')throw Error('Vorgang ist nicht mehr im Konflikt.');
  // Check original operation before changing its identity, including unknown outcomes from older versions.
  const check=await api.rapportCaptureCheck(r.body);
  if(check.results.length!==r.body.employees.length||check.results.some(x=>x.stored||!x.editable))throw Error('Mindestens ein Vorgang wurde bereits gespeichert oder der Rapport ist gesperrt. Bitte erneut übertragen bzw. Tagesrapport prüfen.');
  const newId=crypto.randomUUID(),body={...r.body,date,line:{...r.body.line,id:newId,start,end,activity}};
  await db.transaction('rw',db.rapportQueue,async()=>{const current=await db.rapportQueue.get(id);if(!current||current.state!=='conflict'||JSON.stringify(current.body)!==JSON.stringify(r.body))throw Error('Vorgang wurde zwischenzeitlich geändert.');await db.rapportQueue.add({...r,id:newId,body,state:'pending',message:undefined,conflicts:undefined});await db.rapportQueue.delete(id);});
  await replayRapportQueue();
}
