import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { formatDuration, parseDuration, fullDayMinutes } from '../rapport';

const increments = [[1, '+1 min'], [15, '+15 min'], [30, '+30 min'], [60, '+1 h']] as const;
type Person = { id: number; name: string };

export function RapportPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setPeople([]); setMissing([]);
    void api.rapportUsers().then(result => {
      if (active) { setPeople(result.users); setMissing(result.missingGroups); }
    }).catch((err: unknown) => {
      if (active) setError(err instanceof ApiError && err.status === 403
        ? 'Redmine erlaubt deinem Konto keinen Zugriff auf die Gruppenmitglieder.'
        : 'Die Mitarbeiterliste konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const setDuration = (id: number, value: string) => setValues(old => ({ ...old, [id]: value }));
  const add = (id: number, amount: number) => setValues(old => {
    const minutes = parseDuration(old[id] ?? '0:00');
    return minutes === null || minutes + amount > 1440 ? old : { ...old, [id]: formatDuration(minutes + amount) };
  });
  const total = people.reduce((sum, person) => sum + (parseDuration(values[person.id] ?? '0:00') ?? 0), 0);
  const visible = people.filter(person => person.name.toLocaleLowerCase('de').includes(search.trim().toLocaleLowerCase('de')));
  return <Stack maw={900} mx="auto" gap="md">
    <Button component={Link} to="/" variant="subtle" h={48} style={{ alignSelf: 'flex-start' }}>← Meine Arbeit</Button>
    <Group justify="space-between" align="center"><Title order={1} size="h2">Arbeitszeit / Rapport</Title><Badge variant="light">Entwurf</Badge></Group>
    <Alert variant="light">Nur Vorschau. Es wird nichts gespeichert oder gebucht. Beim Verlassen gehen die Eingaben verloren.</Alert>
    <Paper withBorder p="md" className="surface-card">
      <Text size="sm" c="dimmed">Summe aller gültigen Eingaben</Text>
      <Title order={2} aria-live="polite">{formatDuration(total)} h</Title>
      <Text size="sm" c="dimmed">{people.length} Personen · Solltag 7 h 48 min</Text>
    </Paper>
    {loading ? <Text role="status">Mitarbeiter werden geladen …</Text> : error ? <Alert color="red" title="Mitarbeiterliste nicht verfügbar"><Stack><Text>{error}</Text><Button h={48} onClick={() => setAttempt(n => n + 1)}>Erneut laden</Button></Stack></Alert> : <>
      {missing.length > 0 && <Alert color="orange">In Redmine nicht gefunden: {missing.join(', ')}</Alert>}
      <TextInput label="Mitarbeiter suchen" value={search} onChange={e => setSearch(e.currentTarget.value)} placeholder="Name eingeben" size="lg" />
      {visible.map(person => {
        const value = values[person.id] ?? '0:00';
        const minutes = parseDuration(value);
        return <Paper key={person.id} withBorder p="md" className="surface-card">
          <Stack gap="sm">
            <Text fw={800} size="lg">{person.name}</Text>
            <TextInput label="Arbeitszeit (Std:Min oder Dezimalstunden)" aria-label={`Arbeitszeit für ${person.name}`} size="lg" value={value} onChange={e => setDuration(person.id, e.currentTarget.value)} onBlur={() => { if (minutes !== null) setDuration(person.id, formatDuration(minutes)); }} error={minutes === null ? 'Bitte eine Dauer von 0 bis 24 Stunden eingeben.' : undefined} />
            <SimpleGrid cols={2} spacing="xs">
              {increments.map(([amount, label]) => <Button key={amount} h={52} variant="light" disabled={minutes === null || minutes + amount > 1440} onClick={() => add(person.id, amount)}>{label}</Button>)}
            </SimpleGrid>
            <Button h={56} onClick={() => setDuration(person.id, formatDuration(fullDayMinutes))}>Kompletter Arbeitstag · 7:48 h</Button>
            <Button h={48} variant="subtle" color="gray" onClick={() => setDuration(person.id, '0:00')}>Zurücksetzen</Button>
          </Stack>
        </Paper>;
      })}
      {!people.length ? <Text c="dimmed">Keine Mitarbeiter gefunden.</Text> : !visible.length && <Text c="dimmed">Keine passenden Mitarbeiter.</Text>}
    </>}
  </Stack>;
}
