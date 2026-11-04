import { Alert, Box, Button, Card, Checkbox, Group, Modal, NumberInput, Progress, SimpleGrid, Stack, Switch, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { clearBusinessData, db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { boundsAround, prefetchOfflineMap } from '../mapOffline';
import type { NamedRef, PublicConfig } from '../types';
import { Link } from 'react-router-dom';
import { UIIcon, type IconName } from '../components/UIIcon';
import { DEFAULT_PUSH_PREFERENCES, canUsePush, disableDevicePush, enableDevicePush, readDevicePush, requiresHomeScreenInstall, testDevicePush, updateDevicePushPreferences, type DevicePushStatus, type PushPreferences } from '../push';

type NotificationPreferences = PushPreferences;
const DEFAULT_NOTIFICATIONS = DEFAULT_PUSH_PREFERENCES;

function SectionHeading({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return <Group gap="sm" align="flex-start" wrap="nowrap">
    <ThemeIcon size={40} radius="md" variant="light" color="brand"><UIIcon name={icon} size={21} /></ThemeIcon>
    <Box><Text fw={850}>{title}</Text><Text size="sm" c="dimmed" mt={2}>{description}</Text></Box>
  </Group>;
}

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
  const [pushServerEnabled, setPushServerEnabled] = useState(false);
  const [pushState, setPushState] = useState<DevicePushStatus>();
  const [pushBusy, setPushBusy] = useState(false);
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
      try { setPushServerEnabled((await api.pushConfig()).enabled); } catch { /* remains disabled */ }
      try { setPushState(await readDevicePush()); } catch { /* browser may reject permission calls */ }
    }
  })(); }, []);

  const toggleTracker = async (id: number, checked: boolean) => { const next = checked ? excluded.filter((value) => value !== id) : [...excluded, id]; setExcluded(next); await setSetting('excludedTrackers', next); };
  const setNotification = async (key: keyof NotificationPreferences, value: boolean) => {
    const next = { ...notificationPrefs, [key]: value };
    setNotificationPrefs(next); await setSetting('notificationPreferences', next);
    if (pushState?.registered && navigator.onLine) {
      try { await updateDevicePushPreferences(next); }
      catch { notifications.show({ message: 'Push-Auswahl lokal gespeichert. Zum Abgleichen erneut verbinden.', color: 'orange' }); }
    }
  };
  const enablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const state = await enableDevicePush(notificationPrefs);
      setPushState(state);
      notifications.show({ message: 'Push für dieses Gerät aktiviert', color: 'green' });
    } catch (error) {
      notifications.show({ message: error instanceof Error ? error.message : 'Push konnte nicht aktiviert werden', color: 'red' });
    } finally { setPushBusy(false); }
  };
  const disablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      await disableDevicePush();
      setPushState(await readDevicePush());
      notifications.show({ message: 'Push auf diesem Gerät deaktiviert' });
    } catch (error) {
      notifications.show({ message: error instanceof Error ? error.message : 'Push konnte nicht deaktiviert werden', color: 'red' });
    } finally { setPushBusy(false); }
  };
  const testPush = async () => {
    setPushBusy(true);
    try { await testDevicePush(); notifications.show({ message: 'Testbenachrichtigung angefordert', color: 'green' }); }
    catch (error) { notifications.show({ message: error instanceof Error ? error.message : 'Test fehlgeschlagen', color: 'red' }); }
    finally { setPushBusy(false); }
  };
  const downloadMap = async () => {
    const bounds = config.offlineMapBounds ?? boundsAround(config.mapCenter, config.offlineMapRadiusKm);
    try { const total = await prefetchOfflineMap(bounds, (done, count) => setMapProgress([done, count])); notifications.show({ message: `${total} Kartenressourcen offline gespeichert`, color: 'green' }); }
    catch (error) { notifications.show({ message: error instanceof Error ? error.message : 'Offlinekarte fehlgeschlagen', color: 'red' }); }
    finally { setMapProgress(undefined); }
  };
  const logout = async () => {
    if (pushState?.subscribed) await disableDevicePush().catch(() => undefined);
    if (navigator.onLine) await api.logout().catch(() => undefined);
    await setSetting('locallyLoggedOut', true);
    await setSetting('lastUser', null);
    await clearBusinessData();
    window.location.replace('/');
  };

  return <Stack gap="md" maw={820} mx="auto">
    <Box className="page-heading">
      <Text className="page-kicker">Dein Gerät · deine Arbeit</Text>
      <Title order={1} size="h2">Einstellungen</Title>
      <Text className="page-subtitle" mt={4}>Offline-Modus und persönliche Arbeitsansicht einrichten</Text>
    </Box>

    {pendingCount > 0 && <Alert color="orange" variant="light" title={`${pendingCount} lokale Änderung(en) noch offen`}>Die Änderungen werden auf diesem Gerät geschützt. <Button component={Link} to="/sync" variant="subtle" color="orange" size="compact-sm" rightSection={<UIIcon name="chevron-right" size={14} />}>Zum Sync-Center</Button></Alert>}

    <Card withBorder className="surface-card settings-section">
      <Stack gap="lg">
        <SectionHeading icon="download" title="Offline-Daten" description="Wie lange abgeschlossene oder nicht mehr zugewiesene Aufträge auf dem Gerät bleiben." />
        <NumberInput label="Aufträge lokal behalten" description="Tage nach letzter Zuweisung, Standard 30" min={1} max={180} value={retention} onChange={(value) => { const next = typeof value === 'number' ? value : 30; setRetention(next); void setSetting('retentionDays', next); }} suffix=" Tage" />
        <Button variant="light" color="red" leftSection={<UIIcon name="trash" size={17} />} disabled={pendingCount > 0} onClick={() => setConfirmClear(true)}>Offline-Daten löschen</Button>
      </Stack>
    </Card>

    <Card withBorder className="surface-card">
      <Stack gap="lg">
        <SectionHeading icon="work" title="Arbeitsliste" description="Tracker ausblenden, die du unterwegs nicht in „Meine Arbeit“ brauchst." />
        {trackers.length === 0 ? <Text size="sm" c="dimmed">Noch keine Tracker geladen.</Text> : <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {trackers.map((tracker) => <Checkbox key={tracker.id} checked={!excluded.includes(tracker.id)} onChange={(event) => void toggleTracker(tracker.id, event.currentTarget.checked)} label={tracker.name} />)}
        </SimpleGrid>}
      </Stack>
    </Card>

    <Card withBorder className="surface-card">
      <Stack gap="lg">
        <SectionHeading icon="map" title="Offline-Karte" description="Kartenmaterial für typische Funklöcher vorab auf diesem Gerät speichern." />
        <Switch checked={offlineMaps} onChange={(event) => { setOfflineMaps(event.currentTarget.checked); void setSetting('offlineMaps', event.currentTarget.checked); }} label="Kartenbereich offline vorladen" description="Standardmäßig deaktiviert, um Gerätespeicher zu sparen" />
        {offlineMaps && <Stack gap="sm">
          <Alert color="blue" variant="light">Es wird die konfigurierte Verwaltungsgrenze verwendet; falls keine gesetzt ist, ein Radius von {config.offlineMapRadiusKm} km um das Standardgebiet.</Alert>
          <Button onClick={() => void downloadMap()} disabled={!navigator.onLine || Boolean(mapProgress)} loading={Boolean(mapProgress)} leftSection={<UIIcon name="download" size={18} />}>{mapProgress ? 'Offlinekarte wird geladen …' : 'Offlinekarte laden / aktualisieren'}</Button>
          {mapProgress && <Progress value={mapProgress[1] ? mapProgress[0] / mapProgress[1] * 100 : 0} animated aria-label={`${mapProgress[0]} von ${mapProgress[1]} Kartenkacheln gespeichert`} />}
          {!navigator.onLine && <Text size="xs" c="dimmed">Zum Aktualisieren der Offlinekarte wird eine Internetverbindung benötigt.</Text>}
        </Stack>}
      </Stack>
    </Card>

    <Card withBorder className="surface-card">
      <Stack gap="lg">
        <SectionHeading icon="info" title="Push-Benachrichtigungen"
          description="Erhalte Meldungen zu deinen Redmine-Aufträgen – auf Wunsch auch bei geschlossener App." />
        <Box className="push-optin-panel">
          <Group justify="space-between" align="center" gap="xs">
            <Box>
              <Text fw={800} size="sm">Benachrichtigungen auf diesem Gerät</Text>
              <Text size="xs" c="dimmed" mt={3}>
                {!pushServerEnabled ? 'Push-Server muss einmal eingerichtet werden.'
                  : !canUsePush() ? 'Browser/HTTPS unterstützt Push hier nicht.'
                    : pushState?.registered ? 'Aktiviert – Aufträge werden automatisch beobachtet.'
                      : 'Aus – du entscheidest, ob du Push erhalten möchtest.'}
              </Text>
            </Box>
            <Badge variant="light" color={pushState?.registered ? 'green' : 'gray'}>
              {pushState?.registered ? 'Aktiv' : 'Aus'}
            </Badge>
          </Group>
          {requiresHomeScreenInstall() && <Alert color="blue" variant="light" mt="sm">
            Auf iPhone/iPad: DerKumpel zuerst über „Zum Home-Bildschirm“ installieren, dort öffnen und dann Push einschalten.
          </Alert>}
          {pushState?.permission === 'denied' && <Alert color="orange" variant="light" mt="sm">
            Der Browser blockiert Mitteilungen. Erlaube sie in den Website-/Systemeinstellungen.
          </Alert>}
          <Group mt="md" gap="sm">
            {pushState?.registered
              ? <Button variant="light" color="red" loading={pushBusy} disabled={!navigator.onLine}
                  onClick={() => void disablePush()}>Deaktivieren</Button>
              : <Button variant="filled" loading={pushBusy}
                  disabled={!pushServerEnabled || !canUsePush() || requiresHomeScreenInstall() || !navigator.onLine}
                  leftSection={<UIIcon name="info" size={18} />} onClick={() => void enablePush()}>
                  Push aktivieren
                </Button>}
            {pushState?.registered && <Button variant="default" loading={pushBusy} disabled={!navigator.onLine}
              onClick={() => void testPush()}>Test senden</Button>}
          </Group>
        </Box>
        <Text size="sm" fw={750}>Worüber möchtest du informiert werden?</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Switch checked={notificationPrefs.assignment} onChange={(event) => void setNotification('assignment', event.currentTarget.checked)} label="Neue Zuweisungen (auch Gruppen)" />
          <Switch checked={notificationPrefs.status} onChange={(event) => void setNotification('status', event.currentTarget.checked)} label="Statusänderungen" />
          <Switch checked={notificationPrefs.comment} onChange={(event) => void setNotification('comment', event.currentTarget.checked)} label="Neue Kommentare" />
          <Switch checked={notificationPrefs.priority} onChange={(event) => void setNotification('priority', event.currentTarget.checked)} label="Prioritätsänderungen" />
          <Switch checked={notificationPrefs.dates} onChange={(event) => void setNotification('dates', event.currentTarget.checked)} label="Termin-/Fälligkeitsänderungen" />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          Push ist freiwillig. Der Server speichert dafür verschlüsselte Redmine-Zugangsdaten und Geräte-Abos;
          bei Deaktivierung werden die Push-Daten dieses Geräts entfernt. Nachrichtenvorschauen enthalten keine Ticket-Titel.
        </Text>
      </Stack>
    </Card>

    <Card withBorder className="surface-card">
      <Stack gap="lg">
        <SectionHeading icon="shield" title="Konto & Gerät" description="Dieses Gerät ist für die persönliche Offline-Arbeit gedacht." />
        <Text size="sm" c="dimmed">Beim Abmelden werden die gecachten Arbeitsdaten dieses Kontos vom Gerät entfernt. Redmine selbst bleibt unverändert.</Text>
        <Button variant="light" color="red" leftSection={<UIIcon name="logout" size={17} />} disabled={pendingCount > 0} onClick={() => setConfirmLogout(true)}>Von diesem Gerät abmelden</Button>
      </Stack>
    </Card>

    <Modal opened={confirmClear} onClose={() => setConfirmClear(false)} title="Offline-Daten löschen?" centered>
      <Stack>
        <Text>Alle lokal gecachten Aufträge, Anhänge und noch nicht synchronisierten Änderungen werden von diesem Gerät gelöscht. Redmine-Daten bleiben unverändert.</Text>
        {pendingCount > 0 && <Alert color="red">Achtung: {pendingCount} noch nicht synchronisierte Änderung(en) würden verloren gehen.</Alert>}
        <Group grow><Button variant="default" onClick={() => setConfirmClear(false)}>Abbrechen</Button><Button color="red" disabled={pendingCount > 0} onClick={() => void clearBusinessData().then(() => { setConfirmClear(false); notifications.show({ message: 'Offline-Daten gelöscht' }); })}>Endgültig löschen</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={confirmLogout} onClose={() => setConfirmLogout(false)} title="Abmelden?" centered>
      <Stack>
        <Text>Die Sitzung wird beendet und alle gecachten Arbeitsdaten werden lokal gelöscht.</Text>
        {pendingCount > 0 && <Alert color="red">{pendingCount} Änderung(en) sind noch nicht synchronisiert. Synchronisiere sie zuerst, wenn sie erhalten bleiben sollen.</Alert>}
        <Group grow><Button variant="default" onClick={() => setConfirmLogout(false)}>Abbrechen</Button><Button color="red" disabled={pendingCount > 0} onClick={() => void logout()}>Abmelden</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
