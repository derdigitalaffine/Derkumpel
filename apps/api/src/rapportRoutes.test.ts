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
  for(const [k,v] of Object.entries({RAPPORT_ENABLED:'true',RAPPORT_DIRECTORY_KEY:'directory',RAPPORT_SERVICE_KEY:'service',RAPPORT_PROJECT_ID:'10',RAPPORT_CATALOG_PROJECT_ID:'20',RAPPORT_TRACKER_ID:'11',RAPPORT_MACHINE_TRACKER_ID:'21',RAPPORT_MATERIAL_TRACKER_ID:'22',RAPPORT_DATA_FIELD_ID:'5',RAPPORT_STATUS_DRAFT:'1',RAPPORT_STATUS_SUBMITTED:'2',RAPPORT_STATUS_REVIEW:'3',RAPPORT_STATUS_RETURNED:'4',RAPPORT_STATUS_CLOSED:'5'}))vi.stubEnv(k,v);
  const issues=new Map<number,FixtureIssue>();
  vi.stubGlobal('fetch',vi.fn(async(input:URL|string,init:RequestInit={})=>{
    const url=new URL(String(input)),h=new Headers(init.headers),key=h.get('X-Redmine-API-Key'),auth=h.get('Authorization');
    const login=auth?Buffer.from(auth.replace('Basic ',''),'base64').toString().split(':')[0]!:'';
    const person=people[login];const method=init.method??'GET';
    if(url.pathname==='/users/current.json')return person?response({user:{id:person.id,firstname:person.name,lastname:'',login}}):response({},401);
    if(url.pathname==='/groups.json'&&key==='directory')return response({groups:[{id:1,name:'Disponenten Bauhof'},{id:2,name:'Bauhofmitarbeiter'}]});
    if(url.pathname==='/groups/1.json'&&key==='directory')return response({group:{users:[people.dispatcher]}});
    if(url.pathname==='/groups/2.json'&&key==='directory')return response({group:{users:[people.alice,people.bob]}});
    if(url.pathname==='/issues.json'&&key==='service'){
      if(method==='GET')return response({issues:[...issues.values()],total_count:issues.size});
      if(method==='POST'){
        const b=JSON.parse(String(init.body)).issue;const i:FixtureIssue={id:100+issues.size,subject:b.subject,project:{id:b.project_id},tracker:{id:b.tracker_id},status:{id:b.status_id},custom_fields:b.custom_fields,description:b.description,updated_on:new Date().toISOString(),journals:[]};issues.set(i.id,i);return response({issue:i},201);
      }
    }
    const match=/^\/issues\/(\d+)\.json$/.exec(url.pathname);
    if(match){const issue=issues.get(Number(match[1]));if(!issue)return response({},404);
      if(key!=='service'&&login!=='dispatcher')return response({},403);
      const allowed=key==='service'?(issue.status.id===1||issue.status.id===4?[2]:[]):issue.status.id===2?[3,4,5]:issue.status.id===3?[4,5]:[];
      if(method==='GET')return response({issue:{...issue,allowed_statuses:allowed.map(id=>({id}))}});
      if(method==='PUT'){if(issue.status.id===5)return response({},403);const b=JSON.parse(String(init.body)).issue;if(b.status_id&&!allowed.includes(b.status_id))return response({},422);
        if(b.custom_fields){if(key!=='service')return response({},403);issue.custom_fields=b.custom_fields;issue.description=b.description;}
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
  it('deduplicates batches, enforces ownership, audits edits, and locks closed reports',async()=>{
    const issues=mockRedmine(),app=Fastify();app.setErrorHandler((e,_,reply)=>reply.code(e instanceof RedmineError?e.status:500).send({message:e.message}));
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
