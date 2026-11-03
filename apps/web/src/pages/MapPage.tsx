import { ActionIcon, Alert, Badge, Box, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { Map, Marker, NavigationControl } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { issueCoordinates } from '../issueUtils';
import type { RedmineIssue } from '../types';

const DEFAULT_STYLE = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json';
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
    void api.config().catch(() => ({ mapStyleUrl: DEFAULT_STYLE, mapCenter: [7.77, 49.5] as [number, number] })).then((config) => {
      if (disposed || !mapNode.current || mapRef.current) return;
      const map = new Map({ container: mapNode.current, style: config.mapStyleUrl || DEFAULT_STYLE, center: config.mapCenter, zoom: 11, attributionControl: {} });
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => { if (!disposed) setMapReady(true); });
      mapRef.current = map;
    });
    return () => {
      disposed = true;
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
    for (const issue of issues) {
      const coords = issueCoordinates(issue);
      if (!coords) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'issue-map-marker';
      el.ariaLabel = `Auftrag ${issue.id}: ${issue.subject}`;
      el.textContent = String(issue.id);
      el.onclick = () => navigate(`/issues/${issue.id}`);
      markers.push(new Marker({ element: el }).setLngLat(coords).addTo(map));
    }
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
        <Text c="dimmed" size="sm" mt={3}>Offene Aufträge mit hinterlegten Koordinaten</Text>
      </Box>
      <Group gap="xs" wrap="nowrap">
        <Badge variant="light" color="blue" size="lg">{mappedCount} Orte</Badge>
        <ActionIcon size={48} variant="filled" onClick={locate} aria-label="Meine Position anzeigen">⌖</ActionIcon>
      </Group>
    </Group>

    <Paper p={4} withBorder className="surface-card">
      <SegmentedControl fullWidth value={scope} onChange={changeScope} data={[{ value: 'mine', label: 'Meine Arbeit' }, { value: 'visible', label: 'Alle sichtbaren' }]} />
    </Paper>

    {error && <Alert color="orange" variant="light">{error}</Alert>}
    {mappedCount === 0 && <Alert color="blue" variant="light">In dieser Auswahl haben aktuell keine Aufträge verwertbare Koordinaten.</Alert>}

    <Paper withBorder p={0} className="map-shell"><div ref={mapNode} style={{ width: '100%', height: '100%' }} /></Paper>
    <Text size="xs" c="dimmed" ta="center">Deine aktuelle Position bleibt ausschließlich auf diesem Gerät und wird nicht an Redmine übertragen.</Text>
  </Stack>;
}
