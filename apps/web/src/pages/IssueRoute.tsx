import { Alert, Button, Group, Paper, Skeleton, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { db } from '../db';
import { useDexieLive } from '../live';
import { IssuePage } from './IssuePage';
import { UIIcon } from '../components/UIIcon';

export function IssueRoute() {
  const id = Number(useParams().id);
  const query = useCallback(() => Number.isInteger(id) && id > 0 ? db.issues.get(id) : Promise.resolve(undefined), [id]);
  const record = useDexieLive(query, undefined);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0 || !navigator.onLine) return;
    let disposed = false;
    setLoading(!record);
    void api.issue(id).then(async (issue) => {
      if (disposed) return;
      const existing = await db.issues.get(id);
      await db.issues.put({
        id,
        data: issue,
        active: existing?.active ?? 0,
        staleSince: existing?.active === 1 ? undefined : (existing?.staleSince ?? Date.now()),
        syncedAt: Date.now(),
      });
      setError('');
    }).catch((caught) => {
      if (!disposed) setError(caught instanceof Error ? caught.message : 'Ticket konnte nicht geladen werden.');
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
    // record is intentionally not a dependency: one fetch per route/id is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retry]);

  if (!Number.isInteger(id) || id <= 0) return <Alert color="red">Ungültige Ticketnummer.</Alert>;
  if (record) return <IssuePage />;

  if (loading) return <Stack maw={900} mx="auto" gap="md" role="status" aria-live="polite" aria-label={`Ticket ${id} wird geladen`}>
    <Paper withBorder p="lg" className="surface-card"><Stack gap="md"><Group justify="space-between"><Skeleton h={23} w={115} radius="xl" /><Skeleton h={20} w={80} /></Group><Skeleton h={34} w="84%" /><Skeleton h={22} w="60%" /><Skeleton h={86} radius="md" /><Group><Skeleton h={55} w="45%" /><Skeleton h={55} w="45%" /></Group></Stack></Paper>
    <Text c="dimmed" size="sm" ta="center">Ticket #{id} wird aus Redmine geladen …</Text>
  </Stack>;

  return <Stack maw={700} mx="auto">
    <Button component={Link} to="/tickets" variant="subtle" style={{ alignSelf: 'flex-start' }} leftSection={<UIIcon name="arrow-left" size={17} />}>Tickets</Button>
    <Alert color={navigator.onLine ? 'red' : 'orange'} title={navigator.onLine ? 'Ticket nicht verfügbar' : 'Offline nicht gespeichert'}>
      {error || `Ticket #${id} ist auf diesem Gerät noch nicht im Offline-Cache.`}
    </Alert>
    {navigator.onLine && <Button variant="light" leftSection={<UIIcon name="refresh" size={18} />} onClick={() => setRetry((current) => current + 1)}>Erneut laden</Button>}
  </Stack>;
}
