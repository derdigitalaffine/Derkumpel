import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { db } from '../db';
import { useDexieLive } from '../live';
import { resolveConflict, syncNow } from '../sync';

type AttachmentCacheWarning = { attachmentId: number; issueId: number; filename: string; message: string };

export function SyncPage() {
  const outbox = useDexieLive(useCallback(() => db.outbox.orderBy('createdAt').toArray(), []), []);
  const status = useDexieLive(useCallback(async () => (await db.syncState.get('status'))?.value as { state?: string; lastSuccess?: number; message?: string } | undefined, []), undefined);
  const attachmentWarnings = useDexieLive(useCallback(async () => ((await db.syncState.get('attachmentWarnings'))?.value as AttachmentCacheWarning[] | undefined) ?? [], []), []);
  const sync = async () => { try { await syncNow(); notifications.show({ message: 'Synchronisation abgeschlossen', color: 'green' }); } catch { notifications.show({ message: 'Synchronisation nicht möglich', color: 'red' }); } };
  return <Stack maw={760} mx="auto"><Group justify="space-between"><div><Title order={1} size="h2">Synchronisation</Title><Text c="dimmed">Lokale Änderungen, Offline-Dateien und Konflikte</Text></div><Button onClick={() => void sync()} loading={status?.state === 'syncing'}>Jetzt synchronisieren</Button></Group>
    <Card withBorder radius="lg"><Group justify="space-between"><Text fw={700}>Status</Text><Badge color={status?.state === 'error' ? 'red' : status?.state === 'offline' ? 'orange' : 'green'}>{status?.state ?? 'bereit'}</Badge></Group>{status?.lastSuccess && <Text size="sm" c="dimmed" mt="xs">Zuletzt erfolgreich: {new Date(status.lastSuccess).toLocaleString('de-DE')}</Text>}{status?.message && <Text size="sm" c="red" mt="xs">{status.message}</Text>}</Card>
    {attachmentWarnings.length > 0 && <Alert color="orange" title={`${attachmentWarnings.length} Anhang/Anhänge noch nicht offline verfügbar`} variant="light"><Stack gap={4}>{attachmentWarnings.slice(0, 6).map((warning) => <Text size="sm" key={warning.attachmentId}>#{warning.issueId} · {warning.filename}: {warning.message}</Text>)}{attachmentWarnings.length > 6 && <Text size="sm">… und {attachmentWarnings.length - 6} weitere.</Text>}<Text size="sm" fw={700}>Mit „Jetzt synchronisieren“ werden fehlende Dateien erneut versucht.</Text></Stack></Alert>}
    {outbox.length === 0 ? <Alert color={attachmentWarnings.length ? 'blue' : 'green'} variant="light">Keine lokalen Änderungen offen.{attachmentWarnings.length ? ' Die oben genannten Offline-Dateien fehlen noch.' : ' Alles synchronisiert.'}</Alert> : <Stack gap="sm">{outbox.map((item) => <Card withBorder radius="lg" key={item.id}><Group justify="space-between"><div><Text fw={750}>Auftrag #{item.issueId}</Text><Text size="sm" c="dimmed">{item.kind === 'update' ? 'Feld-/Statusänderung' : item.kind === 'comment' ? 'Kommentar' : 'Anhang/Foto'} · {new Date(item.createdAt).toLocaleString('de-DE')}</Text></div><Badge color={item.state === 'conflict' ? 'red' : 'orange'}>{item.state === 'conflict' ? 'Konflikt' : 'Ausstehend'}</Badge></Group>{item.lastError && <Text size="sm" c="red" mt="xs">{item.lastError}</Text>}{item.conflict && <Alert color="red" mt="md" title="Parallel geändert">{item.conflict.reason}<Group mt="sm"><Button size="sm" variant="default" onClick={() => void resolveConflict(item.id, 'server')}>Server behalten</Button><Button size="sm" color="red" onClick={() => void resolveConflict(item.id, 'local')}>Meine Änderung anwenden</Button></Group></Alert>}</Card>)}</Stack>}
  </Stack>;
}
