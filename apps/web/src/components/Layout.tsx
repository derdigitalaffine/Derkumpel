import { AppShell, Badge, Box, Group, Image, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { Link, useLocation } from 'react-router-dom';
import { useCallback, type ReactNode } from 'react';
import { db } from '../db';
import { useDexieLive } from '../live';
import { UIIcon, type IconName } from './UIIcon';

const items: Array<{ to: string; label: string; fullLabel: string; icon: IconName }> = [
  { to: '/', label: 'Arbeit', fullLabel: 'Meine Arbeit', icon: 'work' },
  { to: '/tickets', label: 'Tickets', fullLabel: 'Ticket-Browser', icon: 'tickets' },
  { to: '/map', label: 'Karte', fullLabel: 'Auftragskarte', icon: 'map' },
  { to: '/sync', label: 'Sync', fullLabel: 'Synchronisation', icon: 'sync' },
  { to: '/settings', label: 'Mehr', fullLabel: 'Einstellungen', icon: 'settings' },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const network = useNetwork();
  const queue = useDexieLive(useCallback(() => db.outbox.toArray(), []), []);
  const pendingCount = queue.length;
  const conflictCount = queue.filter((item) => item.state === 'conflict').length;
  const queueColor = conflictCount ? 'red' : 'orange';
  const queueLabel = conflictCount ? `${conflictCount} Konflikt${conflictCount === 1 ? '' : 'e'}` : `${pendingCount} lokal`;
  const syncBadge = pendingCount > 0
    ? <Badge color={queueColor} variant="filled" size="xs" circle aria-label={queueLabel}>{pendingCount > 99 ? '99+' : pendingCount}</Badge>
    : null;

  return <AppShell header={{ height: 72 }} navbar={{ width: 244, breakpoint: 'sm', collapsed: { mobile: true } }}
    padding={{ base: 'md', sm: 'lg' }}>
    <AppShell.Header px={{ base: 'md', sm: 'xl' }} className="app-header">
      <Group h="100%" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Image src="/derkumpel-icon-192-v2.png" alt="" w={44} h={44} radius={12} className="app-brandmark" />
          <Box>
            <Text fw={850} lh={1.05} fz="md" c="brand.9" style={{ letterSpacing: '-0.035em' }}>DerKumpel</Text>
            <Text size="xs" c="dimmed" mt={3} fw={600}>Bauhof · unterwegs</Text>
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {pendingCount > 0 && <Badge color={queueColor} variant="light" size="lg" visibleFrom="sm"
            leftSection={<UIIcon name="sync" size={13} />}>{queueLabel}</Badge>}
          <Link to="/sync" className="connection-pill" data-offline={!network.online}
            aria-label={network.online ? `Online. ${pendingCount} Änderungen ausstehend. Synchronisation öffnen`
              : `Offline. ${pendingCount} Änderungen lokal gespeichert. Synchronisation öffnen`}>
            <Box className="connection-dot" aria-hidden="true" />
            <Text component="span" size="xs" fw={750}>{network.online ? 'Online' : 'Offline'}</Text>
            {pendingCount > 0 && <Badge size="xs" color={queueColor} variant="filled" circle>{pendingCount > 99 ? '99+' : pendingCount}</Badge>}
          </Link>
        </Group>
        <Text component="span" className="sr-only" aria-live="polite">
          {network.online ? 'Verbindung hergestellt.' : 'Keine Verbindung. Offline-Arbeit ist aktiv.'}
          {pendingCount > 0 ? ` ${queueLabel}.` : ' Keine lokalen Änderungen offen.'}
        </Text>
      </Group>
    </AppShell.Header>

    <AppShell.Navbar p="md" style={{ background: '#f9fcfc', borderColor: 'var(--dk-border)' }}>
      <Stack gap="xs">
        <Text size="xs" fw={850} c="dimmed" tt="uppercase" px="sm" mb={6}
          style={{ letterSpacing: '.1em' }}>Arbeitsbereiche</Text>
        {items.map((item) => {
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return <NavLink key={item.to} component={Link} to={item.to} active={active}
            label={item.fullLabel} className="desktop-nav-link"
            aria-current={active ? 'page' : undefined}
            leftSection={<UIIcon name={item.icon} size={20} />}
            rightSection={item.to === '/sync' ? syncBadge : null} />;
        })}
      </Stack>
    </AppShell.Navbar>

    <AppShell.Main className="mobile-content" id="hauptinhalt">
      {children}
    </AppShell.Main>

    <Box hiddenFrom="sm" component="nav" aria-label="Hauptnavigation" pos="fixed"
      bottom={0} left={0} right={0} style={{ zIndex: 100 }} className="mobile-nav safe-bottom">
      <Group grow gap={3} px={5} pt={7} align="stretch">
        {items.map((item) => {
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return <UnstyledButton key={item.to} component={Link} to={item.to}
            className="mobile-nav-item" data-active={active}
            aria-current={active ? 'page' : undefined}
            aria-label={item.to === '/sync' && pendingCount > 0 ? `Synchronisation, ${queueLabel}` : item.fullLabel}>
            <Stack align="center" gap={3} justify="center">
              <Group gap={2} wrap="nowrap" justify="center">
                <span className="nav-icon"><UIIcon name={item.icon} size={22} strokeWidth={active ? 2.25 : 1.8} /></span>
                {item.to === '/sync' && syncBadge}
              </Group>
              <Text size="xs" fw={active ? 850 : 650} lh={1.15}>{item.label}</Text>
            </Stack>
          </UnstyledButton>;
        })}
      </Group>
    </Box>
  </AppShell>;
}
