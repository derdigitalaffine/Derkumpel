import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { useState } from 'react';
import { api } from '../api';
import { clearBusinessData, getSetting, setSetting } from '../db';
import type { CurrentUser } from '../types';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await api.login(username, password);
      const previous = await getSetting<CurrentUser | null>('lastUser', null);
      if (previous && previous.id !== result.user.id) await clearBusinessData();
      await setSetting('lastUser', result.user);
      await setSetting('locallyLoggedOut', false);
      setPassword(''); onLoggedIn();
    } catch { setError('Anmeldung fehlgeschlagen. Bitte Redmine-Benutzername und Passwort prüfen.'); }
    finally { setLoading(false); }
  };
  return <Center mih="100dvh" p="md" bg="gray.0">
    <Paper component="form" onSubmit={submit} withBorder shadow="sm" radius="xl" p="xl" w="100%" maw={430}>
      <Stack gap="lg">
        <Stack align="center" gap="xs"><ThemeIcon size={64} radius={20} fz={28} fw={900}>D</ThemeIcon><Title order={1}>Derkumpel</Title><Text c="dimmed" ta="center">Deine Bauhof-Aufträge. Schnell, mobil und offline.</Text></Stack>
        {error && <Alert color="red">{error}</Alert>}
        <TextInput label="Redmine-Benutzername" autoComplete="username" value={username} onChange={(event) => setUsername(event.currentTarget.value)} required />
        <PasswordInput label="Passwort" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} required />
        <Button type="submit" size="lg" loading={loading}>Anmelden</Button>
        <Text size="xs" c="dimmed" ta="center">Das Passwort wird nicht im Offline-Speicher der App abgelegt.</Text>
      </Stack>
    </Paper>
  </Center>;
}
