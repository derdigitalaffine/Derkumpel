import { Alert, Badge, Box, Button, Card, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import { useDexieLive } from '../live';
import { resolveConflict, syncNow } from '../sync';

type AttachmentCacheWarning = { attachmentId: number; issueId: number; filename: string; message: string };

const kindLabels = { update: 'Feld-/Statusänderung', comment: 'Kommentar', attachment: 'Anhang/Foto' } as const;

export function SyncPage() {
  const outbox = useDexieLive(useCallback(() => db.outbox.orderBy('createdAt').toArray(), []), []);
  const status = useDexieLive(useCallback(async () => (await db.syncState.get('status'))?.value as { state?: string; lastSuccess?: number; message?: string } | undefined, []), undefined);
  const attachmentWarnings = useDexieLive(useCallback(async () => ((await db.syncState.get('attachmentWarnings'))?.value as AttachmentCacheWarning[] | undefined) ?? [], []), []);
  const [resolving, setResolving] = useState<string>();
  const conflicts = useMemo(() => outbox.filter((item) => item.state === 'conflict').length, [outbox]);
  const statusLabel = status?.state === 'syncing' ? 'Synchronisiert' : status?.state === 'offline' ? 'Offline' : status?.state === 'error' ? 'Fehler' : 'Aktuell';
  const statusColor = status?.state === 'error' ? 'red' : status?.state === 'offline' ? 'orange' : status?.state === 'syncing' ? 'blue' : 'green';

  const sync = async () => {
    try { await syncNow(); notifications.show({ message: 'Synchronisation abgeschlossen', color: 'green' }); }
    catch { notifications.show({ message: 'Synchronisation nicht möglich', color: 'red' }); }
  };

  const resolve = async (id: string, choice: 'server' | 'local') => {
    if (resolving) return;
    setResolving(id);
    try {
      await resolveConflict(id, choice);
      notifications.show({ message: choice === 'server' ? 'Serverstand übernommen' : 'Eigene Änderung angewendet', color: 'green' });
    } catch {
      notifications.show({ message: 'Konflikt konnte nicht aufgelöst werden', color: 'red' });
    } finally {
      setResolving(undefined);
    }
  };

  return <Stack gap="md" maw={820} mx="auto">
    <Group justify="space-between" align="flex-end" className="page-heading">
      <Box>
        <Title order={1} size="h2" style={{ letterSpacing: '-0.025em' }}>Synchronisation</Title>
        <Text c="dimmed" size="sm" mt={3}>Lokale Änderungen, Offline-Dateien und Konflikte</Text>
      </Box>
      <Button onClick={() => void sync()} loading={status?.state === 'syncing'} leftSection={<Text aria-hidden="true">↻</Text>}>Synchronisieren</Button>
    </Group>

    <SimpleGrid cols={{ base: 3 }} spacing="xs">
      <Paper withBorder p="sm" className="surface-card"><Text className="muted-label">Offen</Text><Text fw={850} fz="xl">{outbox.length}</Text></Paper>
      <Paper withBorder p="sm" className="surface-card"><Text className="muted-label">Konflikte</Text><Text fw={850} fz="xl" c={conflicts ? 'red' : undefined}>{conflicts}</Text></Paper>
      <Paper withBorder p="sm" className="surface-card"><Text className="muted-label">Dateien fehlen</Text><Text fw={850} fz="xl" c={attachmentWarnings.length ? 'orange' : undefined}>{attachmentWarnings.length}</Text></Paper>
    </SimpleGrid>

    <Card withBorder className="surface-card" aria-live="polite">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={statusColor} variant="light" size={42} radius="xl">{status?.state === 'error' ? '!' : status?.state === 'offline' ? '⌁' : status?.state === 'syncing' ? '↻' : '✓'}</ThemeIcon>
          <Box>
            <Text fw={800}>Synchronisationsstatus</Text>
            <Text size="sm" c="dimmed" mt={2}>{status?.lastSuccess ? `Zuletzt erfolgreich ${new Date(status.lastSuccess).toLocaleString('de-DE')}` : 'Noch keine erfolgreiche Synchronisation protokolliert'}</Text>
          </Box>
        </Group>
        <Badge color={statusColor} variant="light" size="lg">{statusLabel}</Badge>
      </Group>
      {status?.message && <Alert color="red" mt="md" variant="light">{status.message}</Alert>}
    </Card>

    {attachmentWarnings.length > 0 && <Alert color="orange" title={`${attachmentWarnings.length} Anhang/Anhänge noch nicht offline verfügbar`} variant="light">
      <Stack gap={5}>
        {attachmentWarnings.slice(0, 6).map((warning) => <Group key={warning.attachmentId} justify="space-between" align="flex-start" wrap="nowrap">
          <Text size="sm" style={{ minWidth: 0 }}>#{warning.issueId} · <b>{warning.filename}</b> · {warning.message}</Text>
          <Button component={Link} to={`/issues/${warning.issueId}`} variant="subtle" size="compact-xs" style={{ flex: '0 0 auto' }}>Öffnen</Button>
        </Group>)}
        {attachmentWarnings.length > 6 && <Text size="sm">… und {attachmentWarnings.length - 6} weitere.</Text>}
        <Text size="sm" fw={700}>Beim nächsten Synchronisieren werden die fehlenden Dateien erneut versucht.</Text>
      </Stack>
    </Alert>}

    {outbox.length === 0 ? <Paper className="empty-state" p="xl">
      <Stack align="center" gap="sm" ta="center">
        <ThemeIcon size={52} radius="xl" variant="light" color={attachmentWarnings.length ? 'blue' : 'green'}>{attachmentWarnings.length ? '↻' : '✓'}</ThemeIcon>
        <Box><Text fw={800}>Keine lokalen Änderungen offen</Text><Text size="sm" c="dimmed" mt={4}>{attachmentWarnings.length ? 'Die oben genannten Offline-Dateien fehlen noch, deine Änderungen sind aber synchronisiert.' : 'Alles synchronisiert. Du kannst auch ohne Netz weiterarbeiten.'}</Text></Box>
      </Stack>
    </Paper> : <Stack gap="sm">
      <Text fw={800} size="sm" c="dimmed">Warteschlange</Text>
      {outbox.map((item) => <Card withBorder key={item.id} className="surface-card">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={800}>Auftrag #{item.issueId}</Text>
              <Button component={Link} to={`/issues/${item.issueId}`} variant="subtle" size="compact-xs">Öffnen</Button>
            </Group>
            <Text size="sm" c="dimmed" mt={2}>{kindLabels[item.kind]} · {new Date(item.createdAt).toLocaleString('de-DE')}</Text>
            {item.state === 'retrying' && <Text size="xs" c="orange" mt={3}>Wird beim nächsten Sync erneut versucht · Versuch {item.attempts}</Text>}
          </Box>
          <Badge color={item.state === 'conflict' ? 'red' : 'orange'} variant="light">{item.state === 'conflict' ? 'Konflikt' : item.state === 'retrying' ? 'Erneut' : 'Ausstehend'}</Badge>
        </Group>
        {item.lastError && <Text size="sm" c="red" mt="sm">{item.lastError}</Text>}
        {item.conflict && <Alert color="red" mt="md" title="Parallel geändert" variant="light">
          <Stack gap="sm">
            <Text size="sm">{item.conflict.reason}</Text>
            <Text size="xs" c="dimmed">Wähle bewusst, welcher Stand gelten soll. Es wird nichts automatisch verworfen.</Text>
            <Group grow>
              <Button size="sm" variant="default" loading={resolving === item.id} disabled={Boolean(resolving && resolving !== item.id)} onClick={() => void resolve(item.id, 'server')}>Server behalten</Button>
              <Button size="sm" color="red" loading={resolving === item.id} disabled={Boolean(resolving && resolving !== item.id)} onClick={() => void resolve(item.id, 'local')}>Meine Änderung</Button>
            </Group>
          </Stack>
        </Alert>}
      </Card>)}
    </Stack>}
  </Stack>;
}
