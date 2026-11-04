import { ActionIcon, Alert, Badge, Box, Button, Collapse, Group, Loader, MultiSelect, Paper, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Map, Marker, NavigationControl } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { issueCoordinates } from '../issueUtils';
import { BASEMAP_RASTER_STYLE, OTTERBACH_OTTERBERG_CENTER } from '../mapStyle';
import type { RedmineIssue } from '../types';
import { UIIcon } from '../components/UIIcon';

type MapScope = 'mine' | 'visible';
type MapFilters = { statuses: string[]; trackers: string[]; priorities: string[]; projects: string[] };
const EMPTY_FILTERS: MapFilters = { statuses: [], trackers: [], priorities: [], projects: [] };

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
  const [visibleIssues, setVisibleIssues] = useState<RedmineIssue[]>([]);
  const [visibleLoaded, setVisibleLoaded] = useState(false);

  useEffect(() => {
    void getSetting<MapScope>('mapScope', 'mine').then(setScope);
    void getSetting<MapFilters>('mapFilters', EMPTY_FILTERS).then(setFilters);
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

  const sourceIssues = useMemo(() => scope === 'visible' && visibleLoaded
    ? visibleIssues : records.map((record) => record.data), [scope, visibleLoaded, visibleIssues, records]);
  const options = useMemo(() => ({
    statuses: [...new Set(sourceIssues.map((issue) => issue.status.name))].sort(),
    trackers: [...new Set(sourceIssues.map((issue) => issue.tracker.name))].sort(),
    priorities: [...new Set(sourceIssues.map((issue) => issue.priority.name))].sort(),
    projects: [...new Set(sourceIssues.map((issue) => issue.project.name))].sort(),
  }), [sourceIssues]);
  const issues = useMemo(() => sourceIssues.filter((issue) =>
    (!filters.statuses.length || filters.statuses.includes(issue.status.name)) &&
    (!filters.trackers.length || filters.trackers.includes(issue.tracker.name)) &&
    (!filters.priorities.length || filters.priorities.includes(issue.priority.name)) &&
    (!filters.projects.length || filters.projects.includes(issue.project.name))
  ), [sourceIssues, filters]);
  const mappedCount = useMemo(() => issues.filter((issue) => Boolean(issueCoordinates(issue))).length, [issues]);
  const activeFilters = Object.values(filters).reduce((sum, values) => sum + values.length, 0);
  const changeFilter = (name: keyof MapFilters, values: string[]) => {
    const next = { ...filters, [name]: values };
    setFilters(next);
    void setSetting('mapFilters', next);
  };
  const resetFilters = () => { setFilters(EMPTY_FILTERS); void setSetting('mapFilters', EMPTY_FILTERS); };


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
        <Group justify="space-between" align="center" wrap="nowrap">
          <Box>
            <Text fw={800} size="sm">Kartenauswahl</Text>
            <Text size="xs" c="dimmed">{issues.length} passende Tickets · {mappedCount} mit Standort</Text>
          </Box>
          <Button size="sm" variant={activeFilters ? 'filled' : 'light'}
            leftSection={<UIIcon name="filter" size={17} />}
            rightSection={<UIIcon name={filtersOpen ? 'chevron-left' : 'chevron-right'} size={15} />}
            onClick={() => setFiltersOpen((current) => !current)}
            aria-expanded={filtersOpen} aria-controls="map-filters">
            Filter {activeFilters ? `(${activeFilters})` : ''}
          </Button>
        </Group>
        <Box id="map-filters"><Collapse opened={filtersOpen}>
          <Stack gap="sm" pt="xs">
            <SegmentedControl fullWidth size="sm" value={scope} onChange={changeScope}
              data={[{ value: 'mine', label: 'Meine Arbeit' }, { value: 'visible', label: 'Alle sichtbaren' }]}
              aria-label="Auftragsumfang auf der Karte" />
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
              <MultiSelect size="sm" label="Tracker" searchable clearable data={options.trackers}
                value={filters.trackers} onChange={(values) => changeFilter('trackers', values)} placeholder="Alle Tracker" />
              <MultiSelect size="sm" label="Status" searchable clearable data={options.statuses}
                value={filters.statuses} onChange={(values) => changeFilter('statuses', values)} placeholder="Alle Status" />
              <MultiSelect size="sm" label="Prioritäten" searchable clearable data={options.priorities}
                value={filters.priorities} onChange={(values) => changeFilter('priorities', values)} placeholder="Alle Prioritäten" />
              <MultiSelect size="sm" label="Projekte" searchable clearable data={options.projects}
                value={filters.projects} onChange={(values) => changeFilter('projects', values)} placeholder="Alle Projekte" />
            </SimpleGrid>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Gespeichert auf diesem Gerät</Text>
              <Button size="compact-sm" variant="subtle" color="gray" disabled={!activeFilters}
                onClick={resetFilters}>Zurücksetzen</Button>
            </Group>
          </Stack>
        </Collapse></Box>
      </Stack>
    </Paper>

    {error && <Alert color="orange" variant="light">{error}</Alert>}
    {mappedCount === 0 && <Alert color="blue" variant="light" title="Keine Standorte in dieser Auswahl">Die Karte bleibt auf Otterbach–Otterberg zentriert. Prüfe die Filter oder die Koordinaten der Tickets.</Alert>}

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
