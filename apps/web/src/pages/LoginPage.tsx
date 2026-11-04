import { Alert, Badge, Box, Button, Center, Group, Image, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { useState } from 'react';
import { api, type PushPreferences } from '../api';
import { disablePush, updatePushPreferences } from '../push';
import { clearBusinessData, getSetting, setSetting } from '../db';
import type { CurrentUser } from '../types';
import { UIIcon } from '../components/UIIcon';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const network = useNetwork();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const insecureOrigin = window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const canSubmit = !insecureOrigin && network.online && username.trim().length > 0 && password.length > 0 && !loading;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(''); setLoading(true);
    try {
      const result = await api.login(username.trim(), password);
      const previous = await getSetting<CurrentUser | null>('lastUser', null);
      if (previous && previous.id !== result.user.id) {
        await disablePush().catch(() => undefined);
        await clearBusinessData();
      } else {
        const preferences = await getSetting<PushPreferences>('notificationPreferences', { assignment: true, status: true, comment: true, priority: true, dates: true });
        await updatePushPreferences(preferences).catch(() => undefined);
      }
      await setSetting('lastUser', result.user);
      await setSetting('locallyLoggedOut', false);
      setPassword(''); onLoggedIn();
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte Redmine-Benutzername und Passwort prüfen.');
    } finally {
      setLoading(false);
    }
  };

  return <Center mih="100dvh" p={{ base: 'md', sm: 'xl' }} className="login-backdrop">
    <Paper component="form" onSubmit={submit} withBorder shadow="md" p={{ base: 'xl', sm: 36 }} w="100%" maw={460} className="surface-card login-panel">
      <Stack gap="xl">
        <Stack align="center" gap="sm">
          <Image src="/derkumpel-logo-v2.png" alt="DerKumpel – Bauhof-App" w="100%" maw={320} fit="contain" />
          <Title order={1} className="sr-only">DerKumpel</Title>
          <Box ta="center">
            <Text fw={790} size="lg" c="brand.9">Willkommen bei DerKumpel</Text>
            <Text c="dimmed" size="sm" mt={4}>Alle Bauhof-Aufträge griffbereit – direkt auf dem Diensthandy.</Text>
          </Box>
          <Group gap={6} justify="center">
            <Badge variant="light" color="brand" leftSection={<UIIcon name="shield" size={13} />}>Redmine-Anmeldung</Badge>
            <Badge variant="light" color="green" leftSection={<UIIcon name="wifi-off" size={13} />}>Offline arbeiten</Badge>
          </Group>
        </Stack>

        {insecureOrigin && <Alert color="red" title="Unsichere Verbindung" variant="light">Bitte DerKumpel ausschließlich über HTTPS öffnen. Über HTTP werden keine Zugangsdaten übertragen.</Alert>}
        {!network.online && <Alert color="orange" title="Keine Verbindung" variant="light">
          Für die Anmeldung muss Redmine erreichbar sein. Wenn du auf diesem Gerät bereits angemeldet warst, öffnet DerKumpel den Offline-Modus automatisch, sobald die gespeicherte Sitzung erkannt wird.
        </Alert>}
        {error && <Alert color="red" title="Anmeldung nicht möglich">{error}</Alert>}

        <Stack gap="md">
          <TextInput
            label="Benutzername"
            description="Dein vorhandener Redmine-Zugang"
            autoComplete="username"
            leftSection={<UIIcon name="user" size={19} />}
            autoFocus
            value={username}
            onChange={(event) => { setUsername(event.currentTarget.value); if (error) setError(''); }}
            required
          />
          <PasswordInput
            label="Passwort"
            autoComplete="current-password"
            leftSection={<UIIcon name="shield" size={19} />}
            value={password}
            onChange={(event) => { setPassword(event.currentTarget.value); if (error) setError(''); }}
            required
          />
          <Button type="submit" size="lg" fullWidth loading={loading} disabled={!canSubmit && !loading} mt={4} leftSection={<UIIcon name="check-circle" size={20} />}>
            {network.online ? 'Anmelden' : 'Offline'}
          </Button>
        </Stack>

        <Box className="login-trust"><Group gap={9} wrap="nowrap" align="flex-start"><UIIcon name="shield" size={20} /><Text size="xs" c="dimmed" lh={1.5}>Dein Passwort wird nicht in den lokalen Arbeitsdaten gespeichert. Nach der Anmeldung stehen bereits synchronisierte Aufträge auch im Funkloch zur Verfügung.</Text></Group></Box>
      </Stack>
    </Paper>
  </Center>;
}
