import { ActionIcon, Alert, Badge, Box, Button, Drawer, Group, Paper, SegmentedControl, Select, Skeleton, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, AuthRequiredError, type TicketBrowserStatus } from '../api';
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
  const [compact, setCompact] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [nextOffset,setNextOffset]=useState(0),[more,setMore]=useState(false),[totalExact,setTotalExact]=useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const [initialized,setInitialized]=useState(false);
  const [filterNotice,setFilterNotice]=useState('');

  useEffect(() => {
    void getSetting('ticketCompactView', true).then(setCompact);
    let disposed = false;
    void (async()=>{
      const [saved,cachedTrackers,cachedProjects]=await Promise.all([getSetting<BrowserState>('ticketBrowser',{status:'*'}),getSetting<NamedRef[]>('trackersMeta',[]),getSetting<NamedRef[]>('projectsMeta',[])]);
      if(disposed)return;setTrackers(cachedTrackers);setProjects(cachedProjects);
      // Restore saved filter and load tickets immediately; metadata is optional.
      setBrowser(saved);setInitialized(true);
      if(navigator.onLine){
        void api.meta<TrackerList>('trackers').then(result=>{if(!disposed){setTrackers(result.trackers);void setSetting('trackersMeta',result.trackers);}}).catch(()=>undefined);
        void api.meta<ProjectList>('projects').then(result=>{if(!disposed){setProjects(result.projects);void setSetting('projectsMeta',result.projects);}}).catch(()=>undefined);
      }
    })().catch(()=>{if(!disposed)setInitialized(true);});
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
    setTotal(local.length);setNextOffset(local.length);setMore(false);setTotalExact(true);
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
    if(!append){setMore(false);setNextOffset(0);}
    setError('');
    try {
      const offset = append ? nextOffset : 0;
      const page = await api.browseIssues({ status: state.status, trackerId: state.trackerId, projectId: state.projectId, offset, limit: PAGE_SIZE });
      if (token !== requestId.current) return; // stale filter responses must not override the new selection
      if(page.filterUnavailable&&state.projectId){setIssues([]);setTotal(0);setProjects(old=>old.filter(p=>p.id!==state.projectId));setFilterNotice('Dieses Projekt ist nicht mehr verfügbar. Der Projektfilter wurde zurückgesetzt.');setBrowser(old=>({...old,projectId:undefined,trackerId:undefined}));return;}
      setIssues((current) => append ? [...current, ...page.issues.filter(i=>!current.some(c=>c.id===i.id))] : page.issues);
      setTotal(page.total_count);setNextOffset(page.nextOffset??offset+page.issues.length);setMore(page.hasMore??offset+page.issues.length<page.total_count);setTotalExact(page.totalExact??true);
    } catch (caught) {
      if (token !== requestId.current) return;
      if(caught instanceof AuthRequiredError||(caught instanceof ApiError&&[401,403,404].includes(caught.status))){setIssues([]);setTotal(0);if(state.projectId&&caught instanceof ApiError&&[403,404].includes(caught.status)){setFilterNotice('Projekt nicht zugänglich. Der Filter wurde zurückgesetzt.');setBrowser(old=>({...old,projectId:undefined,trackerId:undefined}));return;}}else if (!append) await loadOffline(state, token);
      if(token!==requestId.current)return;
      setError(caught instanceof Error ? `Ticketbrowser konnte nicht aktualisiert werden: ${caught.message}` : 'Ticketbrowser konnte nicht aktualisiert werden.');
    } finally {
      if (token === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  };

  useEffect(() => {
    if(!initialized)return;
    void setSetting('ticketBrowser', browser);
    void load(browser, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized,browser.status, browser.trackerId, browser.projectId]);

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
  const hasMore = navigator.onLine && more;
  const activeFilters = Number(Boolean(browser.projectId)) + Number(Boolean(browser.trackerId));
  const resetFilters = () => { setSearch(''); if(!browser.projectId&&!browser.trackerId&&browser.status==='*')void load(browser);else setBrowser({ status: '*' }); };
  const switchView = (value: boolean) => { setCompact(value); void setSetting('ticketCompactView', value); };

  return <Stack gap="md" maw={900} mx="auto">
    <Group justify="space-between" align="flex-end" className="page-heading">
      <Box>
        <Text className="page-kicker">Recherche & Archiv</Text>
        <Title order={1} size="h2">Alle Tickets</Title>
        <Text className="page-subtitle" mt={4}>Auch erledigte und geschlossene Aufträge wiederfinden</Text>
      </Box>
      <Badge variant="light" size="lg" color="brand">{totalExact?total:issues.length+'+'} Treffer</Badge>
    </Group>

    <Paper withBorder p="sm" className="surface-card ticket-browser-toolbar">
      <Stack gap="xs">
        <SegmentedControl fullWidth size="sm" aria-label="Ticketstatus" value={browser.status}
          onChange={(value) => updateBrowser({ status: value as TicketBrowserStatus })}
          data={[{ value: 'open', label: 'Offen' }, { value: 'closed', label: 'Geschlossen' }, { value: '*', label: 'Alle' }]} />
        <Group gap={7} wrap="nowrap">
          <TextInput size="sm" value={search} onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Tickets durchsuchen …" aria-label="Geladene Tickets durchsuchen"
            leftSection={<UIIcon name="search" size={17} />}
            rightSection={search ? <ActionIcon size="sm" variant="subtle" color="gray"
              aria-label="Suche leeren" onClick={() => setSearch('')}><UIIcon name="close" size={14} /></ActionIcon> : undefined}
            style={{ flex: 1, minWidth: 0 }} />
          <ActionIcon size={42} variant={activeFilters > 0 ? 'filled' : 'light'}
            aria-label={`Erweiterte Filter öffnen${activeFilters ? `, ${activeFilters} aktiv` : ''}`}
            onClick={() => setFilterOpen(true)}><UIIcon name="filter" size={19} /></ActionIcon>
        </Group>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="xs" c="dimmed" fw={650} aria-live="polite">
            {filtered.length} angezeigt · {issues.length} geladen{activeFilters ? ` · ${activeFilters} Filter` : ''}
          </Text>
          <Group gap={4} wrap="nowrap" role="group" aria-label="Darstellung">
            <ActionIcon size={34} radius="md" variant={compact ? 'filled' : 'subtle'}
              aria-label="Kompakte Listenansicht" aria-pressed={compact}
              onClick={() => switchView(true)}><UIIcon name="list" size={18} /></ActionIcon>
            <ActionIcon size={34} radius="md" variant={!compact ? 'filled' : 'subtle'}
              aria-label="Große Kartenansicht" aria-pressed={!compact}
              onClick={() => switchView(false)}><UIIcon name="layers" size={18} /></ActionIcon>
          </Group>
        </Group>
      </Stack>
    </Paper>

    <Drawer opened={filterOpen} onClose={() => setFilterOpen(false)}
      position="bottom" size="auto" title="Ticket-Filter" padding="lg">
      <Stack gap="md" maw={620} mx="auto" pb="md">
        <Text size="sm" c="dimmed">Die Auswahl gilt für offene, geschlossene und archivierte Tickets.</Text>
        <Select label="Tracker" placeholder="Alle Tracker" data={trackerData} searchable clearable
          value={browser.trackerId ? String(browser.trackerId) : null}
          onChange={(value) => updateBrowser({ trackerId: value ? Number(value) : undefined })} />
        <Select label="Projekt" placeholder="Alle Projekte" data={projectData} searchable clearable
          value={browser.projectId ? String(browser.projectId) : null}
          onChange={(value) => updateBrowser({ projectId: value ? Number(value) : undefined })} />
        <Group grow>
          <Button variant="default" onClick={resetFilters}>Zurücksetzen</Button>
          <Button onClick={() => setFilterOpen(false)}>Ergebnisse ansehen</Button>
        </Group>
      </Stack>
    </Drawer>

    {filterNotice&&<Alert color="blue" withCloseButton onClose={()=>setFilterNotice('')}>{filterNotice}</Alert>}
    {error && <Alert color={navigator.onLine ? 'orange' : 'blue'} variant="light">{error}</Alert>}

    {loading ? <BrowserSkeleton /> : filtered.length === 0 ? <Paper className="empty-state" p="xl">
      <Stack align="center" gap="sm" ta="center">
        <ThemeIcon size={52} radius="xl" variant="light"><UIIcon name="search" size={24} /></ThemeIcon>
        <Box><Text fw={800}>Keine passenden Tickets</Text><Text size="sm" c="dimmed" mt={4}>Status, Tracker, Projekt oder Suche anpassen.</Text></Box>
        <Button variant="light" onClick={resetFilters}>Suche zurücksetzen</Button>{hasMore&&<Button variant="light" loading={loadingMore} onClick={()=>void load(browser,true)}>Weitere Tickets suchen</Button>}
      </Stack>
    </Paper> : <Stack gap="sm">
      <Text size="xs" c="dimmed" fw={650}>{issues.length} Tickets geladen{totalExact?' von '+total:''} · Suche durchsucht nur geladene Tickets</Text>
      {compact ? <Stack gap={0} className="compact-ticket-list">{filtered.map((issue) => <CompactIssueRow key={issue.id} issue={issue} />)}</Stack>
        : filtered.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
      {hasMore && <Button variant="light" loading={loadingMore} onClick={() => void load(browser, true)} leftSection={<UIIcon name="download" size={17} />}>Weitere Tickets laden{search ? ' (Suche erweitern)' : ''}</Button>}
    </Stack>}
  </Stack>;
}
