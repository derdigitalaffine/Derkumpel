import { Alert, Badge, Box, Button, Center, Group, Image, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { useState } from 'react';
import { api } from '../api';
import { clearBusinessData, getSetting, setSetting } from '../db';
import type { CurrentUser } from '../types';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const network = useNetwork();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const canSubmit = network.online && username.trim().length > 0 && password.length > 0 && !loading;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(''); setLoading(true);
    try {
      const result = await api.login(username.trim(), password);
      const previous = await getSetting<CurrentUser | null>('lastUser', null);
      if (previous && previous.id !== result.user.id) await clearBusinessData();
      await setSetting('lastUser', result.user);
      await setSetting('locallyLoggedOut', false);
      setPassword(''); onLoggedIn();
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte Redmine-Benutzername und Passwort prüfen.');
    } finally {
      setLoading(false);
    }
  };

  return <Center mih="100dvh" p={{ base: 'md', sm: 'xl' }}>
    <Paper component="form" onSubmit={submit} withBorder shadow="md" p={{ base: 'xl', sm: 36 }} w="100%" maw={440} className="surface-card">
      <Stack gap="xl">
        <Stack align="center" gap="sm">
          <Image src="/derkumpel-logo.png" alt="DerKumpel – Bauhof-App" w="100%" maw={310} fit="contain" />
          <Title order={1} className="sr-only">DerKumpel</Title>
          <Box ta="center">
            <Text c="dimmed">Deine Bauhof-Aufträge. Schnell, mobil und offline.</Text>
          </Box>
          <Group gap={6} justify="center">
            <Badge variant="light" color="blue">Redmine</Badge>
            <Badge variant="light" color="green">Offline-fähig</Badge>
          </Group>
        </Stack>

        {!network.online && <Alert color="orange" title="Keine Verbindung" variant="light">
          Für die Anmeldung muss Redmine erreichbar sein. Wenn du auf diesem Gerät bereits angemeldet warst, öffnet DerKumpel den Offline-Modus automatisch, sobald die gespeicherte Sitzung erkannt wird.
        </Alert>}
        {error && <Alert color="red" title="Anmeldung nicht möglich">{error}</Alert>}

        <Stack gap="md">
          <TextInput
            label="Benutzername"
            description="Dein vorhandener Redmine-Zugang"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => { setUsername(event.currentTarget.value); if (error) setError(''); }}
            required
          />
          <PasswordInput
            label="Passwort"
            autoComplete="current-password"
            value={password}
            onChange={(event) => { setPassword(event.currentTarget.value); if (error) setError(''); }}
            required
          />
          <Button type="submit" size="lg" loading={loading} disabled={!canSubmit && !loading} mt={4}>
            {network.online ? 'Anmelden' : 'Offline'}
          </Button>
        </Stack>

        <Text size="xs" c="dimmed" ta="center" lh={1.45}>Dein Passwort wird nicht im Offline-Speicher der App abgelegt. Nach erfolgreicher Anmeldung werden nur die für die mobile Arbeit benötigten Auftragsdaten lokal vorgehalten.</Text>
      </Stack>
    </Paper>
  </Center>;
}
