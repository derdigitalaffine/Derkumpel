import { ActionIcon, Badge, Box, Button, Center, Drawer, Group, Loader, Menu, MultiSelect, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { IssueCard } from '../components/IssueCard';
import { issueAddress } from '../issueUtils';
import type { NamedRef } from '../types';

type SortKey = 'priority' | 'due' | 'updated' | 'subject';
type SavedFilter = { id: string; name: string; search: string; sort: SortKey; statuses: string[]; priorities: string[]; trackers: string[] };

export function WorkPage() {
  const query = useCallback(() => db.issues.where('active').equals(1).toArray(), []);
  const statusQuery = useCallback(async () => (await db.syncState.get('status'))?.value as { state?: string } | undefined, []);
  const records = useDexieLive(query, []);
  const syncStatus = useDexieLive(statusQuery, undefined);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('priority');
  const [excludedTrackers, setExcludedTrackers] = useState<number[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [trackers, setTrackers] = useState<string[]>([]);
  const [priorityOrder, setPriorityOrder] = useState<NamedRef[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterName, setFilterName] = useState('');

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      getSetting<SortKey>('workSort', 'priority'),
      getSetting<number[]>('excludedTrackers', []),
      getSetting<SavedFilter[]>('savedFilters', []),
      getSetting<NamedRef[]>('issuePriorities', []),
    ]).then(([savedSort, excluded, saved, cachedPriorities]) => {
      if (disposed) return;
      setSort(savedSort); setExcludedTrackers(excluded); setSavedFilters(saved); setPriorityOrder(cachedPriorities);
    });
    if (navigator.onLine) {
      void api.meta<{ issue_priorities: NamedRef[] }>('priorities').then(async (result) => {
        if (!disposed) setPriorityOrder(result.issue_priorities);
        await setSetting('issuePriorities', result.issue_priorities);
      }).catch(() => undefined);
    }
    return () => { disposed = true; };
  }, []);

  const available = useMemo(() => records.map((record) => record.data).filter((issue) => !excludedTrackers.includes(issue.tracker.id)), [records, excludedTrackers]);
  const statusOptions = useMemo(() => [...new Set(available.map((issue) => issue.status.name))].sort((a, b) => a.localeCompare(b, 'de')), [available]);
  const priorityOptions = useMemo(() => [...new Set(available.map((issue) => issue.priority.name))].sort((a, b) => a.localeCompare(b, 'de')), [available]);
  const trackerOptions = useMemo(() => [...new Set(available.map((issue) => issue.tracker.name))].sort((a, b) => a.localeCompare(b, 'de')), [available]);
  const priorityRank = useMemo(() => new Map(priorityOrder.map((priority, index) => [priority.id, index])), [priorityOrder]);

  const issues = useMemo(() => available.filter((issue) => {
    if (statuses.length && !statuses.includes(issue.status.name)) return false;
    if (priorities.length && !priorities.includes(issue.priority.name)) return false;
    if (trackers.length && !trackers.includes(issue.tracker.name)) return false;
    const needle = search.trim().toLocaleLowerCase('de-DE');
    if (!needle) return true;
    return [String(issue.id), issue.subject, issue.description ?? '', issueAddress(issue) ?? '', issue.assigned_to?.name ?? '', issue.tracker.name].some((value) => value.toLocaleLowerCase('de-DE').includes(needle));
  }).sort((a, b) => {
    if (sort === 'due') return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    if (sort === 'updated') return b.updated_on.localeCompare(a.updated_on);
    if (sort === 'subject') return a.subject.localeCompare(b.subject, 'de');
    const aRank = priorityRank.get(a.priority.id) ?? a.priority.id;
    const bRank = priorityRank.get(b.priority.id) ?? b.priority.id;
    return bRank - aRank || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  }), [available, search, sort, statuses, priorities, trackers, priorityRank]);

  const activeFilterCount = statuses.length + priorities.length + trackers.length;
  const clearFilters = () => { setSearch(''); setStatuses([]); setPriorities([]); setTrackers([]); };
  const saveCurrentFilter = async () => {
    const name = filterName.trim();
    if (!name) return;
    const saved: SavedFilter = { id: crypto.randomUUID(), name, search, sort, statuses, priorities, trackers };
    const next = [...savedFilters, saved];
    setSavedFilters(next); await setSetting('savedFilters', next); setFilterName('');
    notifications.show({ message: `Filter „${name}“ gespeichert`, color: 'green' });
  };
  const applySaved = (saved: SavedFilter) => {
    setSearch(saved.search); setSort(saved.sort); setStatuses(saved.statuses); setPriorities(saved.priorities); setTrackers(saved.trackers);
    void setSetting('workSort', saved.sort);
  };
  const removeSaved = async (id: string) => {
    const next = savedFilters.filter((saved) => saved.id !== id);
    setSavedFilters(next); await setSetting('savedFilters', next);
  };

  return <Stack gap="md" maw={900} mx="auto">
    <Box><Title order={1} size="h2">Meine Arbeit</Title><Text c="dimmed">Persönlich und über deine Gruppen zugewiesene offene Aufträge</Text></Box>
    <Paper withBorder radius="lg" p="sm" pos="sticky" top={72} style={{ zIndex: 10 }}>
      <Stack gap="xs">
        <Group align="end" wrap="nowrap">
          <TextInput value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Aufträge durchsuchen" aria-label="Aufträge durchsuchen" style={{ flex: 1 }} />
          <ActionIcon variant={activeFilterCount ? 'filled' : 'light'} size={46} aria-label="Filter" onClick={() => setFilterOpen(true)}>≡</ActionIcon>
          <Menu position="bottom-end"><Menu.Target><ActionIcon variant="light" size={46} aria-label="Sortierung">↕</ActionIcon></Menu.Target><Menu.Dropdown>
            {[['priority','Priorität'],['due','Fälligkeit'],['updated','Zuletzt geändert'],['subject','Titel']].map(([value,label]) => <Menu.Item key={value} onClick={() => { setSort(value as SortKey); void setSetting('workSort', value); }}>{sort === value ? '✓ ' : ''}{label}</Menu.Item>)}
          </Menu.Dropdown></Menu>
        </Group>
        {(activeFilterCount > 0 || savedFilters.length > 0) && <Group gap="xs">
          {activeFilterCount > 0 && <Badge variant="light" component="button" style={{ cursor: 'pointer' }} onClick={clearFilters}>{activeFilterCount} Filter · zurücksetzen</Badge>}
          {savedFilters.map((saved) => <Menu key={saved.id}><Menu.Target><Badge variant="outline" component="button" style={{ cursor: 'pointer' }}>{saved.name}</Badge></Menu.Target><Menu.Dropdown><Menu.Item onClick={() => applySaved(saved)}>Anwenden</Menu.Item><Menu.Item color="red" onClick={() => void removeSaved(saved.id)}>Löschen</Menu.Item></Menu.Dropdown></Menu>)}
        </Group>}
      </Stack>
    </Paper>
    {records.length === 0 && syncStatus?.state === 'syncing' ? <Center py="xl"><Stack align="center"><Loader /><Text c="dimmed">Aufträge werden synchronisiert …</Text></Stack></Center> : issues.length === 0 ? <Center py="xl"><Stack align="center" gap="xs"><Text fw={700}>{records.length === 0 ? 'Keine offenen Aufträge' : 'Keine passenden Aufträge'}</Text><Text size="sm" c="dimmed" ta="center">{records.length === 0 ? 'Aktuell ist dir und deinen Gruppen nichts Offenes zugewiesen.' : 'Passe Suche oder Filter an.'}</Text></Stack></Center> : <Stack gap="sm">{issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}</Stack>}

    <Drawer opened={filterOpen} onClose={() => setFilterOpen(false)} title="Aufträge filtern" position="bottom" size="auto" padding="lg">
      <Stack>
        <MultiSelect label="Status" data={statusOptions} value={statuses} onChange={setStatuses} searchable clearable />
        <MultiSelect label="Priorität" data={priorityOptions} value={priorities} onChange={setPriorities} searchable clearable />
        <MultiSelect label="Tracker" data={trackerOptions} value={trackers} onChange={setTrackers} searchable clearable />
        <Group grow><Button variant="default" onClick={clearFilters}>Zurücksetzen</Button><Button onClick={() => setFilterOpen(false)}>Übernehmen</Button></Group>
        <Paper withBorder p="md" radius="md"><Stack gap="xs"><Text fw={700}>Aktuellen Filter speichern</Text><TextInput value={filterName} onChange={(event) => setFilterName(event.currentTarget.value)} placeholder="z. B. Grünpflege heute" /><Button variant="light" disabled={!filterName.trim()} onClick={() => void saveCurrentFilter()}>Speichern</Button></Stack></Paper>
      </Stack>
    </Drawer>
  </Stack>;
}
