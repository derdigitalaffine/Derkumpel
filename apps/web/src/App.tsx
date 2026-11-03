import { Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, AuthRequiredError } from './api';
import { getSetting, setSetting } from './db';
import { startSyncLoop } from './sync';
import type { CurrentUser } from './types';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { WorkPage } from './pages/WorkPage';
import { IssuePage } from './pages/IssuePage';
import { MapPage } from './pages/MapPage';
import { SyncPage } from './pages/SyncPage';
import { SettingsPage } from './pages/SettingsPage';

type AuthState = 'loading' | 'ready' | 'offline' | 'login';

export function App() {
  const [state, setState] = useState<AuthState>('loading');
  const check = async () => {
    try { const user = await api.me(); await setSetting('lastUser', user); setState('ready'); }
    catch (error) {
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
  if (state === 'loading') return <Center mih="100dvh"><Stack align="center"><Loader /><Text c="dimmed">Derkumpel startet …</Text></Stack></Center>;
  if (state === 'login') return <LoginPage onLoggedIn={() => setState('ready')} />;
  return <Layout><Routes>
    <Route path="/" element={<WorkPage />} />
    <Route path="/issues/:id" element={<IssuePage />} />
    <Route path="/map" element={<MapPage />} />
    <Route path="/sync" element={<SyncPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Layout>;
}
