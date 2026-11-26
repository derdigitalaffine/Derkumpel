import { AppShell, Badge, Box, Drawer, Group, Image, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery, useNetwork } from '@mantine/hooks';
import { Link, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { db } from '../db';
import { currentRapportQueue,currentGreenEvents } from '../rapportQueue';
import { useDexieLive } from '../live';
import {useDispatcher} from './useDispatcher';
import { UIIcon } from './UIIcon';

import { activeNavigation, visibleNavigation, navigationGroups } from '../navigation';

export function Layout({ children }: { children: ReactNode }) {
  const location=useLocation(),dispatcher=useDispatcher(),navItems=visibleNavigation(dispatcher),activeItem=activeNavigation(location.pathname,navItems);
  const [menuOpen,setMenuOpen]=useState(false),desktop=useMediaQuery('(min-width: 48em)');
  useEffect(()=>{setMenuOpen(false);},[location.key,desktop]);
  const network = useNetwork();
  const queue = useDexieLive(useCallback(() => db.outbox.toArray(), []), []);
  const rapportQueue=useDexieLive(useCallback(currentRapportQueue,[]),[]);
  const greenEvents=useDexieLive(useCallback(currentGreenEvents,[]),[]);
  const pendingCount = queue.length+rapportQueue.length+greenEvents.length;
  const conflictCount = greenEvents.filter(e=>e.state==='conflict').length+queue.filter((item) => item.state === 'conflict').length+rapportQueue.filter(item=>item.state==='conflict').length;
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
      <Stack gap="md" className="desktop-nav-scroll">
        {navigationGroups.map(group=>{const entries=navItems.filter(item=>item.group===group.id);return entries.length>0&&<Box key={group.id}><Text size="xs" fw={850} c="dimmed" tt="uppercase" px="sm" mb={6} style={{letterSpacing:'.08em'}}>{group.title}</Text>{entries.map(item=><NavLink key={item.to} component={Link} to={item.to} active={activeItem?.to===item.to}
            label={item.fullLabel} className="desktop-nav-link" aria-current={activeItem?.to===item.to?'page':undefined}
            leftSection={<UIIcon name={item.icon} size={20}/>} rightSection={item.to==='/sync'?syncBadge:null}/>)}</Box>;})}
      </Stack>
    </AppShell.Navbar>

    <AppShell.Main className="mobile-content" id="hauptinhalt">
      {children}
    </AppShell.Main>

    <Box hiddenFrom="sm" component="nav" aria-label="Hauptnavigation" pos="fixed"
      bottom={0} left={0} right={0} style={{ zIndex: 100 }} className="mobile-nav safe-bottom">
      <div className="mobile-nav-grid">
        {navItems.filter(item=>item.quick).map(item=>{const active=activeItem?.to===item.to;return <UnstyledButton key={item.to} component={Link} to={item.to}
          className="mobile-nav-item" data-active={active} aria-current={active?'page':undefined} aria-label={item.fullLabel}>
          <span className="mobile-nav-inner"><UIIcon name={item.icon} size={23} strokeWidth={active?2.25:1.8}/><span>{item.label}</span></span>
        </UnstyledButton>;})}
        <UnstyledButton className="mobile-nav-item" data-active={menuOpen||!!activeItem&&!activeItem.quick} aria-label="Alle Arbeitsbereiche öffnen" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}>
          <span className="mobile-nav-inner"><span className="mobile-nav-more-icon"><UIIcon name="menu" size={23}/>{pendingCount>0&&<span className="mobile-nav-count" data-conflict={conflictCount>0}>{pendingCount>99?'99+':pendingCount}</span>}</span><span>Mehr</span></span>
        </UnstyledButton>
      </div>
    </Box>
    <Drawer opened={menuOpen&&!desktop} onClose={()=>setMenuOpen(false)} position="bottom" size="auto" title={<Text fw={850} size="lg">Alle Arbeitsbereiche</Text>} classNames={{content:'mobile-menu-drawer',header:'mobile-menu-header',body:'mobile-menu-body'}} closeButtonProps={{'aria-label':'Menü schließen',size:'lg'}} returnFocus>
      <Stack gap="md" component="nav" aria-label="Alle Arbeitsbereiche">
        {activeItem&&<Text size="sm" c="dimmed">Aktuell: <b>{activeItem.fullLabel}</b></Text>}
        {navigationGroups.map(group=>{const entries=navItems.filter(item=>item.group===group.id);return entries.length>0&&<Box key={group.id}><Text size="xs" fw={800} c="dimmed" tt="uppercase" mb={6}>{group.title}</Text>
          <div className="mobile-menu-grid">{entries.map(item=>{const active=activeItem?.to===item.to;return <UnstyledButton key={item.to} component={Link} to={item.to} onClick={()=>setMenuOpen(false)} className="mobile-menu-link" data-active={active} aria-current={active?'page':undefined}>
            <span className="mobile-menu-icon"><UIIcon name={item.icon} size={24}/></span><span className="mobile-menu-copy"><Text component="span" fw={750} size="sm">{item.fullLabel}</Text><Text component="span" size="xs" c="dimmed">{item.description}</Text>{item.to==='/sync'&&pendingCount>0&&<Badge color={queueColor} variant="light" size="sm">{queueLabel}</Badge>}</span>{active?<UIIcon name="check" size={17}/>:<UIIcon name="chevron-right" size={17}/>}
          </UnstyledButton>;})}</div></Box>;})}
      </Stack>
    </Drawer>
  </AppShell>;
}
