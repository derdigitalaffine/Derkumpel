import {Alert,Badge,Button,Checkbox,Group,Paper,ScrollArea,Select,SimpleGrid,Stack,Text,Textarea,TextInput,Title} from '@mantine/core';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../api';
import {getSetting,setSetting,db} from '../db';
import {replayRapportQueue} from '../rapportQueue';
import {formatDuration} from '../rapport';
import {fromInputTime,inputTime,today} from '../rapportBook';
import {filterTasks,municipalities,roundedDuration,type GreenTask} from '../green';
import type {CurrentUser} from '../types';
type Person={id:number;name:string;groups:string[]};
type Session={team:number[];town:string;includeUnassigned:boolean;selected:number[];excluded:number[];start:string;duration:number;runningAt:number|null;note:string;operationId?:string};
const initial=():Session=>({team:[],town:'*',includeUnassigned:false,selected:[],excluded:[],start:today()+'T07:00',duration:0,runningAt:null,note:''});
const errorText=(e:unknown)=>e instanceof Error?e.message:'Anfrage fehlgeschlagen';
export function GreenPage(){
  const [actor,setActor]=useState(0),[people,setPeople]=useState<Person[]>([]),[tasks,setTasks]=useState<GreenTask[]>([]),[session,setSession]=useState<Session>(initial),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[teamSearch,setTeamSearch]=useState(''),[now,setNow]=useState(Date.now()),[attempt,setAttempt]=useState(0),[persistError,setPersistError]=useState(false);
  useEffect(()=>{let active=true;setLoading(true);setError('');async function load(){
    let me:CurrentUser|null=null;let data:{people:Person[];tasks:GreenTask[]};
    if(navigator.onLine){const [user,roster,result]=await Promise.all([api.me(),api.rapportUsers(),api.greenTasks()]);me=user;data={people:roster.users,tasks:result.tasks};await setSetting('green-cache',{ownerId:me.id,data});}
    else{me=await getSetting<CurrentUser|null>('lastUser',null);const cached=await getSetting<{ownerId:number;data:typeof data}|null>('green-cache',null);if(!me||cached?.ownerId!==me.id)throw Error('Bitte Grünpflege zuerst online öffnen.');data=cached.data;}
    const stored=await getSetting<Session|null>('green-session:'+me.id,null);if(!active)return;setActor(me.id);setPeople(data.people);setTasks(data.tasks);setSession(stored??{...initial(),team:data.people.some(p=>p.id===me!.id)?[me.id]:[]});
  }void load().catch(e=>{if(active)setError(errorText(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[attempt]);
  useEffect(()=>{if(session.runningAt===null)return;const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t);},[session.runningAt]);
  const change=(patch:Partial<Session>)=>{const next={...session,...patch};setSession(next);if(actor)void setSetting('green-session:'+actor,next).then(()=>setPersistError(false)).catch(()=>setPersistError(true));};
  const towns=municipalities(tasks);
  const activeTown=towns.includes(session.town)?session.town:'*';
  const visible=filterTasks(tasks,activeTown,session.includeUnassigned,search),chosen=tasks.filter(t=>session.selected.includes(t.id)),recipients=session.team.filter(id=>!session.excluded.includes(id)&&people.some(p=>p.id===id));
  const missingTasks=session.selected.filter(id=>!tasks.some(t=>t.id===id));
  const toggle=(items:number[],id:number)=>items.includes(id)?items.filter(x=>x!==id):[...items,id];
  const running=session.runningAt!==null,startAt=fromInputTime(session.start),effective=running?roundedDuration(session.runningAt!,now):session.duration;
  const start=()=>{const t=Date.now();setNow(t);change({runningAt:t,start:inputTime(new Date(t).toISOString()),duration:0,operationId:crypto.randomUUID()});};
  const stop=()=>change({duration:roundedDuration(session.runningAt!,Date.now()),runningAt:null});
  const save=async()=>{if(!actor||!startAt||!chosen.length||missingTasks.length||!recipients.length||!session.duration||running||busy)return;setBusy(true);setError('');setNotice('');
    const operationId=session.operationId??crypto.randomUUID();const next={...session,operationId};setSession(next);
    try{
      const cleared={...session,selected:[],excluded:[],duration:0,runningAt:null,note:'',operationId:undefined};
      await db.transaction('rw',db.settings,db.rapportQueue,async()=>{
        const old=await db.rapportQueue.get(operationId);if(!old){const body={actorId:actor,date:session.start.slice(0,10),employees:recipients,line:{id:operationId,start:startAt,end:new Date(Date.parse(startAt)+session.duration*60000).toISOString(),kind:'work' as const,activity:'Grünpflege: '+chosen.map(t=>t.subject).join('; ').slice(0,800)+(session.note?' · '+session.note.slice(0,150):''),order:'',sourceKind:'green' as const,sourceIds:chosen.map(t=>t.id),machines:[],materials:[]}};await db.rapportQueue.add({id:operationId,ownerId:actor,createdAt:Date.now(),body,state:'pending'});}
        await db.settings.put({key:'green-session:'+actor,value:cleared});
      });
      setSession(cleared);setNotice('Einsatz lokal gesichert. Übertragungen und Konflikte findest du unter Rapporte → Erfassen.');await replayRapportQueue();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  return <Stack maw={950} mx="auto" gap="md">
    <Group justify="space-between"><Title order={1} size="h2">Grünpflege</Title><Group gap="xs"><Button component={Link} to="/settings?tab=advanced" h={48} variant="default">Einrichtung</Button><Button component={Link} to="/rapport/book" h={48} variant="light">Rapporte</Button></Group></Group>
    <Alert variant="light">Aufgaben sind wiederverwendbare Redmine-Vorgänge. Ihr Status bleibt unverändert. Mehrere Aufgaben ergeben einen gemeinsamen Zeitabschnitt pro Person.</Alert>
    {error&&<Alert color="red">{error}</Alert>}{notice&&<Alert color="green">{notice}</Alert>}{persistError&&<Alert color="red">Der aktuelle Einsatz konnte nicht lokal gespeichert werden.</Alert>}
    {loading?<Text role="status">Aufgaben werden geladen …</Text>:!actor?<Button h={48} onClick={()=>setAttempt(a=>a+1)}>Erneut laden</Button>:<>
      <Paper withBorder p="md" className="surface-card"><Stack gap="sm"><Group justify="space-between"><Title order={2} size="h4">Kolonne</Title><Badge>{recipients.length} Personen</Badge></Group>
        <Text size="sm" c="dimmed">Team einmal auswählen; Ausnahmen gelten für den aktuellen Einsatz.</Text>
        <TextInput label="Kollegen suchen" value={teamSearch} onChange={e=>setTeamSearch(e.currentTarget.value)}/>
        <ScrollArea.Autosize mah={240}><Stack gap="xs">{[...people].sort((a,b)=>Number(session.team.includes(b.id))-Number(session.team.includes(a.id))||a.name.localeCompare(b.name,'de')).filter(p=>p.name.toLocaleLowerCase('de').includes(teamSearch.toLocaleLowerCase('de'))).map(p=><Checkbox key={p.id} size="lg" disabled={running||busy} label={p.name+(p.id===actor?' (Du)':'')} checked={session.team.includes(p.id)} onChange={()=>change({team:toggle(session.team,p.id)})}/>)}</Stack></ScrollArea.Autosize>
        {session.team.length>0&&<details><summary>Ausnahmen für diesen Einsatz</summary><Stack mt="sm">{people.filter(p=>session.team.includes(p.id)).map(p=><Checkbox key={p.id} size="lg" label={p.name+' nicht rapportieren'} checked={session.excluded.includes(p.id)} disabled={busy} onChange={()=>change({excluded:toggle(session.excluded,p.id)})}/>)}</Stack></details>}
      </Stack></Paper>
      <Paper withBorder p="md" className="surface-card"><Stack gap="sm"><Group justify="space-between"><Title order={2} size="h4">Ortsgemeinde & Aufgaben</Title><Button h={48} variant="light" disabled={running||busy||loading||!navigator.onLine} onClick={()=>setAttempt(a=>a+1)}>Aktualisieren</Button></Group><Text size="sm" c="dimmed">Orte aus dem Redmine-Feld „Ort“ der Grünpflegearbeiten. Keine manuelle Ortsliste.</Text>{!towns.length&&<Alert variant="light">Noch keine Ortsangaben in den sichtbaren Grünpflegearbeiten. Aufgaben ohne Ort können eingeblendet werden.</Alert>}
        <SimpleGrid cols={{base:2,sm:3}}>{towns.map(t=><Button key={t} h={50} disabled={running||busy} variant={activeTown===t?'filled':'light'} styles={{label:{whiteSpace:'normal'}}} onClick={()=>change({town:t,selected:[]})}>{t} ({tasks.filter(task=>task.municipalities.includes(t)).length})</Button>)}<Button h={50} variant={activeTown==='*'?'filled':'default'} disabled={running||busy} onClick={()=>change({town:'*',selected:[]})}>Alle Orte</Button></SimpleGrid>
        <Checkbox size="lg" label="Auch ohne Ortsangabe" checked={session.includeUnassigned} disabled={running||busy} onChange={e=>change({includeUnassigned:e.currentTarget.checked})}/>
        <TextInput label="Aufgaben suchen" value={search} onChange={e=>setSearch(e.currentTarget.value)}/>
        <Text size="sm" c="dimmed">{visible.length} Aufgaben · {chosen.length} ausgewählt</Text>
        {!visible.length&&<Text c="dimmed" size="sm">Keine passenden Aufgaben vorhanden.</Text>}<ScrollArea.Autosize mah={420}><Stack gap="xs">{visible.map(t=><Paper key={t.id} withBorder p="sm"><Checkbox size="lg" disabled={running||busy} checked={session.selected.includes(t.id)} onChange={()=>change({selected:toggle(session.selected,t.id)})} label={<Stack gap={2}><Text fw={700}>{t.subject}</Text><Text size="xs" c="dimmed">#{t.id} · {t.municipalities.join(', ')||'Ohne Ortsangabe'}</Text></Stack>}/></Paper>)}</Stack></ScrollArea.Autosize>
        {missingTasks.length>0&&<Alert color="orange" title="Aufgaben nicht mehr im Katalog">{missingTasks.map(id=>'#'+id).join(', ')} wurden entfernt oder sind nicht mehr verfügbar. Bitte Auswahl prüfen.<Button mt="xs" h={48} variant="default" disabled={running||busy} onClick={()=>change({selected:session.selected.filter(id=>!missingTasks.includes(id))})}>Nicht verfügbare Aufgaben aus Auswahl entfernen</Button></Alert>}
        {chosen.length>0&&<Text size="sm">Auswahl: {chosen.map(t=>'#'+t.id+' '+t.subject).join('; ')}</Text>}
      </Stack></Paper>
      <Paper withBorder p="md" className="surface-card"><Stack gap="sm"><Title order={2} size="h4">Einsatzzeit</Title>
        {running?<><Text ta="center" c="green" fw={700}>Einsatz läuft seit {inputTime(new Date(session.runningAt!).toISOString()).slice(11)}</Text><Title order={2} ta="center">{formatDuration(Math.max(0,Math.floor((now-session.runningAt!)/60000)))} h</Title><Button h={64} color="red" onClick={stop}>Aufgabe beenden</Button></>:<>
          <TextInput type="datetime-local" label="Beginn" value={session.start} disabled={busy} onChange={e=>change({start:e.currentTarget.value})}/>
          <Title order={2} ta="center">{formatDuration(session.duration)} h</Title>
          <Select label="Dauer in Viertelstunden" value={String(session.duration)} data={[{value:'0',label:'Bitte wählen'},...Array.from({length:96},(_,i)=>({value:String((i+1)*15),label:formatDuration((i+1)*15)+' h'}))]} onChange={v=>change({duration:Number(v??0)})} searchable disabled={busy}/>
          <SimpleGrid cols={2}>{[15,30,45,60].map(n=><Button key={n} h={52} variant="light" disabled={busy||session.duration+n>1440} onClick={()=>change({duration:session.duration+n})}>+{n} min</Button>)}</SimpleGrid>
          <Button h={60} variant="outline" disabled={!chosen.length||!!missingTasks.length||!recipients.length||busy||session.duration>0} onClick={start}>Aufgabe beginnen</Button>
          <Text size="xs" c="dimmed">Stoppuhr: Dauer wird auf die nächstgelegene Viertelstunde gerundet (mindestens 15 Minuten) und kann vor Übernahme korrigiert werden. Läuft auch bei geschlossenem Bildschirm über Zeitstempel weiter.</Text>
          <Text size="sm">Ende: {startAt&&session.duration?inputTime(new Date(Date.parse(startAt)+session.duration*60000).toISOString()).replace('T',' '):'–'}</Text>
        </>}
        <Textarea label="Ergänzende Tätigkeit (optional)" value={session.note} onChange={e=>change({note:e.currentTarget.value})} disabled={busy}/>
        <Text fw={700}>Gesamtaufwand: {formatDuration(effective*recipients.length)} Personenstunden</Text>
        <Button h={60} loading={busy} disabled={running||!startAt||!session.duration||!chosen.length||!!missingTasks.length||!recipients.length||persistError} onClick={()=>void save()}>In {recipients.length} Tagesrapporte übernehmen</Button>
        {!running&&session.duration>0&&<Button h={48} variant="subtle" disabled={busy} onClick={()=>change({duration:0,operationId:undefined})}>Zeit zurücksetzen</Button>}
        <Button component={Link} to="/rapport" h={48} variant="default">Übertragungen anzeigen</Button>
      </Stack></Paper>
    </>}
  </Stack>;
}
