import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Modal, Paper, ScrollArea, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { getSetting, setSetting, type RapportQueueRecord } from '../db';
import { useDexieLive } from '../live';
import { currentRapportQueue,queueCapture,replayRapportQueue,retryRapportQueue,discardRapportQueue,rescheduleRapportQueue } from '../rapportQueue';
import { fromInputTime,inputTime,today } from '../rapportBook';
import type { CurrentUser } from '../types';
import { formatDuration, fullDayMinutes, rankRapportPeople, type RapportPerson } from '../rapport';

const increments = [[15, '+15 min'], [30, '+30 min'], [45, '+45 min'], [60, '+1 h']] as const;
const durationOptions = [{value:'0',label:'Bitte wählen'}, ...Array.from({length:96}, (_,i) => ({value:String((i+1)*15),label:formatDuration((i+1)*15)+' h'}))];
const defaultStart=()=>{const t=inputTime(new Date().toISOString()).slice(11);return t.slice(0,3)+String(Math.floor(Number(t.slice(3))/15)*15).padStart(2,'0');};
type Preferences = { favorites: number[]; counts: Record<number, number> };


export function RapportPage() {
  const [people, setPeople] = useState<RapportPerson[]>([]);
  const [actor, setActor] = useState<RapportPerson | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [minutes, setMinutes] = useState(0);
  const [date, setDate] = useState(today);
  const [useFullDay, setUseFullDay] = useState(false);
  const targetMinutes = fullDayMinutes(date);
  const [time, setTime] = useState(defaultStart);
  const [filter, setFilter] = useState('all');
  const [preferences, setPreferences] = useState<Preferences>({ favorites: [], counts: {} });
  const [preferenceWarning, setPreferenceWarning] = useState(false);
  const [activity, setActivity] = useState('');
  const queue=useDexieLive(useCallback(currentRapportQueue,[]),[]);
  const [notice,setNotice]=useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saving,setSaving]=useState(false);
  const [captureError,setCaptureError]=useState('');
  const [editing,setEditing]=useState<RapportQueueRecord|null>(null);
  const [editStart,setEditStart]=useState(''),[editEnd,setEditEnd]=useState(''),[editActivity,setEditActivity]=useState('');
  const [editError,setEditError]=useState('');
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof api.rapportCaptureCheck>>['results']>([]);
  const editConflict=async(item:RapportQueueRecord)=>{setEditing(item);setEditStart(inputTime(item.body.line.start));setEditEnd(inputTime(item.body.line.end));setEditActivity(item.body.line.activity);setEditError('');setPreview([]);setSaving(true);try{const result=await api.rapportCaptureCheck(item.body);setPreview(result.results);}catch(e){setEditError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}};
  const saveConflict=async()=>{if(!editing)return;const start=fromInputTime(editStart,editing.body.line.start),end=fromInputTime(editEnd,editing.body.line.end);if(!start||!end||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>86400000){setEditError('Bitte gültigen Zeitraum bis maximal 24 Stunden wählen.');return;}setSaving(true);setEditError('');try{await rescheduleRapportQueue(editing.id,start,end,editStart.slice(0,10),editActivity);setEditing(null);}catch(e){setEditError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}};

  useEffect(() => {
    let active=true;setLoading(true);setError('');setPeople([]);setMissing([]);setActor(null);
    async function load(){
      let me:CurrentUser;let result:{users:RapportPerson[];missingGroups:string[]};
      if(navigator.onLine){
        try{
          [result,me]=await Promise.all([api.rapportUsers(),api.me()]);
          await setSetting('rapport-roster',{ownerId:me.id,result});
        }catch(e){if(navigator.onLine&&!(e instanceof TypeError))throw e;me=(await getSetting<CurrentUser|null>('lastUser',null))!;const cached=await getSetting<{ownerId:number;result:typeof result}|null>('rapport-roster',null);if(!me||cached?.ownerId!==me.id)throw Error('Keine Offline-Mitarbeiterliste.');result=cached.result;}
      }else{
        me=(await getSetting<CurrentUser|null>('lastUser',null))!;const cached=await getSetting<{ownerId:number;result:typeof result}|null>('rapport-roster',null);if(!me||cached?.ownerId!==me.id)throw Error('Keine Offline-Mitarbeiterliste.');result=cached.result;
      }
      const prefs=await getSetting<Preferences>('rapport-picker:'+me.id,{favorites:[],counts:{}}).catch(()=>({favorites:[],counts:{}}));
      if(!active)return;
      setPeople(result.users);setMissing(result.missingGroups);setPreferences(prefs);setActor({id:me.id,name:[me.firstname,me.lastname].filter(Boolean).join(' ')||me.login});setSelected(result.users.some(p=>p.id===me.id)?[me.id]:[]);
    }
    void load().catch(e=>{if(active)setError(e instanceof Error?e.message:'Mitarbeiterliste nicht verfügbar');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[attempt]);
  const startAt = fromInputTime(date+'T'+time)||null;
  const endAt = startAt && minutes > 0 ? new Date(new Date(startAt).getTime() + minutes * 60000) : null;
  const add = (amount: number) => { setUseFullDay(false); setMinutes(old => Math.min(1440, old + amount)); };
  const savePreferences = (next: Preferences) => {
    setPreferences(next);
    if (actor) void setSetting('rapport-picker:' + actor.id, next).catch(() => setPreferenceWarning(true));
  };
  const toggleFavorite = (id: number) => savePreferences({ ...preferences, favorites: preferences.favorites.includes(id) ? preferences.favorites.filter(x => x !== id) : [...preferences.favorites, id] });
  const selectedPeople = people.filter(person => selected.includes(person.id));
  const visible = rankRapportPeople(people.filter(person => person.name.toLocaleLowerCase('de').includes(search.trim().toLocaleLowerCase('de')) && (filter === 'all' || (filter === 'favorites' ? preferences.favorites.includes(person.id) : filter === 'frequent' ? (preferences.counts[person.id] ?? 0) > 0 : filter === 'selected' ? selected.includes(person.id) : person.groups?.includes(filter)))), preferences.favorites, preferences.counts, actor?.id);
  const toggle = (id: number) => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const canAdd = !!actor && !loading && !error && !!startAt && minutes > 0 && selectedPeople.length > 0;
  const addBatch=async()=>{
    if(!actor||!canAdd||!startAt||!endAt||saving)return;
    setSaving(true);setCaptureError('');setNotice('');
    const body={actorId:actor.id,date,employees:[...selected],line:{id:crypto.randomUUID(),start:startAt,end:endAt.toISOString(),kind:'work' as const,activity,order:'',machines:[],materials:[]}};
    try{await queueCapture(body);}catch(e){setCaptureError(e instanceof Error?e.message:'Lokale Speicherung fehlgeschlagen');setSaving(false);return;}
    const counts={...preferences.counts};for(const id of selected)counts[id]=(counts[id]??0)+1;savePreferences({...preferences,counts});setMinutes(0);setUseFullDay(false);setActivity('');
    try{await replayRapportQueue();setNotice(navigator.onLine?'Erfassung gespeichert. Übertragungsstatus unten prüfen.':'Offline erfasst. Übertragung bei Verbindung.');}catch(e){setNotice('Erfassung lokal gesichert. Übertragung steht aus.');}finally{setSaving(false);}
  };
  return <Stack maw={900} mx="auto" gap="md">
    <Group><Button component={Link} to="/" variant="subtle" h={48}>← Meine Arbeit</Button><Button component={Link} to="/rapport/book" h={48} variant="light">Tagesrapporte</Button><Button component={Link} to="/settings?tab=advanced" h={48} variant="default">Einrichtung</Button></Group>
    <Group justify="space-between" align="center"><Title order={1} size="h2">Arbeitszeit / Rapport</Title><Badge variant="light">Entwurf</Badge></Group>
    <Alert variant="light">Leistungen werden in den persönlichen Tagesrapporten in Redmine vorerfasst. Erst die Einreichung bestätigt den Tagesrapport.</Alert>
    <Paper withBorder p="md" className="surface-card"><Text fw={650}>Erfasst von: {actor?.name??'–'}</Text><Text c="dimmed" size="sm">{queue.length} lokale Vorgänge ausstehend</Text></Paper>{notice&&<Alert color="blue">{notice}</Alert>}
    {loading ? <Text role="status">Mitarbeiter werden geladen …</Text> : error ? <Alert color="red" title="Mitarbeiterliste nicht verfügbar"><Stack><Text>{error}</Text><Button h={48} onClick={() => setAttempt(n => n + 1)}>Erneut laden</Button></Stack></Alert> : <>
      {missing.length > 0 && <Alert color="orange">In Redmine nicht gefunden: {missing.join(', ')}</Alert>}
      <fieldset disabled={saving} style={{border:0,padding:0,margin:0,minWidth:0}}><Stack gap="md"><Paper withBorder p="md" className="surface-card"><Stack gap="sm">
        <Group justify="space-between"><Title order={2} size="h4">1. Für wen?</Title><Badge>{selectedPeople.length} ausgewählt</Badge></Group>
        <Text size="sm" c="dimmed">Wähle dich selbst und/oder die Kollegen aus, die dieselbe Arbeitszeit erhalten sollen.</Text>
        <TextInput label="Mitarbeiter suchen" value={search} onChange={e => setSearch(e.currentTarget.value)} placeholder="Name eingeben" size="lg" />
        <Select label="Filter" value={filter} onChange={v=>setFilter(v ?? 'all')} allowDeselect={false} size="lg" data={[{value:'all',label:'Alle Mitarbeiter'},{value:'favorites',label:'Favoriten'},{value:'frequent',label:'Häufig gewählt'},{value:'selected',label:'Ausgewählte'},{value:'Disponenten Bauhof',label:'Disponenten Bauhof'},{value:'Bauhofmitarbeiter',label:'Bauhofmitarbeiter'}]} />
        {preferenceWarning && <Text size="xs" c="orange">Auswahlpräferenzen konnten nicht lokal gespeichert werden.</Text>}
        <Text size="xs" c="dimmed">{visible.length} Treffer · Du, Favoriten und häufig gewählte Kollegen zuerst</Text>
        <ScrollArea.Autosize mah={320} offsetScrollbars><Stack gap={4}>
        {visible.map(person => <Group key={person.id} wrap="nowrap" gap="xs" style={{minHeight:56}} px={4}>
          <Checkbox size="lg" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} label={person.name + (person.id === actor?.id ? ' (Du)' : '')} styles={{ root: { flex: 1, minWidth: 0 }, body: { alignItems: 'center' }, labelWrapper: { flex: 1 }, label: { paddingBlock: 12, cursor: 'pointer', overflowWrap:'anywhere' } }} />
          <ActionIcon size={48} variant={preferences.favorites.includes(person.id)?'light':'subtle'} color={preferences.favorites.includes(person.id)?'yellow':'gray'} aria-label={person.name + (preferences.favorites.includes(person.id)?' aus Favoriten entfernen':' zu Favoriten hinzufügen')} aria-pressed={preferences.favorites.includes(person.id)} onClick={()=>toggleFavorite(person.id)}>{preferences.favorites.includes(person.id)?'★':'☆'}</ActionIcon>
        </Group>)}
        </Stack></ScrollArea.Autosize>
        <Button h={48} variant="default" onClick={() => setSelected([])}>Auswahl leeren</Button>
        {!people.length ? <Text c="dimmed">Keine Mitarbeiter gefunden.</Text> : !visible.length && <Text c="dimmed">Keine passenden Mitarbeiter.</Text>}
        {selectedPeople.length > 0 && <Text size="sm" c="dimmed">Ausgewählt: {selectedPeople.map(person => person.name).join(', ')}</Text>}
      </Stack></Paper>
      <Paper withBorder p="md" className="surface-card"><Stack gap="sm">
        <Title order={2} size="h4">2. Arbeitszeit je Person</Title>
        <SimpleGrid cols={{base:1,xs:2}} spacing="xs">
          <TextInput type="date" label="Arbeitstag" size="lg" value={date} onChange={e=>{ const next = e.currentTarget.value; setDate(next); if (useFullDay) setMinutes(fullDayMinutes(next)); }} />
          <TextInput type="time" label="Beginn" size="lg" value={time} onChange={e=>setTime(e.currentTarget.value)} error={!startAt?'Bitte gültigen Beginn wählen.':undefined} />
        </SimpleGrid>
        <Select label="Dauer (15-Minuten-Blöcke)" size="lg" searchable data={durationOptions} value={String(minutes)} onChange={v=>{setUseFullDay(false);setMinutes(Number(v ?? 0));}} allowDeselect={false} />
        <Text fw={700} aria-live="polite">Ende: {endAt ? endAt.toLocaleString('de-DE', {dateStyle:'short',timeStyle:'short'}) : '–'}</Text>
        <SimpleGrid cols={2} spacing="xs">{increments.map(([amount, label]) => <Button key={amount} h={52} variant="light" disabled={minutes % 15 !== 0 || minutes + amount > 1440} onClick={() => add(amount)}>{label}</Button>)}</SimpleGrid>
        <Button h={56} disabled={!targetMinutes} onClick={() => {setUseFullDay(true);setMinutes(targetMinutes);}}> {targetMinutes ? `Kompletter Arbeitstag · ${formatDuration(targetMinutes)} h` : "Kein regulärer Solltag"} </Button>
        <Button h={48} variant="subtle" color="gray" onClick={() => {setMinutes(0);setUseFullDay(false);}}>Zeit zurücksetzen</Button>
        <Textarea label="Tätigkeit (optional)" placeholder="z. B. Grünpflege am Friedhof" value={activity} onChange={e => setActivity(e.currentTarget.value)} autosize minRows={2} maxRows={5} maxLength={1000} />
        <Text size="sm" fw={650}>Gesamt für die Auswahl: {formatDuration((minutes ?? 0) * selectedPeople.length)} h</Text>
        </Stack></Paper></Stack></fieldset>
      {captureError&&<Alert color="red">{captureError}</Alert>}
        <Button h={56} loading={saving} disabled={!canAdd} onClick={()=>void addBatch()}>In Tagesrapporte übernehmen ({selectedPeople.length})</Button>
    </>}
    {queue.length>0&&<Stack gap="sm"><Title order={2} size="h4">Lokale Übertragungswarteschlange</Title>{queue.map(item=><Paper withBorder p="md" key={item.id}><Stack gap="xs">
      <Group justify="space-between"><Text fw={800}>{item.body.date} · {formatDuration(Math.round((Date.parse(item.body.line.end)-Date.parse(item.body.line.start))/60000))} h</Text><Badge color={item.state==='conflict'?'red':'orange'}>{item.state==='conflict'?'Konflikt':'Ausstehend'}</Badge></Group>
      <Text>{item.body.line.activity||'Ohne Tätigkeit'} · {item.body.employees.map(id=>people.find(p=>p.id===id)?.name??'#'+id).join(', ')}</Text>
      {item.message&&<Text size="sm" c="red">{item.message}</Text>}
      {item.state==='conflict'&&<Button h={48} variant="filled" disabled={saving||!navigator.onLine} onClick={()=>void editConflict(item)}>Konflikt lösen / Zeit korrigieren</Button>}
      <Button h={48} variant="light" disabled={saving||!navigator.onLine} onClick={()=>{setSaving(true);void retryRapportQueue(item.id).catch(e=>setCaptureError(String(e))).finally(()=>setSaving(false));}}>Erneut übertragen</Button>
      <Button h={48} color="red" variant="subtle" disabled={saving} onClick={()=>{if(window.confirm('Nur noch nicht bestätigte lokale Übertragung verwerfen? Bereits übertragene Leistungen bleiben erhalten.'))void discardRapportQueue(item.id);}}>Lokalen Vorgang verwerfen</Button>
    </Stack></Paper>)}</Stack>}
    <Modal opened={!!editing} onClose={()=>{if(!saving)setEditing(null);}} title="Rapportkonflikt lösen" fullScreen={false}><Stack>
      <Alert variant="light">Die vorhandenen Arbeitszeiten bleiben unverändert. Du kannst diese noch nicht gespeicherte Erfassung verschieben oder den bestehenden Tagesrapport öffnen.</Alert>
      {preview.map(p=><Paper withBorder p="sm" key={p.employee}><Stack gap="xs"><Text fw={700}>{people.find(x=>x.id===p.employee)?.name??'#'+p.employee}</Text><Text size="sm">{p.stored?'Bereits gespeichert – bitte erneut übertragen.':!p.editable?'Rapport gesperrt':p.overlap?'Zeitüberschneidung':'Keine Überschneidung'}</Text>{p.overlaps?.map((l,i)=><Text size="sm" key={i}>{inputTime(l.start).replace('T',' ')} – {inputTime(l.end).replace('T',' ')} · {l.activity||'Ohne Tätigkeit'}</Text>)}{p.reportId&&<Button component={Link} to={'/rapport/book?date='+editing?.body.date+'&report='+p.reportId} variant="light" h={48}>Tagesrapport #{p.reportId} öffnen</Button>}</Stack></Paper>)}
      <TextInput type="datetime-local" label="Neuer Beginn" value={editStart} onChange={e=>setEditStart(e.currentTarget.value)} disabled={saving}/><TextInput type="datetime-local" label="Neues Ende" value={editEnd} onChange={e=>setEditEnd(e.currentTarget.value)} disabled={saving}/><Textarea label="Tätigkeit" value={editActivity} onChange={e=>setEditActivity(e.currentTarget.value)} disabled={saving}/>{editError&&<Alert color="red">{editError}</Alert>}
      <Button h={52} loading={saving} disabled={!preview.length||preview.some(p=>p.stored||!p.editable)} onClick={()=>void saveConflict()}>Korrigierten Vorgang übertragen</Button>
      <Button h={48} variant="default" disabled={saving} onClick={()=>setEditing(null)}>Abbrechen</Button>
    </Stack></Modal>
  </Stack>;
}
