import { Alert, Button, Card, Checkbox, Group, Modal, NumberInput, Progress, Stack, Switch, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { clearBusinessData, getSetting, setSetting } from '../db';
import { boundsAround, prefetchOfflineMap } from '../mapOffline';
import type { NamedRef, PublicConfig } from '../types';

export function SettingsPage() {
  const [retention, setRetention] = useState(30);
  const [trackers, setTrackers] = useState<NamedRef[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [offlineMaps, setOfflineMaps] = useState(false);
  const [mapProgress, setMapProgress] = useState<[number, number]>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [config, setConfig] = useState<PublicConfig>({ mapStyleUrl: '', mapCenter: [7.77, 49.5], offlineMapRadiusKm: 12, pollIntervalMs: 120000 });
  useEffect(() => { void (async () => {
    setRetention(await getSetting('retentionDays', 30)); setExcluded(await getSetting('excludedTrackers', [])); setOfflineMaps(await getSetting('offlineMaps', false));
    const cached = await getSetting<NamedRef[]>('cachedTrackers', []); setTrackers(cached);
    if (navigator.onLine) {
      try { const meta = await api.meta<{ trackers: NamedRef[] }>('trackers'); setTrackers(meta.trackers); await setSetting('cachedTrackers', meta.trackers); } catch { /* cache remains */ }
      try { setConfig(await api.config()); } catch { /* defaults */ }
    }
  })(); }, []);
  const toggleTracker = async (id: number, checked: boolean) => { const next = checked ? excluded.filter((x) => x !== id) : [...excluded, id]; setExcluded(next); await setSetting('excludedTrackers', next); };
  const downloadMap = async () => {
    const bounds = config.offlineMapBounds ?? boundsAround(config.mapCenter, config.offlineMapRadiusKm);
    try { const total = await prefetchOfflineMap(bounds, (done, count) => setMapProgress([done, count])); notifications.show({ message: `${total} Kartenressourcen offline gespeichert`, color: 'green' }); }
    catch (error) { notifications.show({ message: error instanceof Error ? error.message : 'Offlinekarte fehlgeschlagen', color: 'red' }); }
    finally { setMapProgress(undefined); }
  };
  return <Stack maw={760} mx="auto"><div><Title order={1} size="h2">Einstellungen</Title><Text c="dimmed">Offline, Anzeige und Gerät</Text></div>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Offline-Daten</Text><NumberInput label="Abgeschlossene/nicht mehr zugewiesene Aufträge behalten" description="Tage, Standard 30" min={1} max={180} value={retention} onChange={(value) => { const next = typeof value === 'number' ? value : 30; setRetention(next); void setSetting('retentionDays', next); }} /><Button variant="light" color="red" onClick={() => setConfirmClear(true)}>Offline-Daten jetzt löschen</Button></Stack></Card>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Tracker</Text><Text size="sm" c="dimmed">Alle Tracker werden unterstützt. Hier kannst du einzelne aus „Meine Arbeit“ ausblenden.</Text>{trackers.map((tracker) => <Checkbox key={tracker.id} checked={!excluded.includes(tracker.id)} onChange={(e) => void toggleTracker(tracker.id, e.currentTarget.checked)} label={tracker.name} />)}</Stack></Card>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Offline-Karte</Text><Switch checked={offlineMaps} onChange={(e) => { setOfflineMaps(e.currentTarget.checked); void setSetting('offlineMaps', e.currentTarget.checked); }} label="Kartenbereich offline vorladen" description="Standardmäßig deaktiviert" />{offlineMaps && <><Alert color="blue" variant="light">Es wird die konfigurierte Verwaltungsgrenze verwendet; falls keine gesetzt ist, ein Radius von {config.offlineMapRadiusKm} km um das Standardgebiet.</Alert><Button onClick={() => void downloadMap()} disabled={!navigator.onLine || Boolean(mapProgress)}>Offlinekarte laden/aktualisieren</Button>{mapProgress && <Progress value={mapProgress[1] ? mapProgress[0] / mapProgress[1] * 100 : 0} animated />}</>}</Stack></Card>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Benachrichtigungen</Text><Alert color="yellow" variant="light">Änderungen werden bei geöffneter App über den 120-Sekunden-Sync erkannt. Echtes Web-Push bei vollständig geschlossener App benötigt einen dauerhaften Push-Subscription-/Event-Dienst und ist deshalb nicht Teil des zustandslosen Kernservers.</Alert></Stack></Card>
    <Modal opened={confirmClear} onClose={() => setConfirmClear(false)} title="Offline-Daten löschen?" centered><Stack><Text>Alle lokal gecachten Aufträge, Anhänge und noch nicht synchronisierten Änderungen werden von diesem Gerät gelöscht. Redmine-Daten bleiben unverändert.</Text><Group grow><Button variant="default" onClick={() => setConfirmClear(false)}>Abbrechen</Button><Button color="red" onClick={() => void clearBusinessData().then(() => { setConfirmClear(false); notifications.show({ message: 'Offline-Daten gelöscht' }); })}>Löschen</Button></Group></Stack></Modal>
  </Stack>;
}
