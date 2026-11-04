import { ActionIcon, Badge, Box, Button, Drawer, Group, Menu, MultiSelect, Paper, ScrollArea, Skeleton, Stack, Text, TextInput, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { IssueCard, dueInfo } from '../components/IssueCard';
import { UIIcon } from '../components/UIIcon';
import { issueAddress } from '../issueUtils';
import type { NamedRef } from '../types';

type SortKey = 'priority' | 'due' | 'updated' | 'subject';
type QuickView = 'all' | 'today' | 'late';
type SavedFilter = { id: string; name: string; search: string; sort: SortKey; statuses: string[]; priorities: string[]; trackers: string[] };
type SyncStatus = { state?: string; lastSuccess?: number };

const sortLabels: Record<SortKey, string> = {
  priority: 'Priorität',
  due: 'Fälligkeit',
  updated: 'Zuletzt geändert',
  subject: 'Titel',
};

function LoadingCards() {
  return <Stack gap="sm" aria-label="Aufträge werden geladen">
    {[0, 1, 2].map((index) => <Paper key={index} withBorder p="md" className="surface-card skeleton-card">
      <Stack gap="sm">
        <Group justify="space-between"><Skeleton h={22} w={118} radius="xl" /><Skeleton h={14} w={70} /></Group>
        <Skeleton h={22} w={`${82 - index * 8}%`} />
        <Skeleton h={38} radius="md" />
        <Group><Skeleton h={13} w={92} /><Skeleton h={13} w={118} /></Group>
        <Skeleton h={8} radius="xl" />
      </Stack>
    </Paper>)}
  </Stack>;
}

export function WorkPage() {
  const query = useCallback(() => db.issues.where('active').equals(1).toArray(), []);
  const statusQuery = useCallback(async () => (await db.syncState.get('status'))?.value as SyncStatus | undefined, []);
  const records = useDexieLive(query, []);
  const syncStatus = useDexieLive(statusQuery, undefined);
  const [search, setSearch] = useState('');
  const [quickView, setQuickView] = useState<QuickView>('all');
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
  const dueToday = useMemo(() => available.filter((issue) => dueInfo(issue.due_date).color === 'orange').length, [available]);
  const overdue = useMemo(() => available.filter((issue) => dueInfo(issue.due_date).color === 'red').length, [available]);
  const statusOptions = useMemo(() => [...new Set(available.map((issue) => issue.status.name))].sort((a, b) => a.localeCompare(b, 'de')), [available]);
  const priorityOptions = useMemo(() => [...new Set(available.map((issue) => issue.priority.name))].sort((a, b) => a.localeCompare(b, 'de')), [available]);
  const trackerOptions = useMemo(() => [...new Set(available.map((issue) => issue.tracker.name))].sort((a, b) => a.localeCompare(b, 'de')), [available]);
  const priorityRank = useMemo(() => new Map(priorityOrder.map((priority, index) => [priority.id, index])), [priorityOrder]);

  const issues = useMemo(() => available.filter((issue) => {
    if (quickView === 'today' && dueInfo(issue.due_date).color !== 'orange') return false;
    if (quickView === 'late' && dueInfo(issue.due_date).color !== 'red') return false;
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
  }), [available, search, sort, statuses, priorities, trackers, priorityRank, quickView]);

  const activeFilterCount = statuses.length + priorities.length + trackers.length + (quickView === 'all' ? 0 : 1);
  const clearStructuredFilters = () => { setStatuses([]); setPriorities([]); setTrackers([]); setQuickView('all'); };
  const clearAll = () => { setSearch(''); clearStructuredFilters(); };
  const saveCurrentFilter = async () => {
    const name = filterName.trim();
    if (!name) return;
    const saved: SavedFilter = { id: crypto.randomUUID(), name, search, sort, statuses, priorities, trackers };
    const next = [...savedFilters, saved];
    setSavedFilters(next); await setSetting('savedFilters', next); setFilterName('');
    notifications.show({ message: `Filter „${name}“ gespeichert`, color: 'green' });
  };
  const applySaved = (saved: SavedFilter) => {
    setQuickView('all');
    setSearch(saved.search); setSort(saved.sort); setStatuses(saved.statuses); setPriorities(saved.priorities); setTrackers(saved.trackers);
    void setSetting('workSort', saved.sort);
  };
  const removeSaved = async (id: string) => {
    const next = savedFilters.filter((saved) => saved.id !== id);
    setSavedFilters(next); await setSetting('savedFilters', next);
  };

  const firstSyncLoading = records.length === 0 && syncStatus?.state === 'syncing';
  const quickOptions: Array<{ key: QuickView; label: string; count: number }> = [
    { key: 'all', label: 'Alle offen', count: available.length },
    { key: 'today', label: 'Heute fällig', count: dueToday },
    { key: 'late', label: 'Überfällig', count: overdue },
  ];

  return <Stack gap="md" maw={900} mx="auto" aria-busy={firstSyncLoading}>
    <Group justify="space-between" align="flex-end" className="page-heading">
      <Box>
        <Text className="page-kicker">Einsatzübersicht</Text>
        <Title order={1} size="h2">Meine Arbeit</Title>
        <Text className="page-subtitle" mt={4}>Deine eigenen Aufträge und Gruppenaufträge</Text>
      </Box>
      {syncStatus?.lastSuccess && <Text size="xs" c="dimmed" fw={650} ta="right">
        <UIIcon name="check-circle" size={12} /> Stand {new Date(syncStatus.lastSuccess).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
      </Text>}
    </Group>

    <Box className="summary-strip">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Box>
          <Text size="xs" fw={800} tt="uppercase" style={{ letterSpacing: '.1em', color: '#c9e4e8' }}>Aufträge im Blick</Text>
          <Group align="baseline" gap={10} mt={8} wrap="nowrap">
            <Text className="summary-count">{available.length}</Text>
            <Text className="summary-caption">offene Aufträge für dich und deine Teams</Text>
          </Group>
        </Box>
        <Box c="white" style={{ opacity: .78 }}><UIIcon name="work" size={34} strokeWidth={1.35} /></Box>
      </Group>
    </Box>

    <Box className="quick-stats" role="group" aria-label="Aufträge nach Fälligkeit eingrenzen">
      {quickOptions.map((option) => <UnstyledButton key={option.key} className="quick-stat"
        data-active={quickView === option.key} aria-pressed={quickView === option.key}
        onClick={() => setQuickView(quickView === option.key && option.key !== 'all' ? 'all' : option.key)}>
        <span className="quick-stat-count" style={{ color: option.key === 'late' && option.count ? '#b85043' : option.key === 'today' && option.count ? '#9c6a16' : '#1b5067' }}>{option.count}</span>
        <span className="quick-stat-label">{option.label}</span>
      </UnstyledButton>)}
    </Box>

    <Paper withBorder p="sm" pos="sticky" top={78} className="work-toolbar">
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Titel, Ort, Auftrag …"
            aria-label="Aufträge durchsuchen"
            leftSection={<UIIcon name="search" size={20} />}
            rightSection={search ? <ActionIcon size={34} variant="subtle" color="gray" aria-label="Suche leeren" onClick={() => setSearch('')}><UIIcon name="close" size={16} /></ActionIcon> : undefined}
            style={{ flex: 1 }}
          />
          <ActionIcon
            variant={activeFilterCount ? 'filled' : 'light'}
            size={48}
            aria-label={activeFilterCount ? `Filter, ${activeFilterCount} aktiv` : 'Filter'}
            onClick={() => setFilterOpen(true)}
          >
            <UIIcon name="filter" size={21} />
          </ActionIcon>
          <Menu position="bottom-end" shadow="md" width={210}>
            <Menu.Target><ActionIcon variant="light" size={48} aria-label={`Sortierung: ${sortLabels[sort]}`} ><UIIcon name="sort" size={21} /></ActionIcon></Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Sortieren nach</Menu.Label>
              {(Object.entries(sortLabels) as [SortKey, string][]).map(([value, label]) => <Menu.Item key={value} onClick={() => { setSort(value); void setSetting('workSort', value); }}>
                {sort === value ? '✓ ' : ''}{label}
              </Menu.Item>)}
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed" fw={650}>{issues.length === available.length ? `${issues.length} Aufträge` : `${issues.length} von ${available.length}`} · {sortLabels[sort]}</Text>
          {(activeFilterCount > 0 || search) && <Button variant="subtle" size="compact-xs" color="gray" onClick={clearAll}>Zurücksetzen</Button>}
        </Group>

        {(activeFilterCount > 0 || savedFilters.length > 0) && <ScrollArea type="never" offsetScrollbars>
          <Group gap={6} wrap="nowrap" pb={2}>
            {activeFilterCount > 0 && <Badge variant="light" component="button" style={{ cursor: 'pointer', flex: '0 0 auto' }} onClick={clearStructuredFilters}>{activeFilterCount} aktive Filter ×</Badge>}
            {savedFilters.map((saved) => <Menu key={saved.id} position="bottom-start">
              <Menu.Target><Badge variant="outline" component="button" style={{ cursor: 'pointer', flex: '0 0 auto' }}>{saved.name}</Badge></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => applySaved(saved)}>Anwenden</Menu.Item>
                <Menu.Item color="red" onClick={() => void removeSaved(saved.id)}>Löschen</Menu.Item>
              </Menu.Dropdown>
            </Menu>)}
          </Group>
        </ScrollArea>}
      </Stack>
    </Paper>

    <Text component="span" className="sr-only" aria-live="polite">
      {firstSyncLoading ? 'Aufträge werden synchronisiert.' : `${issues.length} Aufträge werden angezeigt.`}
    </Text>

    {firstSyncLoading ? <LoadingCards /> : issues.length === 0 ? <Paper className="empty-state" p="xl">
      <Stack align="center" gap="sm" ta="center">
        <ThemeIcon size={52} radius="xl" variant="light" color={records.length === 0 ? 'green' : 'blue'}>{records.length === 0 ? '✓' : '⌕'}</ThemeIcon>
        <Box>
          <Text fw={800}>{records.length === 0 ? 'Keine offenen Aufträge' : 'Keine passenden Aufträge'}</Text>
          <Text size="sm" c="dimmed" mt={4}>{records.length === 0 ? 'Aktuell ist dir und deinen Gruppen nichts Offenes zugewiesen.' : 'Passe Suche oder Filter an.'}</Text>
        </Box>
        {records.length > 0 ? <Button variant="light" onClick={clearAll} leftSection={<UIIcon name="refresh" size={17} />}>Filter zurücksetzen</Button>
          : <Button variant="light" component={Link} to="/tickets" leftSection={<UIIcon name="tickets" size={17} />}>Ticket-Browser öffnen</Button>}
      </Stack>
    </Paper> : <Stack gap="sm">{issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}</Stack>}

    <Drawer opened={filterOpen} onClose={() => setFilterOpen(false)} title="Aufträge filtern" position="bottom" size="auto" padding="lg">
      <Stack gap="md" maw={700} mx="auto">
        <Text size="sm" c="dimmed">Grenze die Arbeitsliste ein. Die Auswahl bleibt lokal auf diesem Gerät.</Text>
        <MultiSelect label="Status" data={statusOptions} value={statuses} onChange={setStatuses} searchable clearable placeholder="Alle Status" />
        <MultiSelect label="Priorität" data={priorityOptions} value={priorities} onChange={setPriorities} searchable clearable placeholder="Alle Prioritäten" />
        <MultiSelect label="Tracker" data={trackerOptions} value={trackers} onChange={setTrackers} searchable clearable placeholder="Alle Tracker" />
        <Group grow>
          <Button variant="default" onClick={clearStructuredFilters}>Zurücksetzen</Button>
          <Button onClick={() => setFilterOpen(false)}>{activeFilterCount ? `${activeFilterCount} Filter übernehmen` : 'Übernehmen'}</Button>
        </Group>
        <Paper withBorder p="md" className="surface-card">
          <Stack gap="xs">
            <Text fw={800}>Aktuelle Ansicht speichern</Text>
            <Text size="xs" c="dimmed">Speichert Suche, Filter und Sortierung nur auf diesem Gerät.</Text>
            <TextInput value={filterName} onChange={(event) => setFilterName(event.currentTarget.value)} placeholder="z. B. Grünpflege heute" />
            <Button variant="light" disabled={!filterName.trim()} onClick={() => void saveCurrentFilter()}>Ansicht speichern</Button>
          </Stack>
        </Paper>
      </Stack>
    </Drawer>
  </Stack>;
}
