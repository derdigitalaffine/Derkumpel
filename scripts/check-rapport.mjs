// Read-only diagnostics for automatic storage. Actual initialization is performed by the backend on first authorized access.
const env=process.env;
const key=env.RAPPORT_DIRECTORY_KEY||env.DERKUMPEL_ADMIN_API_KEY||env.PUSH_POLL_API_KEY;
const storageKey=env.RAPPORT_SERVICE_KEY||key;
const base=new URL(env.REDMINE_BASE_URL||'https://redmine.vgo-o.de');
const identifier=env.DERKUMPEL_PROJECT_IDENTIFIER||'derkumpel';
if(!key||base.protocol!=='https:'){console.error('HTTPS und serverseitiger Redmine-Administratorschlüssel erforderlich.');process.exit(1);}
const get=async(k,path)=>{const response=await fetch(new URL(path,base),{headers:{'X-Redmine-API-Key':k,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(path+' HTTP '+response.status);return response.json();};
try{
 const {groups}=await get(key,'/groups.json');
 for(const name of ['Bauhofmitarbeiter','Disponenten Bauhof']){const group=groups.find(g=>g.name===name);if(!group)throw Error('Gruppe fehlt: '+name);const d=await get(key,'/groups/'+group.id+'.json?include=users');console.log(name+': '+d.group.users.length+' Mitglieder');}
 const {project}=await get(key,'/projects/'+encodeURIComponent(identifier)+'.json?include=trackers,enabled_modules');
 console.log('Speicherprojekt #'+project.id+': '+project.name+' ('+(project.is_public?'wird bei Initialisierung privat geschaltet':'privat')+')');
 const technical=(await get(storageKey,'/users/current.json')).user, admin=(await get(key,'/users/current.json')).user;
 for(let offset=0;offset<100000;){const page=await get(key,'/projects/'+project.id+'/memberships.json?limit=100&offset='+offset);if(page.memberships.some(m=>m.group||![technical.id,admin.id].includes(m.user?.id)))throw Error('Speicherprojekt enthält weitere Mitglieder. Bitte Zugriffsrechte klären.');offset+=page.memberships.length;if(!page.memberships.length||offset>=page.total_count)break;}
 const {trackers}=await get(key,'/trackers.json');const {issue_statuses:statuses}=await get(key,'/issue_statuses.json');
 if(!trackers.some(t=>t.default_status&&statuses.some(s=>s.id===t.default_status.id&&!s.is_closed)))throw Error('Kein geeigneter vorhandener Tracker.');
 console.log('Vorprüfung erfolgreich. Die App richtet den Speicher beim ersten Zugriff eines Bauhofmitglieds ein. Keine Änderungen durchgeführt.');
}catch(e){console.error('Rapport-Prüfung fehlgeschlagen: '+e.message);process.exitCode=1;}
