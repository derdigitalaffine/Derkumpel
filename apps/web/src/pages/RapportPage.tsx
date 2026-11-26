import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Paper, ScrollArea, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { getSetting, setSetting } from '../db';
import { formatDuration, fullDayMinutes, makeRapportEntries, localDateInput, parseLocalStart, rankRapportPeople, type RapportPerson, type RapportDraftEntry } from '../rapport';

const increments = [[15, '+15 min'], [30, '+30 min'], [45, '+45 min'], [60, '+1 h']] as const;
const durationOptions = [{value:'0',label:'Bitte wählen'}, ...Array.from({length:96}, (_,i) => ({value:String((i+1)*15),label:formatDuration((i+1)*15)+' h'}))];
const defaultStart = () => { const now = new Date(); return formatDuration(now.getHours()*60 + Math.floor(now.getMinutes()/15)*15).padStart(5,'0'); };
type Preferences = { favorites: number[]; counts: Record<number, number> };
type Batch = { id: number; entries: RapportDraftEntry[] };

export function RapportPage() {
  const [people, setPeople] = useState<RapportPerson[]>([]);
  const [actor, setActor] = useState<RapportPerson | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [minutes, setMinutes] = useState(0);
  const [date, setDate] = useState(() => localDateInput(new Date()));
  const [useFullDay, setUseFullDay] = useState(false);
  const targetMinutes = fullDayMinutes(date);
  const [time, setTime] = useState(defaultStart);
  const [filter, setFilter] = useState('all');
  const [preferences, setPreferences] = useState<Preferences>({ favorites: [], counts: {} });
  const [preferenceWarning, setPreferenceWarning] = useState(false);
  const [activity, setActivity] = useState('');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [nextId, setNextId] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setPeople([]); setMissing([]); setActor(null);
    void Promise.all([api.rapportUsers(), api.me()]).then(async ([result, me]) => {
      const prefs = await getSetting<Preferences>('rapport-picker:' + me.id, { favorites: [], counts: {} }).catch(() => ({ favorites: [], counts: {} }));
      if (!active) return;
      setPeople(result.users); setMissing(result.missingGroups); setPreferences(prefs);
      setActor({ id: me.id, name: [me.firstname, me.lastname].filter(Boolean).join(' ') || me.login });
      setSelected(result.users.some(person => person.id === me.id) ? [me.id] : []);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof ApiError && err.status === 403
        ? 'Redmine erlaubt deinem Konto keinen Zugriff auf die Gruppenmitglieder.'
        : 'Mitarbeiterliste oder Anmeldung konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const startAt = parseLocalStart(date, time);
  const endAt = startAt && minutes > 0 ? new Date(new Date(startAt).getTime() + minutes * 60000) : null;
  const add = (amount: number) => { setUseFullDay(false); setMinutes(old => Math.min(1440, old + amount)); };
  const savePreferences = (next: Preferences) => {
    setPreferences(next);
    if (actor) void setSetting('rapport-picker:' + actor.id, next).catch(() => setPreferenceWarning(true));
  };
  const toggleFavorite = (id: number) => savePreferences({ ...preferences, favorites: preferences.favorites.includes(id) ? preferences.favorites.filter(x => x !== id) : [...preferences.favorites, id] });
  const entries = batches.flatMap(batch => batch.entries);
  const totals = new Map<number, number>();
  for (const entry of entries) totals.set(entry.employee.id, (totals.get(entry.employee.id) ?? 0) + entry.minutes);
  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const selectedPeople = people.filter(person => selected.includes(person.id));
  const visible = rankRapportPeople(people.filter(person => person.name.toLocaleLowerCase('de').includes(search.trim().toLocaleLowerCase('de')) && (filter === 'all' || (filter === 'favorites' ? preferences.favorites.includes(person.id) : filter === 'frequent' ? (preferences.counts[person.id] ?? 0) > 0 : filter === 'selected' ? selected.includes(person.id) : person.groups?.includes(filter)))), preferences.favorites, preferences.counts, actor?.id);
  const toggle = (id: number) => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const canAdd = !!actor && !loading && !error && !!startAt && minutes > 0 && selectedPeople.length > 0;
  const addBatch = () => {
    if (!actor || !canAdd || !startAt) return;
    const draft = makeRapportEntries(people, selected, actor, minutes, activity, new Date().toISOString(), startAt);
    if (!draft.length) return;
    setBatches(old => [...old, { id: nextId, entries: draft }]);
    const counts = { ...preferences.counts };
    for (const entry of draft) counts[entry.employee.id] = (counts[entry.employee.id] ?? 0) + 1;
    savePreferences({ ...preferences, counts });
    setNextId(id => id + 1); setMinutes(0); setUseFullDay(false); setActivity('');
  };
  return <Stack maw={900} mx="auto" gap="md">
    <Button component={Link} to="/" variant="subtle" h={48} style={{ alignSelf: 'flex-start' }}>← Meine Arbeit</Button>
    <Group justify="space-between" align="center"><Title order={1} size="h2">Arbeitszeit / Rapport</Title><Badge variant="light">Entwurf</Badge></Group>
    <Alert variant="light">Nur Vorschau. Keine Buchung. Rapportdaten gehen beim Verlassen verloren. Nur Favoriten und Auswahlhäufigkeiten bleiben auf diesem Gerät gespeichert.</Alert>
    <Paper withBorder p="md" className="surface-card">
      <Text size="sm" c="dimmed">Summe im Rapport-Entwurf</Text>
      <Title order={2} aria-live="polite">{formatDuration(total)} h</Title>
      <Text size="sm" c="dimmed">{totals.size} Personen · {entries.length} Einträge</Text>
      {actor && <Text mt="xs" fw={650}>Erfasst von: {actor.name}</Text>}
    </Paper>
    {loading ? <Text role="status">Mitarbeiter werden geladen …</Text> : error ? <Alert color="red" title="Mitarbeiterliste nicht verfügbar"><Stack><Text>{error}</Text><Button h={48} onClick={() => setAttempt(n => n + 1)}>Erneut laden</Button></Stack></Alert> : <>
      {missing.length > 0 && <Alert color="orange">In Redmine nicht gefunden: {missing.join(', ')}</Alert>}
      <Paper withBorder p="md" className="surface-card"><Stack gap="sm">
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
        <Button h={56} disabled={!canAdd} onClick={addBatch}>In Entwurf übernehmen ({selectedPeople.length})</Button>
      </Stack></Paper>
    </>}
    {batches.length > 0 && <Stack gap="sm">
      <Title order={2} size="h4">Rapport-Entwurf</Title>
      {batches.map(batch => <Paper key={batch.id} withBorder p="md" className="surface-card"><Stack gap="xs">
        <Group justify="space-between"><Text fw={800}>{formatDuration(batch.entries[0].minutes)} h je Person</Text><Badge variant="light">{batch.entries.length} Personen</Badge></Group>
        <Text size="sm" fw={650}>{new Date(batch.entries[0].startAt).toLocaleString('de-DE')} – {new Date(batch.entries[0].endAt).toLocaleString('de-DE')}</Text>
        {batch.entries.map(entry => <Text key={entry.employee.id} size="sm">{entry.employee.name} · {formatDuration(entry.minutes)} h</Text>)}
        {batch.entries[0].activity && <Text style={{ overflowWrap: 'anywhere' }}>Tätigkeit: {batch.entries[0].activity}</Text>}
        <Text size="xs" c="dimmed">Erfasst von {batch.entries[0].recordedBy.name} · {new Date(batch.entries[0].recordedAt).toLocaleString('de-DE')}</Text>
        <Button h={48} color="red" variant="subtle" onClick={() => setBatches(old => old.filter(item => item.id !== batch.id))}>Eintrag entfernen</Button>
      </Stack></Paper>)}
      <Paper withBorder p="md"><Stack gap="xs"><Text fw={800}>Summen je Mitarbeiter</Text>{people.filter(person => totals.has(person.id)).map(person => <Group key={person.id} justify="space-between"><Text>{person.name}</Text><Text fw={700}>{formatDuration(totals.get(person.id) ?? 0)} h</Text></Group>)}</Stack></Paper>
    </Stack>}
  </Stack>;
}
