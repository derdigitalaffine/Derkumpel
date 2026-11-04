import { ActionIcon, Alert, Badge, Box, Button, Collapse, Group, Loader, MultiSelect, Paper, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Map, Marker, NavigationControl } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { issueCoordinates } from '../issueUtils';
import { dueInfo } from '../components/IssueCard';
import { BASEMAP_RASTER_STYLE, OTTERBACH_OTTERBERG_CENTER } from '../mapStyle';
import type { RedmineIssue } from '../types';
import { UIIcon } from '../components/UIIcon';

type MapScope = 'mine' | 'visible';
type MapFilters = { trackers: string[]; statuses: string[]; priorities: string[]; projects: string[]; onlyDue: boolean };
const emptyFilters: MapFilters = { trackers: [], statuses: [], priorities: [], projects: [], onlyDue: false };

export function MapPage() {
  const query = useCallback(() => db.issues.where('active').equals(1).toArray(), []);
  const records = useDexieLive(query, []);
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [scope, setScope] = useState<MapScope>('mine');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(emptyFilters);
  const [visibleIssues, setVisibleIssues] = useState<RedmineIssue[]>([]);
  const [visibleLoaded, setVisibleLoaded] = useState(false);

  useEffect(() => {
    void getSetting<MapScope>('mapScope', 'mine').then(setScope);
    void getSetting<MapFilters>('mapFilters', emptyFilters).then((stored) => setFilters({ ...emptyFilters, ...stored }));
  }, []);
  useEffect(() => {
    if (scope !== 'visible') return;
    if (!navigator.onLine) {
      setVisibleLoaded(false);
      setError('Offline: Die Karte zeigt vorübergehend nur deine gecachten Aufträge.');
      return;
    }
    let disposed = false;
    void api.visibleIssues().then((result) => {
      if (disposed) return;
      setVisibleIssues(result.issues);
      setVisibleLoaded(true);
      setError('');
    }).catch(() => {
      if (!disposed) setError('Alle sichtbaren Aufträge konnten nicht geladen werden. Deine gecachten Aufträge bleiben verfügbar.');
    });
    return () => { disposed = true; };
  }, [scope]);

  const available = useMemo(() => scope === 'visible' && visibleLoaded ? visibleIssues : records.map((record) => record.data),
    [scope, visibleLoaded, visibleIssues, records]);
  const filterOptions = useMemo(() => {
    const values = (getter: (issue: RedmineIssue) => string) => [...new Set(available.map(getter))].sort((a, b) => a.localeCompare(b, 'de'));
    return { trackers: values((item) => item.tracker.name), statuses: values((item) => item.status.name),
      priorities: values((item) => item.priority.name), projects: values((item) => item.project.name) };
  }, [available]);
  const issues = useMemo(() => available.filter((item) =>
    (!filters.trackers.length || filters.trackers.includes(item.tracker.name)) &&
    (!filters.statuses.length || filters.statuses.includes(item.status.name)) &&
    (!filters.priorities.length || filters.priorities.includes(item.priority.name)) &&
    (!filters.projects.length || filters.projects.includes(item.project.name)) &&
    (!filters.onlyDue || ['red', 'orange'].includes(dueInfo(item.due_date).color))
  ), [available, filters]);
  const mappedCount = useMemo(() => issues.filter((issue) => Boolean(issueCoordinates(issue))).length, [issues]);
  const missingCount = issues.length - mappedCount;
  const activeCount = filters.trackers.length + filters.statuses.length + filters.priorities.length + filters.projects.length + Number(filters.onlyDue);
  const setMapFilters = (next: MapFilters) => { setFilters(next); void setSetting('mapFilters', next); };

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    let disposed = false;
    let loadTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const markReady = () => {
      if (disposed) return;
      if (loadTimer) window.clearTimeout(loadTimer);
      setMapReady(true);
      setMapLoading(false);
      window.requestAnimationFrame(() => mapRef.current?.resize());
    };

    try {
      // A local raster style object avoids the remote vector-style JSON request entirely.
      // This remains the default even when an old deployment .env still has MAP_STYLE_URL
      // pointing at the legacy basemap.de vector style.
      const map = new Map({
        container: mapNode.current,
        style: BASEMAP_RASTER_STYLE,
        center: OTTERBACH_OTTERBERG_CENTER,
        zoom: 11,
        attributionControl: {},
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      map.once('load', markReady);
      map.once('style.load', markReady);
      map.on('error', (event) => {
        if (disposed) return;
        const message = event.error instanceof Error ? event.error.message : 'Netzwerk- oder Grafikfehler';
        setMapLoading(false);
        setError(`Kartenkacheln konnten nicht geladen werden: ${message}. Bitte Internetverbindung und Kartenhost prüfen.`);
      });
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(mapNode.current);
      }
      window.requestAnimationFrame(() => map.resize());
      loadTimer = window.setTimeout(() => {
        if (!disposed && !map.isStyleLoaded()) {
          setMapLoading(false);
          setError('Die Rasterkarte konnte nicht initialisiert werden. Bitte Browser und Verbindung prüfen.');
        }
      }, 9000);
    } catch (initializationError) {
      setMapLoading(false);
      setError(initializationError instanceof Error
        ? `Karte konnte nicht gestartet werden: ${initializationError.message}`
        : 'Karte konnte auf diesem Gerät nicht gestartet werden.');
    }

    return () => {
      disposed = true;
      if (loadTimer) window.clearTimeout(loadTimer);
      resizeObserver?.disconnect();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const markers: Marker[] = [];
    const bounds: Array<[number, number]> = [];
    for (const issue of issues) {
      const coords = issueCoordinates(issue);
      if (!coords) continue;
      bounds.push(coords);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'issue-map-marker';
      el.ariaLabel = `Auftrag ${issue.id}: ${issue.subject}`;
      el.textContent = String(issue.id);
      el.onclick = () => navigate(`/issues/${issue.id}`);
      markers.push(new Marker({ element: el }).setLngLat(coords).addTo(map));
    }
    if (bounds.length === 0) {
      map.easeTo({ center: OTTERBACH_OTTERBERG_CENTER, zoom: 11, duration: 350 });
    } else if (bounds.length === 1) {
      map.easeTo({ center: bounds[0], zoom: 15, duration: 350 });
    } else {
      // When there are several jobs, show all of them, rather than only the last map center.
      const west = Math.min(...bounds.map(([lon]) => lon));
      const east = Math.max(...bounds.map(([lon]) => lon));
      const south = Math.min(...bounds.map(([, lat]) => lat));
      const north = Math.max(...bounds.map(([, lat]) => lat));
      map.fitBounds([[west, south], [east, north]], { padding: 54, maxZoom: 14, duration: 350 });
    }
    window.requestAnimationFrame(() => map.resize());
    return () => markers.forEach((marker) => marker.remove());
  }, [issues, navigate, mapReady]);

  const changeScope = (value: string) => {
    const next = value as MapScope;
    setScope(next);
    void setSetting('mapScope', next);
  };

  const locate = () => {
    if (!navigator.geolocation) { setError('Standort ist auf diesem Gerät nicht verfügbar.'); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      const map = mapRef.current;
      if (!map) return;
      const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
      userMarkerRef.current?.remove();
      const el = document.createElement('div');
      el.className = 'user-map-marker';
      el.setAttribute('aria-label', 'Meine Position');
      userMarkerRef.current = new Marker({ element: el }).setLngLat(coords).addTo(map);
      map.flyTo({ center: coords, zoom: 15 });
      setError('');
    }, () => setError('Standort konnte nicht gelesen werden.'), { enableHighAccuracy: true, timeout: 10_000 });
  };

  return <Stack gap="md">
    <Group justify="space-between" align="flex-end" className="page-heading">
      <Box>
        <Text className="page-kicker">Aufträge in deiner Nähe</Text>
        <Title order={1} size="h2">Einsatzkarte</Title>
        <Text className="page-subtitle" mt={4}>Otterbach–Otterberg · basemap.de Raster</Text>
      </Box>
      <Group gap="xs" wrap="nowrap">
        <Badge variant="light" color="brand" size="lg" leftSection={<UIIcon name="pin" size={13} />}>{mappedCount} Orte</Badge>
        <ActionIcon size={48} variant="filled" onClick={locate} aria-label="Meine Position anzeigen"><UIIcon name="pin" size={22} /></ActionIcon>
      </Group>
    </Group>

    <Paper p="sm" withBorder className="map-toolbar">
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap" align="center">
          <SegmentedControl style={{ flex: 1, minWidth: 0 }} size="sm" fullWidth
            value={scope} onChange={changeScope}
            data={[{ value: 'mine', label: 'Meine Arbeit' }, { value: 'visible', label: 'Alle sichtbaren' }]} />
          <Button px={12} variant={activeCount ? 'filled' : 'light'} size="md"
            leftSection={<UIIcon name="filter" size={18} />}
            rightSection={<UIIcon name={filterOpen ? 'chevron-left' : 'sliders'} size={15} />}
            aria-expanded={filterOpen} aria-controls="map-filter-options"
            onClick={() => setFilterOpen((opened) => !opened)}>
            Filter{activeCount ? ` (${activeCount})` : ''}
          </Button>
        </Group>
        {activeCount > 0 && !filterOpen && <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed">{issues.length} von {available.length} Aufträgen ausgewählt</Text>
          <Button variant="subtle" color="gray" size="compact-xs" onClick={() => setMapFilters(emptyFilters)}>Filter löschen</Button>
        </Group>}
        <Collapse expanded={filterOpen}>
          <Stack gap="sm" pt="sm" id="map-filter-options">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <MultiSelect label="Tracker" placeholder="Alle Tracker" searchable clearable
                data={filterOptions.trackers} value={filters.trackers}
                onChange={(trackers) => setMapFilters({ ...filters, trackers })} />
              <MultiSelect label="Status" placeholder="Alle Status" searchable clearable
                data={filterOptions.statuses} value={filters.statuses}
                onChange={(statuses) => setMapFilters({ ...filters, statuses })} />
              <MultiSelect label="Priorität" placeholder="Alle Prioritäten" searchable clearable
                data={filterOptions.priorities} value={filters.priorities}
                onChange={(priorities) => setMapFilters({ ...filters, priorities })} />
              <MultiSelect label="Projekt" placeholder="Alle Projekte" searchable clearable
                data={filterOptions.projects} value={filters.projects}
                onChange={(projects) => setMapFilters({ ...filters, projects })} />
            </SimpleGrid>
            <Group justify="space-between" align="center" gap="sm" wrap="wrap">
              <Button variant={filters.onlyDue ? 'filled' : 'default'} size="sm"
                onClick={() => setMapFilters({ ...filters, onlyDue: !filters.onlyDue })}
                leftSection={<UIIcon name="calendar" size={17} />}>
                Heute oder überfällig
              </Button>
              <Group gap="xs">
                <Button variant="subtle" color="gray" size="sm" onClick={() => setMapFilters(emptyFilters)}>Zurücksetzen</Button>
                <Button variant="light" size="sm" onClick={() => setFilterOpen(false)}>Karte anzeigen</Button>
              </Group>
            </Group>
          </Stack>
        </Collapse>
      </Stack>
    </Paper>

    {error && <Alert color="orange" variant="light">{error}</Alert>}
    {mappedCount === 0 && <Alert color="blue" variant="light" title="Keine Aufträge mit Koordinaten">Die Basiskarte zeigt Otterbach–Otterberg. Entferne bei Bedarf Kartenfilter oder ergänze Koordinaten in Redmine.</Alert>}
    {mappedCount > 0 && missingCount > 0 && <Text size="xs" c="dimmed">{missingCount} weitere Aufträge ohne Koordinaten werden nicht als Marker dargestellt.</Text>}

    <Paper withBorder p={0} className="map-shell" pos="relative">
      {mapLoading && <Box pos="absolute" inset={0} style={{ zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(140deg,#e7f1f1,#eef5f7)' }}>
        <Stack h="100%" align="center" justify="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" fw={700} c="brand.8">Kartenmaterial wird geladen …</Text>
        </Stack>
      </Box>}
      <div ref={mapNode} style={{ width: '100%', height: '100%', minHeight: 430 }} />
    </Paper>
    <Group justify="center" gap={6} c="dimmed"><UIIcon name="shield" size={15} /><Text size="xs">Dein Standort bleibt auf diesem Gerät und wird nicht an Redmine übertragen.</Text></Group>
  </Stack>;
}
