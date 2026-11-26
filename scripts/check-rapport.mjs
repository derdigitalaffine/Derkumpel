// Read-only preflight, never prints credentials or creates issues.
const env=process.env;
const need=n=>{const s=env[n];if(!s)throw Error('Fehlende Einstellung '+n);return s;};
const integer=n=>{const id=Number(need(n));if(!Number.isSafeInteger(id)||id<=0)throw Error('Ungültige ID '+n);return id;};
const url=new URL(need('REDMINE_BASE_URL'));if(url.protocol!=='https:')throw Error('HTTPS erforderlich');
const admin=need('RAPPORT_DIRECTORY_KEY'),service=need('RAPPORT_SERVICE_KEY');if(admin===service)throw Error('Separate API-Schlüssel erforderlich');
const get=async(key,path)=>{const r=await fetch(new URL(path,url),{headers:{'X-Redmine-API-Key':key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('REST-Prüfung '+path+' fehlgeschlagen: '+r.status);return r.json();};
const check=(condition,msg)=>{if(!condition)throw Error(msg);console.log('OK: '+msg);};
try{
  const actor=(await get(service,'/users/current.json')).user;check(actor.admin!==true,'Servicekonto ist nicht Administrator (Redmine-Angabe)');
  const groups=(await get(admin,'/groups.json')).groups;
  for(const name of ['Disponenten Bauhof','Bauhofmitarbeiter']){const group=groups.find(g=>g.name===name);check(!!group,'Gruppe '+name);const d=(await get(admin,'/groups/'+group.id+'.json?include=users')).group;check(Array.isArray(d.users),'Mitglieder lesbar: '+name);}
  const projectIds=[integer('RAPPORT_PROJECT_ID'),integer('RAPPORT_CATALOG_PROJECT_ID')];check(projectIds[0]!==projectIds[1],'Getrennte Projekte');
  const trackerIds=[[integer('RAPPORT_TRACKER_ID')],[integer('RAPPORT_MACHINE_TRACKER_ID'),integer('RAPPORT_MATERIAL_TRACKER_ID')]];
  for(let i=0;i<2;i++){const p=(await get(service,'/projects/'+projectIds[i]+'.json?include=trackers')).project;check(p.is_public===false,'Projekt '+p.identifier+' privat');for(const id of trackerIds[i])check(p.trackers?.some(t=>t.id===id),'Tracker '+id+' im Projekt aktiv');}
  const statuses=(await get(service,'/issue_statuses.json')).issue_statuses;
  const ids=['DRAFT','SUBMITTED','REVIEW','RETURNED','CLOSED'].map(k=>integer('RAPPORT_STATUS_'+k));check(new Set(ids).size===5,'Fünf unterschiedliche Status');
  for(let i=0;i<ids.length;i++){const s=statuses.find(x=>x.id===ids[i]);check(!!s&&Boolean(s.is_closed)===(i===4),'Status '+ids[i]+' korrekt offen/geschlossen');}
  const fields=(await get(admin,'/custom_fields.json')).custom_fields;const data=fields.find(f=>f.id===integer('RAPPORT_DATA_FIELD_ID'));check(data?.customized_type==='issue'&&data.field_format==='text','Rapportdaten-Langtextfeld');
  for(const k of ['OWNER','DATE','WORK','TARGET','PAUSE','DIFFERENCE','MACHINES','COUNT']){const key='RAPPORT_SUMMARY_'+k+'_FIELD_ID';if(env[key]){const field=fields.find(f=>f.id===integer(key));check(field?.customized_type==='issue'&&field.field_format===(k==='DATE'?'date':'int'),'Auswertungsfeld '+k);}}
  console.log('Lesende Konfigurationsprüfung abgeschlossen. Rollen, Feldschreibschutz, Sichtbarkeit und Workflow müssen mit Testkonten und direkter REST-API geprüft werden.');
}catch(e){console.error('Rapport-Prüfung fehlgeschlagen:',e.message);process.exitCode=1;}
