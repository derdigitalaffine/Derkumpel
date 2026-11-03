import { ActionIcon, Box, Center, Group, Loader, Menu, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { IssueCard } from '../components/IssueCard';
import { issueAddress } from '../issueUtils';

type SortKey = 'priority' | 'due' | 'updated' | 'subject';

export function WorkPage() {
  const query = useCallback(() => db.issues.where('active').equals(1).toArray(), []);
  const records = useDexieLive(query, []);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('priority');
  const [excludedTrackers, setExcludedTrackers] = useState<number[]>([]);
  useEffect(() => { void Promise.all([getSetting<SortKey>('workSort', 'priority'), getSetting<number[]>('excludedTrackers', [])]).then(([s, e]) => { setSort(s); setExcludedTrackers(e); }); }, []);

  const issues = useMemo(() => records.map((r) => r.data).filter((i) => !excludedTrackers.includes(i.tracker.id)).filter((i) => {
    const needle = search.trim().toLocaleLowerCase('de-DE');
    if (!needle) return true;
    return [String(i.id), i.subject, i.description ?? '', issueAddress(i) ?? '', i.assigned_to?.name ?? '', i.tracker.name].some((v) => v.toLocaleLowerCase('de-DE').includes(needle));
  }).sort((a, b) => {
    if (sort === 'due') return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    if (sort === 'updated') return b.updated_on.localeCompare(a.updated_on);
    if (sort === 'subject') return a.subject.localeCompare(b.subject, 'de');
    return a.priority.id - b.priority.id || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  }), [records, search, sort, excludedTrackers]);

  return <Stack gap="md" maw={900} mx="auto">
    <Box><Title order={1} size="h2">Meine Arbeit</Title><Text c="dimmed">Persönlich und über deine Gruppen zugewiesene offene Aufträge</Text></Box>
    <Paper withBorder radius="lg" p="sm" pos="sticky" top={72} style={{ zIndex: 10 }}>
      <Group align="end" wrap="nowrap">
        <TextInput value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder="Aufträge durchsuchen" aria-label="Aufträge durchsuchen" style={{ flex: 1 }} />
        <Menu position="bottom-end"><Menu.Target><ActionIcon variant="light" size={46} aria-label="Sortierung">↕</ActionIcon></Menu.Target><Menu.Dropdown>
          {[['priority','Priorität'],['due','Fälligkeit'],['updated','Zuletzt geändert'],['subject','Titel']].map(([value,label]) => <Menu.Item key={value} onClick={() => { setSort(value as SortKey); void setSetting('workSort', value); }}>{sort === value ? '✓ ' : ''}{label}</Menu.Item>)}
        </Menu.Dropdown></Menu>
      </Group>
    </Paper>
    {records.length === 0 ? <Center py="xl"><Stack align="center"><Loader /><Text c="dimmed">Aufträge werden geladen …</Text></Stack></Center> : issues.length === 0 ? <Center py="xl"><Text c="dimmed">Keine passenden Aufträge.</Text></Center> : <Stack gap="sm">{issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}</Stack>}
  </Stack>;
}
