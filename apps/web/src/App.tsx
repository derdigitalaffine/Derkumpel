import { Box, Center, Image, Loader, Paper, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, AuthRequiredError } from './api';
import { getSetting, setSetting } from './db';
import { startSyncLoop } from './sync';
import { DEFAULT_PUSH_PREFERENCES, updateDevicePushPreferences, type PushPreferences } from './push';
import type { CurrentUser } from './types';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { WorkPage } from './pages/WorkPage';
import { IssueRoute } from './pages/IssueRoute';
import { TicketsPage } from './pages/TicketsPage';
import { MapPage } from './pages/MapPage';
import { SyncPage } from './pages/SyncPage';
import { SettingsPage } from './pages/SettingsPage';

type AuthState = 'loading' | 'ready' | 'offline' | 'login';

export function App() {
  const [state, setState] = useState<AuthState>('loading');
  const check = async () => {
    if (await getSetting('locallyLoggedOut', false)) { setState('login'); return; }

    if (!navigator.onLine) {
      const cached = await getSetting<CurrentUser | null>('lastUser', null);
      setState(cached ? 'offline' : 'login');
      return;
    }

    try {
      const user = await api.me();
      await setSetting('lastUser', user);
      setState('ready');
    } catch (error) {
      if (error instanceof AuthRequiredError) { setState('login'); return; }
      const cached = await getSetting<CurrentUser | null>('lastUser', null);
      setState(cached ? 'offline' : 'login');
    }
  };

  useEffect(() => { void check(); }, []);
  useEffect(() => {
    if (state !== 'ready' && state !== 'offline') return;
    return startSyncLoop(() => { if (navigator.onLine) setState('login'); });
  }, [state]);
  useEffect(() => {
    if (state !== 'ready' && state !== 'offline') return;
    const reconcile = () => {
      if (!navigator.onLine) return;
      void getSetting<PushPreferences>('notificationPreferences', DEFAULT_PUSH_PREFERENCES)
        .then((preferences) => updateDevicePushPreferences(preferences))
        .catch(() => undefined);
    };
    reconcile();
    window.addEventListener('online', reconcile);
    return () => window.removeEventListener('online', reconcile);
  }, [state]);

  if (state === 'loading') return <Center mih="100dvh" p="xl" role="status" aria-live="polite">
    <Paper p="xl" maw={360} w="100%" ta="center" className="startup-card">
      <Stack align="center" gap="md">
        <Image src="/derkumpel-icon-192-v2.png" alt="" w={70} h={70} radius={20} />
        <Box>
          <Text fw={850} fz="xl" style={{ letterSpacing: '-0.03em' }}>DerKumpel</Text>
          <Text size="sm" c="dimmed" mt={4}>Lokale Aufträge werden vorbereitet</Text>
        </Box>
        <Loader size="sm" />
      </Stack>
    </Paper>
  </Center>;

  if (state === 'login') return <LoginPage onLoggedIn={() => setState('ready')} />;

  return <Layout><Routes>
    <Route path="/" element={<WorkPage />} />
    <Route path="/tickets" element={<TicketsPage />} />
    <Route path="/issues/:id" element={<IssueRoute />} />
    <Route path="/map" element={<MapPage />} />
    <Route path="/sync" element={<SyncPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Layout>;
}
