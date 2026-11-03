import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { db } from '../db';
import { useDexieLive } from '../live';
import { IssuePage } from './IssuePage';

export function IssueRoute() {
  const id = Number(useParams().id);
  const query = useCallback(() => Number.isInteger(id) && id > 0 ? db.issues.get(id) : Promise.resolve(undefined), [id]);
  const record = useDexieLive(query, undefined);
  const [loading, setLoading] = useState(false);
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
  }, [id]);

  if (!Number.isInteger(id) || id <= 0) return <Alert color="red">Ungültige Ticketnummer.</Alert>;
  if (record) return <IssuePage />;

  if (loading) return <Center mih="45dvh" role="status"><Stack align="center" gap="sm"><Loader /><Text size="sm" c="dimmed">Ticket #{id} wird aus Redmine geladen …</Text></Stack></Center>;

  return <Stack maw={700} mx="auto">
    <Button component={Link} to="/tickets" variant="subtle" style={{ alignSelf: 'flex-start' }}>← Tickets</Button>
    <Alert color={navigator.onLine ? 'red' : 'orange'} title={navigator.onLine ? 'Ticket nicht verfügbar' : 'Offline nicht gespeichert'}>
      {error || `Ticket #${id} ist auf diesem Gerät noch nicht im Offline-Cache.`}
    </Alert>
  </Stack>;
}
