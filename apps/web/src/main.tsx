import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter } from 'react-router-dom';
import { theme } from './theme';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-center" />
      <BrowserRouter><App /></BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
