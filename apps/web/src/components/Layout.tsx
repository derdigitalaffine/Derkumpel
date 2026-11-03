import { AppShell, Badge, Box, Group, NavLink, Text, ThemeIcon } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const items = [
  { to: '/', label: 'Arbeit', icon: '▣' },
  { to: '/map', label: 'Karte', icon: '⌖' },
  { to: '/sync', label: 'Sync', icon: '↻' },
  { to: '/settings', label: 'Mehr', icon: '☰' },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const network = useNetwork();
  return <AppShell header={{ height: 64 }} navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: true } }} padding="md">
    <AppShell.Header px="md">
      <Group h="100%" justify="space-between">
        <Group gap="sm"><ThemeIcon size="lg" radius="md">D</ThemeIcon><Box><Text fw={800} lh={1}>Derkumpel</Text><Text size="xs" c="dimmed">Bauhof · Redmine</Text></Box></Group>
        <Badge color={network.online ? 'green' : 'orange'} variant="light">{network.online ? 'Online' : 'Offline'}</Badge>
      </Group>
    </AppShell.Header>
    <AppShell.Navbar p="md">
      {items.map((item) => <NavLink key={item.to} component={Link} to={item.to} active={location.pathname === item.to} label={item.label} leftSection={<Text fw={800}>{item.icon}</Text>} />)}
    </AppShell.Navbar>
    <AppShell.Main className="mobile-content">{children}</AppShell.Main>
    <Box hiddenFrom="sm" pos="fixed" bottom={0} left={0} right={0} bg="white" style={{ borderTop: '1px solid var(--mantine-color-gray-3)', zIndex: 100 }} className="safe-bottom">
      <Group grow gap={0} px="xs" pt={6}>{items.map((item) => {
        const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
        return <NavLink key={item.to} component={Link} to={item.to} active={active} label={<Text size="xs" fw={active ? 800 : 600} ta="center">{item.label}</Text>} leftSection={undefined} childrenOffset={0} styles={{ root: { borderRadius: 12, padding: '8px 4px', textAlign: 'center' }, label: { textAlign: 'center' } }} />;
      })}</Group>
    </Box>
  </AppShell>;
}
