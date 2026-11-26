import { Alert, Badge, Button, Checkbox, Group, Paper, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { formatDuration, parseDuration, fullDayMinutes, makeRapportEntries, type RapportPerson, type RapportDraftEntry } from '../rapport';

const increments = [[1, '+1 min'], [15, '+15 min'], [30, '+30 min'], [60, '+1 h']] as const;
type Batch = { id: number; entries: RapportDraftEntry[] };

export function RapportPage() {
  const [people, setPeople] = useState<RapportPerson[]>([]);
  const [actor, setActor] = useState<RapportPerson | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [value, setValue] = useState('0:00');
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
    void Promise.all([api.rapportUsers(), api.me()]).then(([result, me]) => {
      if (!active) return;
      setPeople(result.users); setMissing(result.missingGroups);
      setActor({ id: me.id, name: [me.firstname, me.lastname].filter(Boolean).join(' ') || me.login });
      setSelected(result.users.some(person => person.id === me.id) ? [me.id] : []);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof ApiError && err.status === 403
        ? 'Redmine erlaubt deinem Konto keinen Zugriff auf die Gruppenmitglieder.'
        : 'Mitarbeiterliste oder Anmeldung konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const minutes = parseDuration(value);
  const add = (amount: number) => setValue(old => {
    const parsed = parseDuration(old);
    return parsed === null || parsed + amount > 1440 ? old : formatDuration(parsed + amount);
  });
  const entries = batches.flatMap(batch => batch.entries);
  const totals = new Map<number, number>();
  for (const entry of entries) totals.set(entry.employee.id, (totals.get(entry.employee.id) ?? 0) + entry.minutes);
  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const selectedPeople = people.filter(person => selected.includes(person.id));
  const visible = people.filter(person => person.name.toLocaleLowerCase('de').includes(search.trim().toLocaleLowerCase('de')));
  const toggle = (id: number) => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const canAdd = !!actor && !loading && !error && minutes !== null && minutes > 0 && selectedPeople.length > 0;
  const addBatch = () => {
    if (!actor || !canAdd || minutes === null) return;
    const draft = makeRapportEntries(people, selected, actor, minutes, activity, new Date().toISOString());
    if (!draft.length) return;
    setBatches(old => [...old, { id: nextId, entries: draft }]);
    setNextId(id => id + 1); setValue('0:00'); setActivity('');
  };
  return <Stack maw={900} mx="auto" gap="md">
    <Button component={Link} to="/" variant="subtle" h={48} style={{ alignSelf: 'flex-start' }}>← Meine Arbeit</Button>
    <Group justify="space-between" align="center"><Title order={1} size="h2">Arbeitszeit / Rapport</Title><Badge variant="light">Entwurf</Badge></Group>
    <Alert variant="light">Nur Vorschau. Keine Buchung, keine dauerhafte Speicherung. Beim Verlassen gehen die Eingaben verloren.</Alert>
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
        <Group grow><Button h={48} variant="light" onClick={() => setSelected(old => [...new Set([...old, ...visible.map(person => person.id)])])}>Alle sichtbaren</Button><Button h={48} variant="default" onClick={() => setSelected([])}>Auswahl leeren</Button></Group>
        {visible.map(person => <Paper key={person.id} withBorder p="xs" style={{ minHeight: 52, display: 'flex', alignItems: 'center' }}>
          <Checkbox size="lg" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} label={person.name + (person.id === actor?.id ? ' (Du)' : '')} styles={{ root: { width: '100%' }, body: { alignItems: 'center' }, labelWrapper: { flex: 1 }, label: { paddingBlock: 8, cursor: 'pointer' } }} />
        </Paper>)}
        {!people.length ? <Text c="dimmed">Keine Mitarbeiter gefunden.</Text> : !visible.length && <Text c="dimmed">Keine passenden Mitarbeiter.</Text>}
        {selectedPeople.length > 0 && <Text size="sm" c="dimmed">Ausgewählt: {selectedPeople.map(person => person.name).join(', ')}</Text>}
      </Stack></Paper>
      <Paper withBorder p="md" className="surface-card"><Stack gap="sm">
        <Title order={2} size="h4">2. Arbeitszeit je Person</Title>
        <TextInput label="Arbeitszeit (Std:Min oder Dezimalstunden)" size="lg" value={value} onChange={e => setValue(e.currentTarget.value)} onBlur={() => { if (minutes !== null) setValue(formatDuration(minutes)); }} error={minutes === null ? 'Bitte eine Dauer von 0 bis 24 Stunden eingeben.' : undefined} />
        <SimpleGrid cols={2} spacing="xs">{increments.map(([amount, label]) => <Button key={amount} h={52} variant="light" disabled={minutes === null || minutes + amount > 1440} onClick={() => add(amount)}>{label}</Button>)}</SimpleGrid>
        <Button h={56} onClick={() => setValue(formatDuration(fullDayMinutes))}>Kompletter Arbeitstag · 7:48 h</Button>
        <Button h={48} variant="subtle" color="gray" onClick={() => setValue('0:00')}>Zeit zurücksetzen</Button>
        <Textarea label="Tätigkeit (optional)" placeholder="z. B. Grünpflege am Friedhof" value={activity} onChange={e => setActivity(e.currentTarget.value)} autosize minRows={2} maxRows={5} maxLength={1000} />
        <Text size="sm" fw={650}>Gesamt für die Auswahl: {formatDuration((minutes ?? 0) * selectedPeople.length)} h</Text>
        <Button h={56} disabled={!canAdd} onClick={addBatch}>In Entwurf übernehmen ({selectedPeople.length})</Button>
      </Stack></Paper>
    </>}
    {batches.length > 0 && <Stack gap="sm">
      <Title order={2} size="h4">Rapport-Entwurf</Title>
      {batches.map(batch => <Paper key={batch.id} withBorder p="md" className="surface-card"><Stack gap="xs">
        <Group justify="space-between"><Text fw={800}>{formatDuration(batch.entries[0].minutes)} h je Person</Text><Badge variant="light">{batch.entries.length} Personen</Badge></Group>
        {batch.entries.map(entry => <Text key={entry.employee.id} size="sm">{entry.employee.name} · {formatDuration(entry.minutes)} h</Text>)}
        {batch.entries[0].activity && <Text style={{ overflowWrap: 'anywhere' }}>Tätigkeit: {batch.entries[0].activity}</Text>}
        <Text size="xs" c="dimmed">Erfasst von {batch.entries[0].recordedBy.name} · {new Date(batch.entries[0].recordedAt).toLocaleString('de-DE')}</Text>
        <Button h={48} color="red" variant="subtle" onClick={() => setBatches(old => old.filter(item => item.id !== batch.id))}>Eintrag entfernen</Button>
      </Stack></Paper>)}
      <Paper withBorder p="md"><Stack gap="xs"><Text fw={800}>Summen je Mitarbeiter</Text>{people.filter(person => totals.has(person.id)).map(person => <Group key={person.id} justify="space-between"><Text>{person.name}</Text><Text fw={700}>{formatDuration(totals.get(person.id) ?? 0)} h</Text></Group>)}</Stack></Paper>
    </Stack>}
  </Stack>;
}
