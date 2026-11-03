import { ActionIcon, Alert, Badge, Box, Group, Loader, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { Map, Marker, NavigationControl, type StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { issueCoordinates } from '../issueUtils';
import type { RedmineIssue } from '../types';

const DEFAULT_STYLE = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json';
const OTTERBACH_OTTERBERG_CENTER: [number, number] = [7.7546, 49.4944];
const FALLBACK_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png'],
      tileSize: 256,
      attribution: '© basemap.de / BKG',
    },
  },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
};
type MapScope = 'mine' | 'visible';

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
  const [usingRasterFallback, setUsingRasterFallback] = useState(false);
  const [scope, setScope] = useState<MapScope>('mine');
  const [visibleIssues, setVisibleIssues] = useState<RedmineIssue[]>([]);
  const [visibleLoaded, setVisibleLoaded] = useState(false);

  useEffect(() => { void getSetting<MapScope>('mapScope', 'mine').then(setScope); }, []);
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

  const issues = useMemo(() => scope === 'visible' && visibleLoaded ? visibleIssues : records.map((record) => record.data), [scope, visibleLoaded, visibleIssues, records]);
  const mappedCount = useMemo(() => issues.filter((issue) => Boolean(issueCoordinates(issue))).length, [issues]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    let disposed = false;
    let fallbackApplied = false;
    let loadTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const markReady = () => {
      if (disposed) return;
      if (loadTimer) window.clearTimeout(loadTimer);
      setMapReady(true);
      setMapLoading(false);
      window.requestAnimationFrame(() => mapRef.current?.resize());
    };

    const applyRasterFallback = (reason: string) => {
      const map = mapRef.current;
      if (!map || fallbackApplied || disposed) return;
      fallbackApplied = true;
      setUsingRasterFallback(true);
      setError(`Vektorkarte konnte nicht geladen werden (${reason}). DerKumpel verwendet die basemap.de-Rasterkarte.`);
      try {
        map.setStyle(FALLBACK_RASTER_STYLE);
        window.requestAnimationFrame(() => map.resize());
      } catch {
        setMapLoading(false);
        setError('Die Karte konnte auf diesem Gerät nicht initialisiert werden. Bitte Browser/WebView und Grafikbeschleunigung prüfen.');
      }
    };

    void api.config().catch(() => ({ mapStyleUrl: DEFAULT_STYLE, mapCenter: OTTERBACH_OTTERBERG_CENTER })).then((config) => {
      if (disposed || !mapNode.current || mapRef.current) return;
      try {
        const map = new Map({
          container: mapNode.current,
          style: config.mapStyleUrl || DEFAULT_STYLE,
          center: OTTERBACH_OTTERBERG_CENTER,
          zoom: 11,
          attributionControl: {},
        });
        mapRef.current = map;
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        map.on('load', markReady);
        map.on('style.load', markReady);
        map.on('error', (event) => {
          if (!map.isStyleLoaded() && !fallbackApplied) {
            const message = event.error instanceof Error ? event.error.message : 'Style-Fehler';
            applyRasterFallback(message);
          }
        });

        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(mapNode.current);
        window.requestAnimationFrame(() => map.resize());
        loadTimer = window.setTimeout(() => {
          if (!map.isStyleLoaded()) applyRasterFallback('Zeitüberschreitung beim Kartenstil');
        }, 6500);
      } catch (initializationError) {
        setMapLoading(false);
        setError(initializationError instanceof Error
          ? `Karte konnte nicht gestartet werden: ${initializationError.message}`
          : 'Karte konnte auf diesem Gerät nicht gestartet werden.');
      }
    });

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
        <Title order={1} size="h2" style={{ letterSpacing: '-0.025em' }}>Karte</Title>
        <Text c="dimmed" size="sm" mt={3}>Aufträge mit Koordinaten · Fallback-Zentrum Otterbach–Otterberg</Text>
      </Box>
      <Group gap="xs" wrap="nowrap">
        <Badge variant="light" color={usingRasterFallback ? 'orange' : 'blue'} size="lg">{usingRasterFallback ? 'Raster' : `${mappedCount} Orte`}</Badge>
        <ActionIcon size={48} variant="filled" onClick={locate} aria-label="Meine Position anzeigen">⌖</ActionIcon>
      </Group>
    </Group>

    <Paper p={4} withBorder className="surface-card">
      <SegmentedControl fullWidth value={scope} onChange={changeScope} data={[{ value: 'mine', label: 'Meine Arbeit' }, { value: 'visible', label: 'Alle sichtbaren' }]} />
    </Paper>

    {error && <Alert color="orange" variant="light">{error}</Alert>}
    {mappedCount === 0 && <Alert color="blue" variant="light" title="Keine Ticket-Koordinaten">Die Karte bleibt sichtbar und ist auf Otterbach–Otterberg zentriert. Sobald Tickets Koordinaten enthalten, erscheinen sie hier automatisch.</Alert>}

    <Paper withBorder p={0} className="map-shell" pos="relative">
      {mapLoading && <Box pos="absolute" inset={0} style={{ zIndex: 2, pointerEvents: 'none' }}>
        <Stack h="100%" align="center" justify="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Karte wird geladen …</Text>
        </Stack>
      </Box>}
      <div ref={mapNode} style={{ width: '100%', height: '100%', minHeight: 430 }} />
    </Paper>
    <Text size="xs" c="dimmed" ta="center">Deine aktuelle Position bleibt ausschließlich auf diesem Gerät und wird nicht an Redmine übertragen.</Text>
  </Stack>;
}
