import { ActionIcon, Alert, Badge, Box, Button, Drawer, Group, Paper, SegmentedControl, Select, Skeleton, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type TicketBrowserStatus } from '../api';
import { db, getSetting, setSetting } from '../db';
import { IssueCard } from '../components/IssueCard';
import { CompactIssueRow } from '../components/CompactIssueRow';
import { UIIcon } from '../components/UIIcon';
import { issueAddress } from '../issueUtils';
import type { NamedRef, RedmineIssue } from '../types';

type ProjectList = { projects: NamedRef[] };
type TrackerList = { trackers: NamedRef[] };

type BrowserState = {
  status: TicketBrowserStatus;
  trackerId?: number;
  projectId?: number;
};

const PAGE_SIZE = 50;

function BrowserSkeleton() {
  return <Stack gap="sm">{[0, 1, 2].map((item) => <Paper key={item} withBorder p="md" className="surface-card"><Stack gap="sm"><Skeleton h={20} w="35%" /><Skeleton h={24} w="75%" /><Skeleton h={38} /></Stack></Paper>)}</Stack>;
}

export function TicketsPage() {
  const [browser, setBrowser] = useState<BrowserState>({ status: '*' });
  const [issues, setIssues] = useState<RedmineIssue[]>([]);
  const [trackers, setTrackers] = useState<NamedRef[]>([]);
  const [projects, setProjects] = useState<NamedRef[]>([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<'compact' | 'cards'>('compact');
  const requestId = useRef(0);

  useEffect(() => {
    void getSetting<'compact' | 'cards'>('ticketBrowserView', 'compact').then((stored) => setView(stored === 'cards' ? 'cards' : 'compact'));
    let disposed = false;
    void getSetting<BrowserState>('ticketBrowser', { status: '*' }).then((saved) => { if (!disposed) setBrowser(saved); });
    void Promise.all([
      getSetting<NamedRef[]>('trackersMeta', []),
      getSetting<NamedRef[]>('projectsMeta', []),
    ]).then(([cachedTrackers, cachedProjects]) => {
      if (disposed) return;
      setTrackers(cachedTrackers);
      setProjects(cachedProjects);
    });
    if (navigator.onLine) {
      void Promise.all([
        api.meta<TrackerList>('trackers'),
        api.meta<ProjectList>('projects'),
      ]).then(async ([trackerResult, projectResult]) => {
        if (disposed) return;
        setTrackers(trackerResult.trackers);
        setProjects(projectResult.projects);
        await Promise.all([
          setSetting('trackersMeta', trackerResult.trackers),
          setSetting('projectsMeta', projectResult.projects),
        ]);
      }).catch(() => undefined);
    }
    return () => { disposed = true; };
  }, []);

  const loadOffline = async (state: BrowserState, token: number) => {
    const local = (await db.issues.toArray()).map((record) => record.data).filter((issue) => {
      if (state.status === 'closed' && !issue.closed_on) return false;
      if (state.status === 'open' && issue.closed_on) return false;
      if (state.trackerId && issue.tracker.id !== state.trackerId) return false;
      if (state.projectId && issue.project.id !== state.projectId) return false;
      return true;
    }).sort((a, b) => b.updated_on.localeCompare(a.updated_on));
    if (token !== requestId.current) return;
    setIssues(local);
    setTotal(local.length);
    setError('Offline: Es werden die auf diesem Gerät gespeicherten Tickets angezeigt.');
  };

  const load = async (state: BrowserState, append = false) => {
    const token = append ? requestId.current : ++requestId.current;
    if (!navigator.onLine) {
      if (!append) await loadOffline(state, token);
      setLoading(false); setLoadingMore(false);
      return;
    }
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const offset = append ? issues.length : 0;
      const page = await api.browseIssues({ status: state.status, trackerId: state.trackerId, projectId: state.projectId, offset, limit: PAGE_SIZE });
      if (token !== requestId.current) return; // stale filter responses must not override the new selection
      setIssues((current) => append ? [...current, ...page.issues] : page.issues);
      setTotal(page.total_count);
    } catch (caught) {
      if (token !== requestId.current) return;
      if (!append) await loadOffline(state, token);
      setError(caught instanceof Error ? `Ticketbrowser konnte nicht aktualisiert werden: ${caught.message}` : 'Ticketbrowser konnte nicht aktualisiert werden.');
    } finally {
      if (token === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  };

  useEffect(() => {
    void setSetting('ticketBrowser', browser);
    void load(browser, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browser.status, browser.trackerId, browser.projectId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE');
    if (!needle) return issues;
    return issues.filter((issue) => [
      String(issue.id), issue.subject, issue.description ?? '', issue.tracker.name, issue.project.name,
      issue.assigned_to?.name ?? '', issueAddress(issue) ?? '', issue.status.name,
    ].some((value) => value.toLocaleLowerCase('de-DE').includes(needle)));
  }, [issues, search]);

  const updateBrowser = (patch: Partial<BrowserState>) => setBrowser((current) => ({ ...current, ...patch }));
  const trackerData = trackers.map((tracker) => ({ value: String(tracker.id), label: tracker.name }));
  const projectData = projects.map((project) => ({ value: String(project.id), label: project.name }));
  const hasMore = navigator.onLine && issues.length < total;
  const activeFilters = Number(Boolean(browser.projectId)) + Number(Boolean(browser.trackerId));
  const resetFilters = () => { setSearch(''); setBrowser({ status: '*' }); };

  const changeView = (next: string) => {
    const mode = next === 'cards' ? 'cards' as const : 'compact' as const;
    setView(mode);
    void setSetting('ticketBrowserView', mode);
  };
  const loadingLabel = loading ? 'Tickets werden geladen' : `${filtered.length} Tickets in der Liste`;

  return <Stack gap="sm" maw={960} mx="auto">
    <Group justify="space-between" align="center" className="page-heading" wrap="nowrap">
      <Box>
        <Text className="page-kicker">Recherche & Archiv</Text>
        <Title order={1} size="h2">Alle Tickets</Title>
      </Box>
      <Badge variant="light" color="brand" size="lg">{total} Treffer</Badge>
    </Group>

    <Paper withBorder p="xs" className="ticket-browser-bar">
      <Stack gap={8}>
        <SegmentedControl fullWidth size="sm" value={browser.status} onChange={(value) => updateBrowser({ status: value as TicketBrowserStatus })}
          data={[{ value: 'open', label: 'Offen' }, { value: 'closed', label: 'Geschlossen' }, { value: '*', label: 'Alle' }]} />
        <Group wrap="nowrap" gap={7} align="stretch">
          <TextInput size="md" value={search} onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Ticketnummer, Titel, Ort …" aria-label="Geladene Tickets durchsuchen"
            leftSection={<UIIcon name="search" size={18} />}
            rightSection={search ? <ActionIcon variant="subtle" size="sm" color="gray" aria-label="Suche leeren" onClick={() => setSearch('')}><UIIcon name="close" size={16} /></ActionIcon> : undefined}
            style={{ flex: 1, minWidth: 0 }} />
          <Button onClick={() => setFilterOpen(true)} variant={activeFilters ? 'filled' : 'light'} px={12}
            leftSection={<UIIcon name="filter" size={18} />} aria-label={`Erweiterte Filter öffnen: ${activeFilters} aktiv`}>
            Filter{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
        </Group>
      </Stack>
    </Paper>

    <Group justify="space-between" align="center" gap={8} wrap="nowrap" className="ticket-list-tools">
      <Text size="xs" c="dimmed" aria-live="polite">{loadingLabel}{search ? ' · Suche nur in geladenen Tickets' : ''}</Text>
      <SegmentedControl size="xs" value={view} onChange={changeView}
        data={[{ value: 'compact', label: 'Kompakt' }, { value: 'cards', label: 'Karten' }]}
        aria-label="Ansicht umschalten" />
    </Group>

    {error && <Alert color={navigator.onLine ? 'orange' : 'blue'} variant="light">{error}</Alert>}

    {loading ? <BrowserSkeleton /> : filtered.length === 0 ? <Paper className="empty-state" p="xl">
      <Stack align="center" gap="sm" ta="center">
        <ThemeIcon size={52} radius="xl" variant="light"><UIIcon name="search" size={24} /></ThemeIcon>
        <Box><Text fw={800}>Keine passenden Tickets</Text><Text size="sm" c="dimmed" mt={4}>Suche oder Filter anpassen.</Text></Box>
        <Button variant="light" onClick={resetFilters}>Zurücksetzen</Button>
      </Stack>
    </Paper> : <Stack gap={view === 'compact' ? 0 : 'sm'} className={view === 'compact' ? 'compact-ticket-list' : undefined}>
      {filtered.map((issue) => view === 'compact'
        ? <CompactIssueRow key={issue.id} issue={issue} />
        : <IssueCard key={issue.id} issue={issue} />)}
      {hasMore && <Button variant="light" mt="md" loading={loadingMore} onClick={() => void load(browser, true)}
        leftSection={<UIIcon name="download" size={17} />}>
        Weitere {Math.min(PAGE_SIZE, total - issues.length)} laden{search ? ' · Suchbereich erweitern' : ''}
      </Button>}
    </Stack>}

    <Drawer opened={filterOpen} onClose={() => setFilterOpen(false)} title="Tickets filtern"
      position="bottom" size="auto" padding="lg">
      <Stack gap="md" maw={640} mx="auto">
        <Text size="sm" c="dimmed">Grenze die sichtbaren Redmine-Tickets nach Tracker und Projekt ein.</Text>
        <Select label="Tracker" placeholder="Alle Tracker" searchable clearable data={trackerData}
          value={browser.trackerId ? String(browser.trackerId) : null}
          onChange={(value) => updateBrowser({ trackerId: value ? Number(value) : undefined })} />
        <Select label="Projekt" placeholder="Alle Projekte" searchable clearable data={projectData}
          value={browser.projectId ? String(browser.projectId) : null}
          onChange={(value) => updateBrowser({ projectId: value ? Number(value) : undefined })} />
        <Group grow>
          <Button variant="default" onClick={() => { resetFilters(); setFilterOpen(false); }}>Alles zurücksetzen</Button>
          <Button onClick={() => setFilterOpen(false)}>Tickets anzeigen</Button>
        </Group>
      </Stack>
    </Drawer>
  </Stack>;
}
