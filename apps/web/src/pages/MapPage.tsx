import { ActionIcon, Alert, Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Map, Marker, NavigationControl } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { db } from '../db';
import { useDexieLive } from '../live';
import { issueCoordinates } from '../issueUtils';

const DEFAULT_STYLE = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json';

export function MapPage() {
  const query = useCallback(() => db.issues.where('active').equals(1).toArray(), []);
  const records = useDexieLive(query, []);
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    let disposed = false;
    void api.config().catch(() => ({ mapStyleUrl: DEFAULT_STYLE, mapCenter: [7.77, 49.5] as [number, number] })).then((config) => {
      if (disposed || !mapNode.current || mapRef.current) return;
      const map = new Map({ container: mapNode.current, style: config.mapStyleUrl || DEFAULT_STYLE, center: config.mapCenter, zoom: 11, attributionControl: true });
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
    });
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const markers: Marker[] = [];
    for (const record of records) {
      const coords = issueCoordinates(record.data); if (!coords) continue;
      const el = document.createElement('button'); el.type = 'button'; el.ariaLabel = `Auftrag ${record.data.id}: ${record.data.subject}`; el.textContent = String(record.data.id); el.style.cssText = 'min-width:36px;height:36px;border:3px solid white;border-radius:18px;background:#1c5d99;color:white;font-weight:800;box-shadow:0 2px 8px #0005;padding:0 8px;';
      el.onclick = () => navigate(`/issues/${record.data.id}`);
      markers.push(new Marker({ element: el }).setLngLat(coords).addTo(map));
    }
    return () => markers.forEach((m) => m.remove());
  }, [records, navigate]);
  const locate = () => {
    if (!navigator.geolocation) { setError('Standort ist auf diesem Gerät nicht verfügbar.'); return; }
    navigator.geolocation.getCurrentPosition((position) => { mapRef.current?.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 15 }); setError(''); }, () => setError('Standort konnte nicht gelesen werden.'), { enableHighAccuracy: true, timeout: 10_000 });
  };
  return <Stack gap="md"><Group justify="space-between"><Box><Title order={1} size="h2">Karte</Title><Text c="dimmed">Offene Aufträge mit Koordinaten</Text></Box><ActionIcon size={48} variant="light" onClick={locate} aria-label="Meine Position">⌖</ActionIcon></Group>{error && <Alert color="orange">{error}</Alert>}<Paper withBorder radius="lg" p={0} className="map-shell"><div ref={mapNode} style={{ width: '100%', height: '100%' }} /></Paper><Text size="xs" c="dimmed">Deine aktuelle Position bleibt ausschließlich auf diesem Gerät.</Text></Stack>;
}
