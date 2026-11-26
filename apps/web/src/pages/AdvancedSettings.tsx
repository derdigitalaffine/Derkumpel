import {Alert,Badge,Button,Card,Group,Select,Stack,Text,Title} from '@mantine/core';
import {useEffect,useState} from 'react';
import {api,type TechnicalSelection,type TechnicalSettings} from '../api';
const message=(e:unknown)=>e instanceof Error?e.message:'Anfrage fehlgeschlagen';
const asString=(id:number|null)=>id===null?null:String(id);
export function AdvancedSettings(){
  const [data,setData]=useState<TechnicalSettings|null>(null),[selection,setSelection]=useState<TechnicalSelection|null>(null),[allowed,setAllowed]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[checks,setChecks]=useState<{label:string;ok:boolean;detail:string}[]>([]),[elapsed,setElapsed]=useState(0),[greenTrackers,setGreenTrackers]=useState<{id:number;name:string}[]>([]),[storageTrackers,setStorageTrackers]=useState<number[]>([]);
  const load=async()=>{setBusy(true);setError('');try{const access=await api.technicalAccess();setAllowed(access.allowed);if(!access.allowed)return;const d=await api.technicalSettings();setData(d);setSelection(Object.fromEntries(Object.keys(d.selection).map(k=>[k,d.selection[k as keyof TechnicalSelection]??d.defaults[k as keyof TechnicalSelection]])) as TechnicalSelection);}catch(e){setError(message(e));}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);
  const storageId=selection?.storageProjectId,greenId=selection?.greenProjectId;
  useEffect(()=>{let active=true;setStorageTrackers([]);if(storageId)void api.technicalProject(storageId).then(p=>{if(active)setStorageTrackers(p.trackers.map(t=>t.id));}).catch(e=>{if(active)setError(message(e));});return()=>{active=false;};},[storageId]);
  useEffect(()=>{let active=true;setGreenTrackers([]);if(greenId)void api.technicalProject(greenId).then(p=>{if(active)setGreenTrackers(p.trackers);}).catch(e=>{if(active)setError(message(e));});return()=>{active=false;};},[greenId]);
  const change=(key:keyof TechnicalSelection,v:string|null)=>{setSelection(old=>old?{...old,[key]:v===null?null:Number(v),...(key==='greenProjectId'?{greenTrackerId:null}:key==='storageProjectId'?{storageTrackerId:null}:{})}:old);setNotice('');setChecks([]);};
  const save=async()=>{if(!selection)return;setBusy(true);setError('');setNotice('');try{await api.technicalSave(selection);setNotice('Globale Zuordnungen gespeichert. Sie gelten für alle Geräte.');}catch(e){setError(message(e));}finally{setBusy(false);}};
  const check=async()=>{setBusy(true);setError('');setChecks([]);try{const result=await api.technicalCheck();setChecks(result.checks);setElapsed(result.elapsedMs);}catch(e){setError(message(e));}finally{setBusy(false);}};
  const greenCount=selection?[selection.greenProjectId,selection.greenTrackerId,selection.greenFieldId].filter(v=>v!==null).length:0;
  const projects=data?.projects.map(p=>({value:String(p.id),label:p.name+' · #'+p.id+(p.isPublic?' · öffentlich':' · privat')}))??[];
  return <Stack gap="md">
    <Title order={2} size="h3">Redmine-Zuordnungen</Title>
    <Text size="sm" c="dimmed">Globale technische Konfiguration. Nur Redmine-Administratoren können sie ändern. Arbeitsdaten bleiben in Redmine.</Text>
    {error&&<Alert color="red" title="Redmine-Konfiguration">{error}</Alert>}{notice&&<Alert color="green">{notice}</Alert>}
    {allowed===false?<Alert>Dieser Bereich ist ausschließlich für Redmine-Administratoren verfügbar.</Alert>:<><Button variant="light" h={48} loading={busy&&!data} disabled={busy&&!!data} onClick={()=>void load()}>Redmine-Auswahllisten aktualisieren</Button>
    {data&&selection&&<>
      <Card withBorder><Stack><Title order={3} size="h4">Rapportwesen – technischer Speicher</Title><Text size="sm">Tagesrapporte, Korrekturen, Maschinen, Material und Archive werden in diesem Projekt gespeichert. Der Tracker wird bei Bedarf aktiviert. Vorhandene Daten werden nicht verschoben.</Text>
      <Select label="Speicherprojekt" searchable clearable value={asString(selection.storageProjectId)} data={projects} disabled={busy} onChange={v=>change('storageProjectId',v)}/>
      <Select label="Speichertracker" searchable clearable value={asString(selection.storageTrackerId)} data={data.trackers.filter(t=>t.defaultStatusId!==null).map(t=>({value:String(t.id),label:t.name+' · #'+t.id+(storageTrackers.includes(t.id)?' · aktiv':'')}))} disabled={busy||!storageId} onChange={v=>change('storageTrackerId',v)}/>
      </Stack></Card>
      <Card withBorder><Stack><Title order={3} size="h4">Grünpflege – technischer Katalog</Title><Text size="sm">Nur lesender Zugriff, auch auf erledigte Tickets. Kein Workflow und keine Mitarbeiterzuordnung erforderlich.</Text>
      <Select label="Grünpflegeprojekt" searchable clearable value={asString(selection.greenProjectId)} data={projects} disabled={busy} onChange={v=>change('greenProjectId',v)}/>
      <Select label="Grünpflegetracker" searchable clearable value={asString(selection.greenTrackerId)} data={greenTrackers.map(t=>({value:String(t.id),label:t.name+' · #'+t.id}))} disabled={busy||!greenId} onChange={v=>change('greenTrackerId',v)}/>
      <Select label="Ticketfeld für Ortsangabe" searchable clearable value={asString(selection.greenFieldId)} data={data.fields.map(f=>({value:String(f.id),label:f.name+' · #'+f.id+(f.format?' · '+f.format:'')}))} disabled={busy} onChange={v=>change('greenFieldId',v)}/>
      <Button variant="subtle" disabled={busy} onClick={()=>{setSelection(old=>old?{...old,greenProjectId:null,greenTrackerId:null,greenFieldId:null}:old);setNotice('');setChecks([]);}}>Grünpflege vorerst automatisch erkennen</Button>
      </Stack></Card>
      <Button h={54} loading={busy} disabled={!selection.storageProjectId||!selection.storageTrackerId||(greenCount!==0&&greenCount!==3)} onClick={()=>void save()}>Globale Einstellungen speichern</Button>
      <Card withBorder><Stack><Title order={3} size="h4">Verbindung und Einrichtung prüfen</Title><Text size="sm" c="dimmed">Initialisiert bei Bedarf den technischen Rapportspeicher und prüft die gespeicherte Zuordnung, Gruppen, vorhandene Rapporte und Aufgaben. Fehlermeldungen nennen den betroffenen Redmine-Endpunkt.</Text><Button h={50} variant="outline" loading={busy} onClick={()=>void check()}>Diagnose starten</Button>{checks.map((c,i)=><Stack key={i} gap={4}><Group justify="space-between"><Text fw={700}>{c.label}</Text><Badge color={c.ok?'green':'red'}>{c.ok?'OK':'Fehler'}</Badge></Group><Text size="sm" style={{overflowWrap:'anywhere'}}>{c.detail}</Text></Stack>)}{!!checks.length&&<Text size="xs" c="dimmed">Dauer: {(elapsed/1000).toFixed(1)} Sekunden</Text>}</Stack></Card>
    </>}</>}
  </Stack>;
}
