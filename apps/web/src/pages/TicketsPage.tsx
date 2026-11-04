import { ActionIcon, Alert, Badge, Box, Button, Group, Paper, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type TicketBrowserStatus } from '../api';
import { db, getSetting, setSetting } from '../db';
import { IssueCard } from '../components/IssueCard';
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
  const requestId = useRef(0);

  useEffect(() => {
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

  return <Stack gap="md" maw={900} mx="auto">
    <Group justify="space-between" align="flex-end" className="page-heading">
      <Box>
        <Text className="page-kicker">Recherche & Archiv</Text>
        <Title order={1} size="h2">Alle Tickets</Title>
        <Text className="page-subtitle" mt={4}>Auch erledigte und geschlossene Aufträge wiederfinden</Text>
      </Box>
      <Badge variant="light" size="lg" color="brand">{total} Treffer</Badge>
    </Group>

    <Paper withBorder p="sm" className="work-toolbar" pos="sticky" top={78}>
      <Stack gap="sm">
        <SegmentedControl
          fullWidth
          value={browser.status}
          onChange={(value) => updateBrowser({ status: value as TicketBrowserStatus })}
          data={[{ value: 'open', label: 'Offen' }, { value: 'closed', label: 'Geschlossen' }, { value: '*', label: 'Alle' }]}
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
          <Select
            label="Tracker"
            placeholder="Alle Tracker"
            data={trackerData}
            searchable
            clearable
            value={browser.trackerId ? String(browser.trackerId) : null}
            onChange={(value) => updateBrowser({ trackerId: value ? Number(value) : undefined })}
          />
          <Select
            label="Projekt"
            placeholder="Alle Projekte"
            data={projectData}
            searchable
            clearable
            value={browser.projectId ? String(browser.projectId) : null}
            onChange={(value) => updateBrowser({ projectId: value ? Number(value) : undefined })}
          />
        </SimpleGrid>
        <TextInput
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Titel, Ort, Ticketnummer …"
          aria-label="Tickets durchsuchen"
          leftSection={<UIIcon name="search" size={19} />}
          rightSection={search ? <ActionIcon variant="subtle" color="gray" aria-label="Suche leeren" onClick={() => setSearch('')}><UIIcon name="close" size={16} /></ActionIcon> : undefined}
        />
        <Group justify="space-between" align="center" gap="xs">
          <Text size="xs" c="dimmed">Suche in den {issues.length} bereits geladenen Tickets</Text>
          {(activeFilters > 0 || browser.status !== '*' || search) && <Button variant="subtle" color="gray" size="compact-xs" onClick={resetFilters}>Alle Filter löschen</Button>}
        </Group>
      </Stack>
    </Paper>

    {error && <Alert color={navigator.onLine ? 'orange' : 'blue'} variant="light">{error}</Alert>}

    {loading ? <BrowserSkeleton /> : filtered.length === 0 ? <Paper className="empty-state" p="xl">
      <Stack align="center" gap="sm" ta="center">
        <ThemeIcon size={52} radius="xl" variant="light"><UIIcon name="search" size={24} /></ThemeIcon>
        <Box><Text fw={800}>Keine passenden Tickets</Text><Text size="sm" c="dimmed" mt={4}>Status, Tracker, Projekt oder Suche anpassen.</Text></Box>
        <Button variant="light" onClick={resetFilters}>Suche zurücksetzen</Button>
      </Stack>
    </Paper> : <Stack gap="sm">
      <Text size="xs" c="dimmed" fw={650}>{search ? `${filtered.length} in ${issues.length} geladenen Tickets` : `${issues.length} von ${total} geladen`}</Text>
      {filtered.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
      {hasMore && <Button variant="light" loading={loadingMore} onClick={() => void load(browser, true)} leftSection={<UIIcon name="download" size={17} />}>Weitere {Math.min(PAGE_SIZE, total - issues.length)} laden{search ? ' (Suche erweitern)' : ''}</Button>}
    </Stack>}
  </Stack>;
}
