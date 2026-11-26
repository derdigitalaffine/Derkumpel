import Fastify from 'fastify';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {AppConfig} from './config.js';
import {registerRapport} from './rapport.js';
import {RedmineError} from './redmine.js';

type Person={id:number;name:string};
type FixtureIssue={id:number;subject:string;project:{id:number};tracker:{id:number};status:{id:number};updated_on:string;custom_fields:{id:number;value:string}[];journals:{user:Person;created_on:string;notes:string;private_notes?:boolean;details:{property:string;name:string;new_value:string}[]}[];description:string};
const people:Record<string,Person>={alice:{id:1,name:'Alice'},bob:{id:2,name:'Bob'},dispatcher:{id:3,name:'Disponent'},outsider:{id:4,name:'Extern'}};
const cfg={redmineBaseUrl:new URL('https://redmine.example.invalid'),redmineTimeoutMs:3000} as AppConfig;
const response=(body:unknown,status=200)=>status===204?new Response(null,{status}):Response.json(body,{status});
function mockRedmine(){
  for(const [k,v] of Object.entries({RAPPORT_STORAGE_MODE:'native',RAPPORT_ENABLED:'true',RAPPORT_DIRECTORY_KEY:'directory',RAPPORT_SERVICE_KEY:'service',RAPPORT_PROJECT_ID:'10',RAPPORT_CATALOG_PROJECT_ID:'20',RAPPORT_TRACKER_ID:'11',RAPPORT_MACHINE_TRACKER_ID:'21',RAPPORT_MATERIAL_TRACKER_ID:'22',RAPPORT_DATA_FIELD_ID:'5',RAPPORT_STATUS_DRAFT:'1',RAPPORT_STATUS_SUBMITTED:'2',RAPPORT_STATUS_REVIEW:'3',RAPPORT_STATUS_RETURNED:'4',RAPPORT_STATUS_CLOSED:'5'}))vi.stubEnv(k,v);
  const issues=new Map<number,FixtureIssue>();
  let project={id:10,identifier:'derkumpel',name:'DerKumpel',is_public:true,trackers:[] as {id:number;name:string}[],enabled_modules:[{name:'issue_tracking'}]};
  const tasks=[{id:701,subject:'Friedhof',project:{id:30},tracker:{id:31},status:{id:1},custom_fields:[{id:32,value:'Otterberg'}]},{id:702,subject:'Hecke',project:{id:30},tracker:{id:31},status:{id:5},custom_fields:[]}];
  vi.stubEnv('GREEN_ENABLED','true');vi.stubEnv('GREEN_TRACKER_ID','31');vi.stubEnv('GREEN_MUNICIPALITY_FIELD_ID','32');
  vi.stubGlobal('fetch',vi.fn(async(input:URL|string,init:RequestInit={})=>{
    const url=new URL(String(input)),h=new Headers(init.headers),key=h.get('X-Redmine-API-Key'),auth=h.get('Authorization');
    const login=auth?Buffer.from(auth.replace('Basic ',''),'base64').toString().split(':')[0]!:'';
    const person=people[login];const method=init.method??'GET';
    if(url.pathname==='/users/current.json'&&key==='directory')return response({user:{id:99,admin:true}});
    if(url.pathname==='/users/current.json'&&key==='service')return response({user:{id:98}});
    if(['/projects/derkumpel.json','/projects/10.json'].includes(url.pathname)&&(key==='directory'||key==='service')){if(method==='PUT'){const b=JSON.parse(String(init.body)).project;if(b.is_public!==undefined)project={...project,is_public:b.is_public};if(b.tracker_ids)project={...project,trackers:[{id:11,name:'Existing tracker'}]};return response(null,204);}return response({project});}
    if(url.pathname==='/projects/10/memberships.json'&&key==='directory')return response({memberships:[],total_count:0});
    if(url.pathname==='/trackers.json'&&key==='directory')return response({trackers:[{id:11,name:'Existing tracker',default_status:{id:1}}]});
    if(url.pathname==='/issue_statuses.json'&&key==='directory')return response({issue_statuses:[{id:1,is_closed:false}]});
    if(url.pathname==='/users/current.json')return person?response({user:{id:person.id,firstname:person.name,lastname:'',login}}):response({},401);
    if(url.pathname==='/groups.json'&&key==='directory')return response({groups:[{id:1,name:'Disponenten Bauhof'},{id:2,name:'Bauhofmitarbeiter'}]});
    if(url.pathname==='/groups/1.json'&&key==='directory')return response({group:{users:[people.dispatcher]}});
    if(url.pathname==='/groups/2.json'&&key==='directory')return response({group:{users:[people.alice,people.bob]}});
    if(url.pathname==='/issues.json'&&person&&method==='GET'&&url.searchParams.get('tracker_id')==='31')return response({issues:tasks,total_count:tasks.length});
    const task=tasks.find(t=>url.pathname==='/issues/'+t.id+'.json');if(task&&person&&method==='GET')return response({issue:task});
    if(task)throw Error('Source ticket mutation attempted');
    if(url.pathname==='/issues.json'&&key==='service'){
      if(method==='GET'){const tracker=url.searchParams.get('tracker_id');const visible=[...issues.values()].filter(i=>!tracker||String(i.tracker.id)===tracker);return response({issues:visible,total_count:visible.length});}
      if(method==='POST'){
        const b=JSON.parse(String(init.body)).issue;const i:FixtureIssue={id:100+issues.size,subject:b.subject,project:{id:b.project_id},tracker:{id:b.tracker_id},status:{id:b.status_id??1},custom_fields:b.custom_fields??[],description:b.description,updated_on:new Date().toISOString(),journals:[]};issues.set(i.id,i);return response({issue:i},201);
      }
    }
    const match=/^\/issues\/(\d+)\.json$/.exec(url.pathname);
    if(match){const issue=issues.get(Number(match[1]));if(!issue)return response({},404);
      if(key!=='service'&&login!=='dispatcher')return response({},403);
      const allowed=key==='service'?(issue.status.id===1||issue.status.id===4?[2]:[]):issue.status.id===2?[3,4,5]:issue.status.id===3?[4,5]:[];
      if(method==='GET')return response({issue:{...issue,allowed_statuses:allowed.map(id=>({id}))}});
      if(method==='PUT'){if(issue.status.id===5)return response({},403);const b=JSON.parse(String(init.body)).issue;if(b.status_id&&!allowed.includes(b.status_id))return response({},422);
        if(b.custom_fields){if(key!=='service')return response({},403);issue.custom_fields=b.custom_fields;}if(b.description!==undefined){if(key!=='service')return response({},403);issue.description=b.description;}
        const details=b.status_id?[{property:'attr',name:'status_id',new_value:String(b.status_id)}]:[];
        if(b.status_id)issue.status={id:b.status_id};issue.updated_on=new Date().toISOString();
        issue.journals.push({user:person??{id:99,name:'Service'},created_on:issue.updated_on,notes:b.notes??'',details});return response(null,204);}
    }
    return response({},403);
  }));
  return issues;
}
const line={id:'capture-123',start:'2026-11-26T06:00:00.000Z',end:'2026-11-26T07:00:00.000Z',kind:'work',activity:'Grünpflege',order:'',machines:[],materials:[]};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('Rapport REST boundary',()=>{
  it('auto-configures a private storage project without memberships and runs all workflow steps with only the service key',async()=>{const issues=mockRedmine(),app=Fastify();vi.stubEnv('RAPPORT_STORAGE_MODE','automatic');vi.stubEnv('RAPPORT_ENABLED','false');app.setErrorHandler((e,_,reply)=>reply.code(e instanceof RedmineError?e.status:500).send({message:e instanceof Error?e.message:String(e)}));registerRapport(app,cfg,r=>({version:1,username:String(r.headers['x-test-user']),password:'test',issuedAt:0}));const send=(method:'GET'|'POST'|'PUT',url:string,user:string,payload?:object)=>app.inject({method,url,headers:{'x-test-user':user},...(payload?{payload}:{})});try{const roster=await send('GET','/api/rapport/users','alice');expect(roster.statusCode).toBe(200);expect(roster.json().users).toHaveLength(3);const b={actorId:1,date:'2026-11-26',employees:[1,2],line};expect((await send('POST','/api/rapport/capture','alice',b)).json().results.every((r:{ok:boolean})=>r.ok)).toBe(true);expect(issues.size).toBe(2);expect(issues.get(100)?.custom_fields).toEqual([]);expect(issues.get(100)?.description).toContain('DERKUMPEL-RAPPORT/1');const own=(await send('GET','/api/rapport/reports/100','alice')).json();expect(own.state).toBe('draft');expect((await send('GET','/api/rapport/reports/101','alice')).statusCode).toBe(404);const submitted=(await send('POST','/api/rapport/reports/100/transition','alice',{revision:own.revision,action:'submit'})).json();expect(submitted.state).toBe('submitted');const closed=(await send('POST','/api/rapport/reports/100/transition','dispatcher',{revision:submitted.revision,action:'close'})).json();expect(closed.state).toBe('closed');expect(closed.reviewed.by.id).toBe(3);expect(issues.get(100)?.status.id).toBe(1);expect((await send('PUT','/api/rapport/reports/100','dispatcher',{revision:closed.revision,lines:[],material:'',reason:'Test'})).statusCode).toBe(409);const correction=await send('POST','/api/rapport/reports/100/correction','dispatcher',{reason:'Test'});expect(correction.statusCode).toBe(200);expect(correction.json().correction.reportId).toBe(100);expect((await send('POST','/api/rapport/catalog','dispatcher',{kind:'machine',name:'Traktor'})).statusCode).toBe(200);const catalog=await send('GET','/api/rapport/catalog','alice');expect(catalog.json().machines).toEqual([{id:103,name:'Traktor'}]);const list=await send('GET','/api/rapport/reports?from=2026-11-26&to=2026-11-26','alice');expect(list.json().reports).toHaveLength(2);expect((await send('GET','/api/rapport/users','outsider')).statusCode).toBe(403);}finally{await app.close();}});
  it('reads all recurring tasks and records multiple references without changing source tickets',async()=>{
    const issues=mockRedmine(),app=Fastify();app.setErrorHandler((e,_,reply)=>reply.code(e instanceof RedmineError?e.status:500).send({message:e instanceof Error?e.message:String(e)}));registerRapport(app,cfg,r=>({version:1,username:String(r.headers['x-test-user']),password:'test',issuedAt:0}));const headers={'x-test-user':'alice'};
    try{const t=await app.inject({method:'GET',url:'/api/rapport/green/tasks',headers});expect(t.statusCode).toBe(200);expect(t.json().tasks).toEqual([{id:701,subject:'Friedhof',municipalities:['Otterberg']},{id:702,subject:'Hecke',municipalities:[]}]);const b={actorId:1,date:'2026-11-26',employees:[1,2],line:{...line,sourceIds:[701,702]}};const r=await app.inject({method:'POST',url:'/api/rapport/capture',headers,payload:b});expect(r.json().results.every((x:{ok:boolean})=>x.ok)).toBe(true);expect(issues.size).toBe(2);for(const issue of issues.values()){const data=JSON.parse(issue.custom_fields[0]!.value);expect(data.lines).toHaveLength(1);expect(data.lines[0].sources.map((x:{id:number})=>x.id)).toEqual([701,702]);}await app.inject({method:'POST',url:'/api/rapport/capture',headers,payload:b});expect(issues.size).toBe(2);expect((await app.inject({method:'GET',url:'/api/rapport/green/tasks',headers:{'x-test-user':'outsider'}})).statusCode).toBe(403);}finally{await app.close();}
  });
  it('keeps the original closed report unchanged while creating a correction with independent workflow',async()=>{const issues=mockRedmine(),app=Fastify();vi.stubEnv('RAPPORT_CORRECTION_TRACKER_ID','12');app.setErrorHandler((e,_,reply)=>reply.code(e instanceof RedmineError?e.status:500).send({message:e instanceof Error?e.message:String(e)}));registerRapport(app,cfg,r=>({version:1,username:String(r.headers['x-test-user']),password:'test',issuedAt:0}));const send=(method:'GET'|'POST'|'PUT',url:string,user:string,payload?:object)=>app.inject({method,url,headers:{'x-test-user':user},...(payload?{payload}:{})});try{await send('POST','/api/rapport/capture','alice',{actorId:1,date:'2026-11-26',employees:[1],line});const original=(await send('GET','/api/rapport/reports/100','alice')).json();const submitted=(await send('POST','/api/rapport/reports/100/transition','alice',{revision:original.revision,action:'submit'})).json();const closed=(await send('POST','/api/rapport/reports/100/transition','dispatcher',{revision:submitted.revision,action:'close'})).json();expect(closed.state).toBe('closed');const snapshot=JSON.stringify(issues.get(100));expect((await send('POST','/api/rapport/reports/100/correction','alice',{reason:'Test'})).statusCode).toBe(403);const correction=await send('POST','/api/rapport/reports/100/correction','dispatcher',{reason:'Nachweis berichtigen'});expect(correction.statusCode).toBe(200);expect(correction.json().correction.reportId).toBe(100);expect(correction.json().state).toBe('draft');expect(JSON.stringify(issues.get(100))).toBe(snapshot);expect((await send('POST','/api/rapport/reports/100/correction','dispatcher',{reason:'Doppelt'})).statusCode).toBe(409);const list=await send('GET','/api/rapport/reports?from=2026-11-26&to=2026-11-26','alice');expect(list.json().reports).toHaveLength(2);}finally{await app.close();}});
  it('deduplicates batches, enforces ownership, audits edits, and locks closed reports',async()=>{
    const issues=mockRedmine(),app=Fastify();app.setErrorHandler((e,_,reply)=>reply.code(e instanceof RedmineError?e.status:500).send({message:e instanceof Error?e.message:String(e)}));
    registerRapport(app,cfg,r=>({version:1,username:String(r.headers['x-test-user']),password:'test',issuedAt:0}));
    const inject=(method:'GET'|'POST'|'PUT',url:string,user:string,payload?:object)=>app.inject({method,url,headers:{'x-test-user':user},...(payload?{payload}:{})});
    try{
      expect((await inject('GET','/api/rapport/users','outsider')).statusCode).toBe(403);
      const body={actorId:1,date:'2026-11-26',employees:[1,2],line};
      expect((await inject('POST','/api/rapport/capture','bob',body)).statusCode).toBe(403);
      const first=await inject('POST','/api/rapport/capture','alice',body);expect(first.statusCode).toBe(200);expect(first.json().results.every((r:{ok:boolean})=>r.ok)).toBe(true);
      await inject('POST','/api/rapport/capture','alice',body);expect(issues.size).toBe(2);
      const own=await inject('GET','/api/rapport/reports/100','alice');expect(own.statusCode).toBe(200);expect(own.json().lines).toHaveLength(1);
      expect((await inject('GET','/api/rapport/reports/101','alice')).statusCode).toBe(404);
      expect((await inject('GET','/api/rapport/reports?from=2026-11-26&to=2026-11-26&all=1','alice')).statusCode).toBe(403);
      expect((await inject('GET','/api/rapport/reports/101/pdf','alice')).statusCode).toBe(404);
      const submitted=await inject('POST','/api/rapport/reports/100/transition','alice',{revision:own.json().revision,action:'submit'});expect(submitted.statusCode).toBe(200);expect(submitted.json().state).toBe('submitted');
      expect((await inject('PUT','/api/rapport/reports/100','alice',{revision:submitted.json().revision,lines:[],material:''})).statusCode).toBe(409);
      const corrected=await inject('PUT','/api/rapport/reports/100','dispatcher',{revision:submitted.json().revision,lines:[{...line,activity:'Grünpflege Friedhof'}],material:'',reason:'Rücksprache'});expect(corrected.statusCode).toBe(200);expect(corrected.json().lines[0].recordedBy.id).toBe(1);
      const closed=await inject('POST','/api/rapport/reports/100/transition','dispatcher',{revision:corrected.json().revision,action:'close'});expect(closed.statusCode).toBe(200);expect(closed.json().state).toBe('closed');expect(closed.json().reviewed.by.id).toBe(3);
      expect((await inject('PUT','/api/rapport/reports/100','dispatcher',{revision:closed.json().revision,lines:[],material:'',reason:'Test'})).statusCode).toBe(409);
      const late=await inject('POST','/api/rapport/capture','alice',{...body,employees:[1],line:{...line,id:'capture-late'}});expect(late.json().results[0].ok).toBe(false);
      issues.get(100)!.journals.push({user:people.dispatcher!,created_on:new Date().toISOString(),notes:'private note',private_notes:true,details:[]});
      expect((await inject('GET','/api/rapport/reports/100','alice')).body).not.toContain('private note');
      const pdf=await inject('GET','/api/rapport/reports/100/pdf','alice');expect(pdf.statusCode).toBe(200);expect(pdf.headers['content-type']).toContain('application/pdf');
    }finally{await app.close();}
  });
});
