import { Alert, Badge, Button, Checkbox, Group, Paper, Progress, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { db,getSetting,setSetting } from '../db';
import type { CurrentUser } from '../types';
import { useNetwork } from '@mantine/hooks';
import { fullDayMinutes, formatDuration } from '../rapport';
import { effectiveReports,fromInputTime,inputTime,lineMinutes,shiftDay,stateLabels,sumWork,today,weekStart,type Catalog,type RapportLine,type RapportReport } from '../rapportBook';
const errorText=(e:unknown)=>e instanceof Error?e.message:'Anfrage fehlgeschlagen';
const stamp=(s:string)=>s?new Date(s).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'}):'–';
const emptyCatalog:Catalog={machines:[],materials:[]};
function TimeField({label,value,disabled,onChange}:{label:string;value:string;disabled:boolean;onChange:(v:string)=>void}){
  const [raw,setRaw]=useState(()=>inputTime(value));useEffect(()=>{if(value)setRaw(inputTime(value));},[value]);
  return <TextInput type="datetime-local" label={label} size="lg" disabled={disabled} value={raw} error={raw&&!fromInputTime(raw,value)?'Ungültige oder mehrdeutige Uhrzeit':undefined} onChange={e=>{const s=e.currentTarget.value;setRaw(s);onChange(fromInputTime(s,value));}}/>;
}
function LineEditor({line,disabled,catalog,update,remove}:{line:RapportLine;disabled:boolean;catalog:Catalog;update:(l:RapportLine)=>void;remove:()=>void}){
  const [open,setOpen]=useState(false);const [orderInfo,setOrderInfo]=useState('');const [orderSearch,setOrderSearch]=useState('');const [orders,setOrders]=useState<{id:number;subject:string}[]>([]);
  return <Paper p="md" withBorder className="surface-card"><Stack gap="sm">
    <Button variant="subtle" color="dark" h="auto" p="xs" onClick={()=>setOpen(o=>!o)} aria-expanded={open} styles={{label:{whiteSpace:'normal',textAlign:'left',display:'block',width:'100%'}}}>
      <Group justify="space-between"><Text fw={800}>{stamp(line.start)} – {stamp(line.end)}</Text><Badge>{formatDuration(Math.max(0,lineMinutes(line)||0))} h</Badge></Group>
      <Text fw={600}>{line.kind==='pause'?'Pause':line.activity||'Tätigkeit ergänzen'} · {open?'▴':'▾'}</Text>
    </Button>
    {line.recordedBy&&<Text size="xs" c="dimmed">Vorerfasst durch {line.recordedBy.name} · {line.recordedAt?stamp(line.recordedAt):''}</Text>}
    {open&&<>
      <Select label="Art" disabled={disabled} data={[{value:'work',label:'Arbeitsleistung'},{value:'pause',label:'Pause'}]} value={line.kind} onChange={v=>update({...line,kind:v==='pause'?'pause':'work',...(v==='pause'?{machines:[],materials:[]}: {})})}/>
      <SimpleGrid cols={{base:1,sm:2}}><TimeField label="Beginn" value={line.start} disabled={disabled} onChange={start=>update({...line,start})}/><TimeField label="Ende" value={line.end} disabled={disabled} onChange={end=>update({...line,end})}/></SimpleGrid>
      <Textarea label="Art der Leistung" disabled={disabled} value={line.activity} onChange={e=>update({...line,activity:e.currentTarget.value})} autosize minRows={2}/>
      {line.kind==='work'&&<>
        {!!line.sources?.length&&<Stack gap={4}><Text size="sm" fw={700}>Zugeordnete Aufgaben</Text>{line.sources.map(s=><Text key={s.id} size="sm">#{s.id} · {s.subject}{s.municipalities?.length?' · '+s.municipalities.join(', '):''}</Text>)}</Stack>}
        {!disabled&&<Group align="end"><TextInput label="Auftrag suchen" value={orderSearch} onChange={e=>setOrderSearch(e.currentTarget.value)} style={{flex:1}}/><Button h={48} variant="light" disabled={orderSearch.trim().length<2} onClick={()=>{void api.rapportOrders(orderSearch).then(r=>{setOrders(r.orders);setOrderInfo(r.orders.length?'':'Keine Treffer');}).catch(e=>setOrderInfo(errorText(e)));}}>Suchen</Button></Group>}
        {!disabled&&orders.length>0&&<Select label="Gefundene Aufträge" searchable data={orders.map(o=>({value:String(o.id),label:'#'+o.id+' · '+o.subject}))} onChange={v=>{if(v)update({...line,order:'#'+v});setOrders([]);}}/>}
        <TextInput label="Auftrag (Redmine #Nr. oder freie Nummer)" disabled={disabled} value={line.order} onChange={e=>{setOrderInfo('');update({...line,order:e.currentTarget.value});}}/>
        {/^#\d+$/.test(line.order)&&<Button h={48} variant="light" onClick={()=>{void api.rapportOrder(Number(line.order.slice(1))).then(r=>setOrderInfo(r.subject)).catch(()=>setOrderInfo('Auftrag nicht sichtbar oder nicht vorhanden.'));}}>Redmine-Auftrag prüfen</Button>}{orderInfo&&<Text size="sm">{orderInfo}</Text>}
        <Title order={4} size="h5">Maschineneinsatz</Title>
        {line.machines.map((m,i)=><Paper withBorder p="xs" key={i}><Stack gap="xs">
          <TextInput label="Maschine (Katalog oder Freitext)" list="rapport-machines" disabled={disabled} value={m.name} onChange={e=>update({...line,machines:line.machines.map((x,j)=>i===j?{...x,name:e.currentTarget.value}:x)})}/>
          <TextInput type="number" label="Einsatzdauer in Minuten" min={1} max={1440} step={15} disabled={disabled} value={String(m.minutes)} onChange={e=>update({...line,machines:line.machines.map((x,j)=>i===j?{...x,minutes:Number(e.currentTarget.value)}:x)})}/>
          {!disabled&&<Button variant="subtle" color="red" h={48} onClick={()=>update({...line,machines:line.machines.filter((_,j)=>i!==j)})}>Maschine entfernen</Button>}
        </Stack></Paper>)}
        {!disabled&&<Button variant="light" h={48} onClick={()=>update({...line,machines:[...line.machines,{name:'',minutes:15}]})}>+ Maschine</Button>}
        <Title order={4} size="h5">Materialverbrauch</Title>
        {line.materials.map((m,i)=><Paper withBorder p="xs" key={i}><Stack gap="xs">
          <TextInput label="Material (Katalog oder Freitext)" list="rapport-materials" disabled={disabled} value={m.name} onChange={e=>update({...line,materials:line.materials.map((x,j)=>i===j?{...x,name:e.currentTarget.value}:x)})}/>
          <SimpleGrid cols={2}><TextInput label="Menge" type="number" min={0.01} step="any" disabled={disabled} value={String(m.quantity)} onChange={e=>update({...line,materials:line.materials.map((x,j)=>i===j?{...x,quantity:Number(e.currentTarget.value)}:x)})}/><TextInput label="Einheit" disabled={disabled} value={m.unit} onChange={e=>update({...line,materials:line.materials.map((x,j)=>i===j?{...x,unit:e.currentTarget.value}:x)})}/></SimpleGrid>
          {!disabled&&<Button variant="subtle" color="red" h={48} onClick={()=>update({...line,materials:line.materials.filter((_,j)=>i!==j)})}>Material entfernen</Button>}
        </Stack></Paper>)}
        {!disabled&&<Button variant="light" h={48} onClick={()=>update({...line,materials:[...line.materials,{name:'',quantity:1,unit:'Stück'}]})}>+ Material</Button>}
      </>}
      
      {!disabled&&<Button variant="subtle" color="red" h={48} onClick={remove}>Position entfernen</Button>}
    </>}
  </Stack></Paper>;
}
export function RapportBookPage(){
  const network=useNetwork();const [offline,setOffline]=useState(!navigator.onLine);const [localDrafts,setLocalDrafts]=useState<number[]>([]);
  const [params]=useSearchParams();const requestedReport=Number(params.get('report'));const requestedDate=params.get('date');
  const [date,setDate]=useState(()=>requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)?requestedDate:today());const [tab,setTab]=useState('day');const [reports,setReports]=useState<RapportReport[]>([]);const [dispatcher,setDispatcher]=useState(false);const [actor,setActor]=useState(0);const [catalog,setCatalog]=useState<Catalog>(emptyCatalog);
  const [selected,setSelected]=useState<number[]>([]);const [current,setCurrent]=useState<RapportReport|null>(null);const [dirty,setDirty]=useState(false);const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [search,setSearch]=useState('');const [filter,setFilter]=useState('pending');const [newName,setNewName]=useState('');const [kind,setKind]=useState('machine');
  const from=tab==='week'?weekStart(date):tab==='archive'?date.slice(0,7)+'-01':date;const to=tab==='week'?shiftDay(from,6):tab==='archive'?new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).toISOString().slice(0,10):date;
  const refresh=async()=>{const r=await api.rapportList(from,to,tab==='review');setReports(r.reports);setDispatcher(r.dispatcher);};
  useEffect(()=>{let active=true;setError('');setBusy(true);setCurrent(null);setSelected([]);setDirty(false);setReason('');setReports([]);
    async function load(){
      const me=await getSetting<CurrentUser|null>('lastUser',null);if(!me)throw Error('Anmeldung erforderlich');
      const key=from+'|'+to+'|'+tab;
      type Cached={ownerId:number;views:Record<string,{reports:RapportReport[];dispatcher:boolean;catalog:Catalog}>};
      let cache=await getSetting<Cached>('rapport-view-cache',{ownerId:me.id,views:{}});if(cache.ownerId!==me.id)cache={ownerId:me.id,views:{}};
      let data=cache.views[key];let online=false;
      if(network.online){try{const [r,cat,user]=await Promise.all([api.rapportList(from,to,tab==='review'),api.rapportCatalog(),api.me()]);if(user.id!==me.id)throw Error('Benutzerwechsel erkannt');data={...r,catalog:cat};const keys=Object.keys(cache.views);if(keys.length>=30)delete cache.views[keys[0]!];await setSetting('rapport-view-cache',{ownerId:me.id,views:{...cache.views,[key]:data}});online=true;}catch(e){if(!(e instanceof TypeError))throw e;}}
      if(!online&&tab==='review')throw Error('Prüfcenter ist nur online verfügbar.');
      if(!data)throw Error('Für diesen Zeitraum sind keine Offline-Rapporte verfügbar. Bitte zuerst online öffnen.');
      const drafts=await db.rapportDrafts.where('ownerId').equals(me.id).toArray();
      if(active){setActor(me.id);setReports(online?data.reports:data.reports.filter(r=>r.owner.id===me.id));setDispatcher(online&&data.dispatcher);setCatalog(data.catalog);setOffline(!online);setLocalDrafts(drafts.map(d=>d.report.id));}
    }
    void load().catch(e=>{if(active)setError(errorText(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
  },[from,to,tab,network.online]);
  useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const guard=()=>!dirty||window.confirm('Tagesrapport wechseln? Der lokale Entwurf bleibt erhalten.');
  const changeTab=(v:string)=>{if(guard())setTab(v);};
  const open=async(id:number)=>{if(!guard())return;setBusy(true);setError('');try{const draft=await db.rapportDrafts.get(actor+':'+id);if(draft){if(offline&&draft.report.owner.id!==actor)throw Error('Fremde Rapporte nur online bearbeiten');setCurrent(draft.report);setDirty(true);setReason(draft.reason);}else{const r=offline?reports.find(r=>r.id===id):await api.rapportDetail(id);if(!r)throw Error('Kein lokaler Rapport');setCurrent(r);setDirty(false);setReason('');}}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  const persistDraft=(r:RapportReport,why:string)=>{if(!actor)return;void db.rapportDrafts.put({key:actor+':'+r.id,ownerId:actor,report:r,reason:why,updatedAt:Date.now()}).then(()=>setLocalDrafts(old=>[...new Set([...old,r.id])])).catch(e=>setError('Lokaler Entwurf nicht gespeichert: '+errorText(e)));};
  const edit=(r:RapportReport)=>{setCurrent(r);setDirty(true);persistDraft(r,reason);};
  const save=async()=>{if(!current)return;setBusy(true);setError('');try{const next=await api.rapportSave(current.id,{revision:current.revision,lines:current.lines,material:current.material,reason});await db.rapportDrafts.delete(actor+':'+current.id);setLocalDrafts(old=>old.filter(i=>i!==current.id));setCurrent(next);setDirty(false);setReason('');setMessage('Rapport gespeichert.');await refresh();}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  const transition=async(action:string)=>{if(!current||dirty)return;setBusy(true);setError('');try{const next=await api.rapportTransition(current.id,{revision:current.revision,action,reason});setCurrent(next);setReason('');setMessage('Status aktualisiert.');await refresh();}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  const submitWeek=async()=>{setBusy(true);setError('');const failures:string[]=[];for(const id of selected){try{const r=await api.rapportDetail(id);await api.rapportTransition(id,{revision:r.revision,action:'submit'});}catch(e){failures.push('#'+id+': '+errorText(e));}}try{await refresh();}catch(e){failures.push(errorText(e));}setSelected([]);setError(failures.join('; '));setMessage(failures.length?'Teilweise eingereicht.':'Ausgewählte Rapporte eingereicht.');setBusy(false);};
  const [openedLink,setOpenedLink]=useState(false);
  useEffect(()=>{if(!busy&&actor&&!openedLink&&Number.isSafeInteger(requestedReport)&&requestedReport>0){setOpenedLink(true);void open(requestedReport);}},[busy,actor,openedLink,requestedReport]);
  const canEdit=!!current&&current.state!=='closed'&&(dispatcher||(current.owner.id===actor&&['draft','returned'].includes(current.state)));
  const addLine=(type:'work'|'pause')=>{if(!current)return;const start=[...current.lines].filter(l=>l.end&&inputTime(l.end).slice(0,10)===current.date).sort((a,b)=>b.end.localeCompare(a.end))[0]?.end??fromInputTime(current.date+'T07:00');const end=new Date(Date.parse(start)+15*60000).toISOString();edit({...current,lines:[...current.lines,{id:crypto.randomUUID(),start,end,kind:type,activity:'',order:'',machines:[],materials:[]}]});};
  const visible=reports.filter(r=>(tab!=='archive'||r.state==='closed')&&r.owner.name.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de'))&&(tab!=='review'||filter==='all'||(filter==='pending'?['submitted','review'].includes(r.state):r.state===filter)));
  return <Stack maw={950} mx="auto" gap="md">
    <Group justify="space-between"><Title order={1} size="h2">Rapporte</Title><Group gap="xs"><Button component={Link} to="/settings?tab=advanced" variant="default" h={48}>Einrichtung</Button><Button component={Link} to="/green" variant="default" h={48}>Grünpflege</Button><Button component={Link} to="/rapport" variant="light" h={48}>+ Erfassen</Button></Group></Group>
    <SimpleGrid cols={2} spacing="xs">{[['day','Mein Tag'],['week','Meine Woche'],['archive','Archiv'],...(dispatcher?[['review','Prüfcenter'],['catalog','Stammdaten']]:[])].map(([key,label])=><Button key={key} h={48} variant={tab===key?'filled':'default'} onClick={()=>changeTab(key!)} disabled={busy}>{label}</Button>)}</SimpleGrid>
    {offline&&<Alert color="orange">Offline: bereits geladene eigene Rapporte können lokal korrigiert werden. Übernahme nach Redmine, Einreichung und Prüfung nur online.</Alert>}
    {error&&<Alert color="red" title="Rapportwesen">{error}</Alert>}{message&&<Alert color="green" onClose={()=>setMessage('')} withCloseButton>{message}</Alert>}
    {tab==='catalog'?<Paper withBorder p="md"><Stack><Title order={2} size="h4">Maschinen und Materialien</Title><Select data={[{value:'machine',label:'Maschine'},{value:'material',label:'Material'}]} value={kind} onChange={v=>setKind(v??'machine')}/><TextInput label="Bezeichnung" value={newName} onChange={e=>setNewName(e.currentTarget.value)}/><Button h={52} disabled={!newName.trim()||busy} onClick={()=>{setBusy(true);void api.rapportAddCatalog(kind,newName).then(async()=>{setNewName('');setCatalog(await api.rapportCatalog());}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}>Stammdatum anlegen</Button>{(kind==='machine'?catalog.machines:catalog.materials).map(x=><Text key={x.id}>{x.name}</Text>)}<Text c="dimmed" size="sm">Umbenennen und Ausmustern über Redmine.</Text></Stack></Paper>:<>
      <Group grow><Button variant="default" h={48} disabled={busy} onClick={()=>{if(guard())setDate(shiftDay(date,tab==='week'?-7:-1));}}>←</Button><TextInput type="date" aria-label="Arbeitstag" value={date} onChange={e=>{if(e.currentTarget.value&&guard())setDate(e.currentTarget.value);}}/><Button variant="default" h={48} disabled={busy} onClick={()=>{if(guard())setDate(shiftDay(date,tab==='week'?7:1));}}>→</Button></Group>
      {tab==='review'&&<><TextInput label="Mitarbeiter suchen" value={search} onChange={e=>setSearch(e.currentTarget.value)}/><Select label="Status" value={filter} onChange={v=>setFilter(v??'pending')} data={[{value:'pending',label:'Zu prüfen'},{value:'all',label:'Alle'},...Object.entries(stateLabels).map(([value,label])=>({value,label}))]}/></>}
      {tab==='week'&&<Paper p="md" withBorder><Text>Wochensumme</Text><Title order={2}>{formatDuration(effectiveReports(reports).reduce((n,r)=>n+sumWork(r),0))} / 39:00 h</Title><Button mt="sm" h={52} fullWidth disabled={!selected.length||busy||offline||selected.some(id=>localDrafts.includes(id))} onClick={()=>void submitWeek()}>Ausgewählte Tage einreichen ({selected.length})</Button></Paper>}
      {!offline&&visible.length>0&&<Button component="a" href={'/api/rapport/pdf?ids='+visible.slice(0,100).map(r=>r.id).join(',')} target="_blank" rel="noopener" h={48} variant="outline">{visible.length>100?'Erste 100 Rapporte':'Angezeigte Rapporte'} als PDF</Button>}
      {busy&&<Text role="status">Bitte warten …</Text>}
      {!busy&&!visible.length&&<Alert>Keine Rapporte im gewählten Zeitraum. Über „Erfassen“ kannst du Leistungen hinzufügen.</Alert>}
      {visible.map(r=><Paper withBorder p="sm" key={r.id}><Group wrap="nowrap">
        {tab==='week'&&['draft','returned'].includes(r.state)&&<Checkbox size="lg" aria-label={r.date+' auswählen'} checked={selected.includes(r.id)} onChange={e=>setSelected(old=>e.currentTarget.checked?[...old,r.id]:old.filter(i=>i!==r.id))}/>}
        <Stack gap={2} style={{flex:1}}><Text fw={800}>{r.date} · {r.owner.name}{r.correction?' · Korrektur zu #'+r.correction.reportId:''}</Text><Text size="sm">{formatDuration(sumWork(r))} h · {stateLabels[r.state]}{localDrafts.includes(r.id)?' · Lokaler Entwurf':''}</Text></Stack><Button h={48} variant="light" disabled={busy} onClick={()=>void open(r.id)}>Öffnen</Button>
      </Group></Paper>)}
      {current&&<Stack gap="sm"><datalist id="rapport-machines">{catalog.machines.map(m=><option key={m.id} value={m.name}/>)}</datalist><datalist id="rapport-materials">{catalog.materials.map(m=><option key={m.id} value={m.name}/>)}</datalist><Group justify="space-between"><Title order={2} size="h3">{current.owner.name} · {current.date}</Title><Badge>{stateLabels[current.state]}</Badge></Group>
        <Paper withBorder p="md"><SimpleGrid cols={2}><Stack gap={0}><Text c="dimmed" size="sm">Soll</Text><Title order={2}>{formatDuration(fullDayMinutes(current.date))} h</Title></Stack><Stack gap={0}><Text c="dimmed" size="sm">Ist</Text><Title order={2}>{formatDuration(sumWork(current))} h</Title></Stack></SimpleGrid><Progress mt="sm" value={Math.min(100,sumWork(current)/Math.max(1,fullDayMinutes(current.date))*100)}/><Text mt="xs" size="sm">Zeitlücken: {formatDuration([...current.lines].sort((a,b)=>a.start.localeCompare(b.start)).reduce((n,l,i,a)=>n+(i>0?Math.max(0,Math.round((Date.parse(l.start)-Date.parse(a[i-1]!.end))/60000)||0):0),0))} h (nicht automatisch als Pause gewertet)</Text><Text mt="xs" size="sm">Explizite Pausen: {formatDuration(current.lines.filter(l=>l.kind==='pause').reduce((n,l)=>n+Math.max(0,lineMinutes(l)||0),0))} h</Text></Paper>
        {current.correction&&<Alert color="blue" title={'Korrektur zu Rapport #'+current.correction.reportId}>{current.correction.reason} · {current.correction.createdBy.name}</Alert>}{current.state==='closed'&&<Alert color="green">Abgeschlossen und schreibgeschützt.</Alert>}{current.state==='closed'&&dispatcher&&<Stack gap="xs"><Textarea label="Begründung für separaten Korrekturbeleg" value={reason} onChange={e=>setReason(e.currentTarget.value)}/><Button h={48} variant="outline" disabled={busy||offline||!reason.trim()} onClick={()=>{setBusy(true);void api.rapportCorrection(current.id,reason).then(async r=>{setCurrent(r);setDirty(false);setReason('');setMessage('Korrekturbeleg angelegt. Original bleibt unverändert.');await refresh();}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}>Korrekturbeleg anlegen</Button></Stack>}{current.state==='closed'&&dispatcher&&<Button h={48} variant="light" disabled={busy||offline} onClick={()=>{setBusy(true);void api.rapportArchive(current.id).then(r=>setMessage('Archivbeleg #'+r.id+' gesichert und geprüft.')).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}>PDF archivieren / prüfen</Button>}{current.state==='returned'&&<Alert color="orange" title="Zur Korrektur zurückgegeben">{current.returnNote??'Bitte Rückfrage beim Disponenten.'}</Alert>}
        {[...current.lines].sort((a,b)=>a.start.localeCompare(b.start)).map(l=><LineEditor key={l.id} line={l} disabled={!canEdit||busy} catalog={catalog} update={line=>edit({...current,lines:current.lines.map(x=>x.id===line.id?line:x)})} remove={()=>edit({...current,lines:current.lines.filter(x=>x.id!==l.id)})}/>)}
        {canEdit&&<SimpleGrid cols={2}><Button h={52} variant="light" disabled={busy} onClick={()=>addLine('work')}>+ Leistung</Button><Button h={52} variant="light" disabled={busy} onClick={()=>addLine('pause')}>+ Pause</Button></SimpleGrid>}
        <Textarea label="Materialverbrauch / Bemerkungen" value={current.material} disabled={!canEdit||busy} onChange={e=>edit({...current,material:e.currentTarget.value})}/>
        {dispatcher&&current.state!=='closed'&&<Textarea label="Korrektur- / Rückgabebegründung" value={reason} onChange={e=>{setReason(e.currentTarget.value);if(dirty)persistDraft(current,e.currentTarget.value);}}/>}
        {dirty&&<><Button h={56} disabled={offline} loading={busy} onClick={()=>void save()}>Änderungen nach Redmine übertragen</Button><Button h={48} variant="subtle" color="red" disabled={busy} onClick={()=>{if(window.confirm('Lokalen Entwurf verwerfen?')){void db.rapportDrafts.delete(actor+':'+current.id).then(()=>{setLocalDrafts(old=>old.filter(i=>i!==current.id));setCurrent(null);setDirty(false);});}}}>Lokalen Entwurf verwerfen</Button></>}
        {current.owner.id===actor&&['draft','returned'].includes(current.state)&&<Button h={56} disabled={dirty||busy||offline} onClick={()=>void transition('submit')}>Tagesrapport einreichen</Button>}
        {dispatcher&&['submitted','review'].includes(current.state)&&<><Button h={52} variant="light" disabled={current.state==='review'||dirty||busy} onClick={()=>void transition('review')}>Prüfung übernehmen</Button><Button h={56} disabled={dirty||busy} onClick={()=>void transition('close')}>Geprüft abschließen</Button><Button h={52} color="orange" variant="light" disabled={dirty||busy||!reason.trim()} onClick={()=>void transition('return')}>Zur Korrektur zurückgeben</Button></>}
        {current.submitted&&<Text size="sm">Eingereicht durch {current.submitted.by.name} · {stamp(current.submitted.at)}</Text>}{current.reviewed&&<Text size="sm">Geprüft durch {current.reviewed.by.name} · {stamp(current.reviewed.at)}</Text>}
        {!!current.history?.length&&<Paper withBorder p="sm"><details><summary>Änderungshistorie ({current.history.length})</summary><Stack mt="sm" gap="xs">{current.history.map((j,i)=><Paper key={i} withBorder p="xs"><Text fw={650} size="sm">{j.by} · {stamp(j.at)}</Text><Text size="sm" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{j.note}</Text></Paper>)}</Stack></details></Paper>}
        <Button component="a" href={'/api/rapport/reports/'+current.id+'/pdf'} target="_blank" rel="noopener" variant="outline" h={52} disabled={dirty||offline}>Rapport als PDF</Button>
      </Stack>}
    </>}
  </Stack>;
}
