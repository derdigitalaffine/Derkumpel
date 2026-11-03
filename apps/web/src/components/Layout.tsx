import { AppShell, Badge, Box, Group, NavLink, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
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
  return <AppShell header={{ height: 68 }} navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: true } }} padding={{ base: 'md', sm: 'lg' }}>
    <AppShell.Header px={{ base: 'md', sm: 'lg' }} className="app-header">
      <Group h="100%" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={42} radius={13} variant="gradient" gradient={{ from: 'blue.7', to: 'cyan.6', deg: 145 }} fw={900}>D</ThemeIcon>
          <Box>
            <Text fw={850} lh={1.05} fz="md" style={{ letterSpacing: '-0.02em' }}>Derkumpel</Text>
            <Text size="xs" c="dimmed" mt={2}>Bauhof · Redmine</Text>
          </Box>
        </Group>
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
    </AppShell.Header>

    <AppShell.Navbar p="md">
      <Stack gap="xs">
        <Text size="xs" fw={800} c="dimmed" tt="uppercase" px="sm" mb={2} style={{ letterSpacing: '.06em' }}>Navigation</Text>
        {items.map((item) => {
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return <NavLink
            key={item.to}
            component={Link}
            to={item.to}
            active={active}
            label={item.label}
            leftSection={<Text fz={19} fw={800} w={22} ta="center">{item.icon}</Text>}
          />;
        })}
      </Stack>
    </AppShell.Navbar>

    <AppShell.Main className="mobile-content">{children}</AppShell.Main>

    <Box hiddenFrom="sm" pos="fixed" bottom={0} left={0} right={0} style={{ zIndex: 100 }} className="mobile-nav safe-bottom">
      <Group grow gap={4} px={6} pt={6} align="stretch">
        {items.map((item) => {
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return <UnstyledButton
            key={item.to}
            component={Link}
            to={item.to}
            className="mobile-nav-item"
            data-active={active}
            aria-current={active ? 'page' : undefined}
          >
            <Stack gap={1} align="center">
              <Text fz={20} fw={850} lh={1.05}>{item.icon}</Text>
              <Text size="xs" fw={active ? 850 : 650} lh={1.15}>{item.label}</Text>
            </Stack>
          </UnstyledButton>;
        })}
      </Group>
    </Box>
  </AppShell>;
}
