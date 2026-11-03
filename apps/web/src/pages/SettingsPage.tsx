import { Alert, Button, Card, Checkbox, Group, Modal, NumberInput, Progress, Stack, Switch, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { clearBusinessData, db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { boundsAround, prefetchOfflineMap } from '../mapOffline';
import type { NamedRef, PublicConfig } from '../types';

type NotificationPreferences = { assignment: boolean; status: boolean; comment: boolean; priority: boolean; dates: boolean };
const DEFAULT_NOTIFICATIONS: NotificationPreferences = { assignment: true, status: true, comment: true, priority: true, dates: true };

export function SettingsPage() {
  const pendingCount = useDexieLive(useCallback(() => db.outbox.count(), []), 0);
  const [retention, setRetention] = useState(30);
  const [trackers, setTrackers] = useState<NamedRef[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [offlineMaps, setOfflineMaps] = useState(false);
  const [mapProgress, setMapProgress] = useState<[number, number]>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS);
  const [config, setConfig] = useState<PublicConfig>({ mapStyleUrl: '', mapCenter: [7.77, 49.5], offlineMapRadiusKm: 12, pollIntervalMs: 120000 });

  useEffect(() => { void (async () => {
    setRetention(await getSetting('retentionDays', 30));
    setExcluded(await getSetting('excludedTrackers', []));
    setOfflineMaps(await getSetting('offlineMaps', false));
    setNotificationPrefs(await getSetting('notificationPreferences', DEFAULT_NOTIFICATIONS));
    const cached = await getSetting<NamedRef[]>('cachedTrackers', []); setTrackers(cached);
    if (navigator.onLine) {
      try { const meta = await api.meta<{ trackers: NamedRef[] }>('trackers'); setTrackers(meta.trackers); await setSetting('cachedTrackers', meta.trackers); } catch { /* cache remains */ }
      try { setConfig(await api.config()); } catch { /* defaults */ }
    }
  })(); }, []);

  const toggleTracker = async (id: number, checked: boolean) => { const next = checked ? excluded.filter((value) => value !== id) : [...excluded, id]; setExcluded(next); await setSetting('excludedTrackers', next); };
  const setNotification = async (key: keyof NotificationPreferences, value: boolean) => {
    const next = { ...notificationPrefs, [key]: value };
    setNotificationPrefs(next); await setSetting('notificationPreferences', next);
  };
  const downloadMap = async () => {
    const bounds = config.offlineMapBounds ?? boundsAround(config.mapCenter, config.offlineMapRadiusKm);
    try { const total = await prefetchOfflineMap(bounds, (done, count) => setMapProgress([done, count])); notifications.show({ message: `${total} Kartenressourcen offline gespeichert`, color: 'green' }); }
    catch (error) { notifications.show({ message: error instanceof Error ? error.message : 'Offlinekarte fehlgeschlagen', color: 'red' }); }
    finally { setMapProgress(undefined); }
  };
  const logout = async () => {
    if (navigator.onLine) await api.logout().catch(() => undefined);
    await setSetting('locallyLoggedOut', true);
    await setSetting('lastUser', null);
    await clearBusinessData();
    window.location.replace('/');
  };

  return <Stack maw={760} mx="auto"><div><Title order={1} size="h2">Einstellungen</Title><Text c="dimmed">Offline, Anzeige und Gerät</Text></div>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Offline-Daten</Text><NumberInput label="Abgeschlossene/nicht mehr zugewiesene Aufträge behalten" description="Tage, Standard 30" min={1} max={180} value={retention} onChange={(value) => { const next = typeof value === 'number' ? value : 30; setRetention(next); void setSetting('retentionDays', next); }} /><Button variant="light" color="red" onClick={() => setConfirmClear(true)}>Offline-Daten jetzt löschen</Button></Stack></Card>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Tracker</Text><Text size="sm" c="dimmed">Alle Tracker werden unterstützt. Hier kannst du einzelne aus „Meine Arbeit“ ausblenden.</Text>{trackers.map((tracker) => <Checkbox key={tracker.id} checked={!excluded.includes(tracker.id)} onChange={(event) => void toggleTracker(tracker.id, event.currentTarget.checked)} label={tracker.name} />)}</Stack></Card>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Offline-Karte</Text><Switch checked={offlineMaps} onChange={(event) => { setOfflineMaps(event.currentTarget.checked); void setSetting('offlineMaps', event.currentTarget.checked); }} label="Kartenbereich offline vorladen" description="Standardmäßig deaktiviert" />{offlineMaps && <><Alert color="blue" variant="light">Es wird die konfigurierte Verwaltungsgrenze verwendet; falls keine gesetzt ist, ein Radius von {config.offlineMapRadiusKm} km um das Standardgebiet.</Alert><Button onClick={() => void downloadMap()} disabled={!navigator.onLine || Boolean(mapProgress)}>Offlinekarte laden/aktualisieren</Button>{mapProgress && <Progress value={mapProgress[1] ? mapProgress[0] / mapProgress[1] * 100 : 0} animated />}</>}</Stack></Card>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Benachrichtigungen</Text><Switch checked={notificationPrefs.assignment} onChange={(event) => void setNotification('assignment', event.currentTarget.checked)} label="Neue Zuweisungen" /><Switch checked={notificationPrefs.status} onChange={(event) => void setNotification('status', event.currentTarget.checked)} label="Statusänderungen" /><Switch checked={notificationPrefs.comment} onChange={(event) => void setNotification('comment', event.currentTarget.checked)} label="Neue Kommentare" /><Switch checked={notificationPrefs.priority} onChange={(event) => void setNotification('priority', event.currentTarget.checked)} label="Prioritätsänderungen" /><Switch checked={notificationPrefs.dates} onChange={(event) => void setNotification('dates', event.currentTarget.checked)} label="Termin-/Fälligkeitsänderungen" /><Alert color="yellow" variant="light">Diese Präferenzen sind für die Push-Integration vorbereitet. Bei geöffneter App erkennt der 120-Sekunden-Sync Änderungen. Push bei vollständig geschlossener App benötigt wegen des bewusst zustandslosen Kerns einen separaten dauerhaften Push-/Event-Adapter.</Alert></Stack></Card>
    <Card withBorder radius="lg"><Stack><Text fw={800}>Konto</Text><Text size="sm" c="dimmed">Das Gerät ist persönlich zugeordnet. Beim Abmelden werden die Offline-Arbeitsdaten dieses Kontos vom Gerät entfernt.</Text><Button variant="light" color="red" onClick={() => setConfirmLogout(true)}>Abmelden</Button></Stack></Card>

    <Modal opened={confirmClear} onClose={() => setConfirmClear(false)} title="Offline-Daten löschen?" centered><Stack><Text>Alle lokal gecachten Aufträge, Anhänge und noch nicht synchronisierten Änderungen werden von diesem Gerät gelöscht. Redmine-Daten bleiben unverändert.</Text>{pendingCount > 0 && <Alert color="red">Achtung: {pendingCount} noch nicht synchronisierte Änderung(en) würden verloren gehen.</Alert>}<Group grow><Button variant="default" onClick={() => setConfirmClear(false)}>Abbrechen</Button><Button color="red" onClick={() => void clearBusinessData().then(() => { setConfirmClear(false); notifications.show({ message: 'Offline-Daten gelöscht' }); })}>Löschen</Button></Group></Stack></Modal>
    <Modal opened={confirmLogout} onClose={() => setConfirmLogout(false)} title="Abmelden?" centered><Stack><Text>Die Sitzung wird beendet und alle gecachten Arbeitsdaten werden lokal gelöscht.</Text>{pendingCount > 0 && <Alert color="red">{pendingCount} Änderung(en) sind noch nicht synchronisiert. Synchronisiere sie zuerst, wenn sie erhalten bleiben sollen.</Alert>}<Group grow><Button variant="default" onClick={() => setConfirmLogout(false)}>Abbrechen</Button><Button color="red" disabled={pendingCount > 0} onClick={() => void logout()}>Abmelden</Button></Group></Stack></Modal>
  </Stack>;
}
