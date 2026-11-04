import { AppShell, Badge, Box, Group, Image, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { Link, useLocation } from 'react-router-dom';
import { useCallback, type ReactNode } from 'react';
import { db } from '../db';
import { useDexieLive } from '../live';

const items = [
  { to: '/', label: 'Arbeit', icon: '▣' },
  { to: '/tickets', label: 'Tickets', icon: '☷' },
  { to: '/map', label: 'Karte', icon: '⌖' },
  { to: '/sync', label: 'Sync', icon: '↻' },
  { to: '/settings', label: 'Mehr', icon: '☰' },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const network = useNetwork();
  const queue = useDexieLive(useCallback(() => db.outbox.toArray(), []), []);
  const pendingCount = queue.length;
  const conflictCount = queue.filter((item) => item.state === 'conflict').length;
  const queueColor = conflictCount ? 'red' : 'orange';
  const queueLabel = conflictCount ? `${conflictCount} Konflikt${conflictCount === 1 ? '' : 'e'}` : `${pendingCount} lokal`;

  const syncBadge = pendingCount > 0 ? <Badge color={queueColor} variant="filled" size="xs" aria-label={queueLabel}>{pendingCount > 99 ? '99+' : pendingCount}</Badge> : undefined;

  return <AppShell header={{ height: 68 }} navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: true } }} padding={{ base: 'md', sm: 'lg' }}>
    <AppShell.Header px={{ base: 'md', sm: 'lg' }} className="app-header">
      <Group h="100%" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Image src="/derkumpel-icon-192-v2.png" alt="" w={44} h={44} radius={13} />
          <Box>
            <Text fw={850} lh={1.05} fz="md" style={{ letterSpacing: '-0.02em' }}>DerKumpel</Text>
            <Text size="xs" c="dimmed" mt={2}>Bauhof · Redmine</Text>
          </Box>
        </Group>
        <Group gap={6} wrap="nowrap">
          {pendingCount > 0 && <Badge color={queueColor} variant="light" size="lg" visibleFrom="xs">{queueLabel}</Badge>}
          <Badge
            color={network.online ? 'green' : 'orange'}
            variant="light"
            size="lg"
            leftSection={<Box className="connection-dot" />}
            aria-label={network.online ? 'Verbindung online' : 'Verbindung offline'}
          >
            {network.online ? 'Online' : 'Offline'}
          </Badge>
        </Group>
        <Text component="span" className="sr-only" aria-live="polite">
          {network.online ? 'Verbindung hergestellt.' : 'Keine Verbindung. Offline-Arbeit ist aktiv.'}
          {pendingCount > 0 ? ` ${queueLabel}.` : ' Keine lokalen Änderungen offen.'}
        </Text>
      </Group>
    </AppShell.Header>

    <AppShell.Navbar p="md">
      <Stack gap="xs">
        <Text size="xs" fw={800} c="dimmed" tt="uppercase" px="sm" mb={2} style={{ letterSpacing: '.06em' }}>Navigation</Text>
        {items.map((item) => {
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          const isSync = item.to === '/sync';
          return <NavLink
            key={item.to}
            component={Link}
            to={item.to}
            active={active}
            label={item.label}
            aria-label={isSync && pendingCount > 0 ? `Synchronisation, ${queueLabel}` : item.label}
            leftSection={<Text fz={19} fw={800} w={22} ta="center">{item.icon}</Text>}
            rightSection={isSync ? syncBadge : undefined}
          />;
        })}
      </Stack>
    </AppShell.Navbar>

    <AppShell.Main className="mobile-content">{children}</AppShell.Main>

    <Box hiddenFrom="sm" pos="fixed" bottom={0} left={0} right={0} style={{ zIndex: 100 }} className="mobile-nav safe-bottom">
      <Group grow gap={2} px={4} pt={6} align="stretch">
        {items.map((item) => {
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          const isSync = item.to === '/sync';
          return <UnstyledButton
            key={item.to}
            component={Link}
            to={item.to}
            className="mobile-nav-item"
            data-active={active}
            aria-current={active ? 'page' : undefined}
            aria-label={isSync && pendingCount > 0 ? `Synchronisation, ${queueLabel}` : item.label}
          >
            <Stack gap={1} align="center">
              <Group gap={3} wrap="nowrap" justify="center">
                <Text fz={19} fw={850} lh={1.05}>{item.icon}</Text>
                {isSync && syncBadge}
              </Group>
              <Text size="xs" fw={active ? 850 : 650} lh={1.15}>{item.label}</Text>
            </Stack>
          </UnstyledButton>;
        })}
      </Group>
    </Box>
  </AppShell>;
}
