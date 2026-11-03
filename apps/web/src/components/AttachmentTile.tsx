import { Alert, Badge, Box, Button, Card, Group, Image, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { db } from '../db';
import { prepareOfflinePreview } from '../image';
import { useDexieLive } from '../live';

function fileLabel(filename: string): string {
  const extension = filename.split('.').pop()?.toUpperCase();
  return extension && extension.length <= 6 ? extension : 'DATEI';
}

export function AttachmentTile({ id, filename, contentType }: { id: number; filename: string; contentType: string }) {
  const query = useCallback(() => db.attachments.get(id), [id]);
  const sourceQuery = useCallback(async () => {
    const issue = await db.issues.filter((record) => Boolean(record.data.attachments?.some((attachment) => attachment.id === id))).first();
    return issue?.data.attachments?.find((attachment) => attachment.id === id);
  }, [id]);
  const record = useDexieLive(query, undefined);
  const source = useDexieLive(sourceQuery, undefined);
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!record?.blob) { setUrl(undefined); return; }
    const objectUrl = URL.createObjectURL(record.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [record?.blob]);

  const download = async () => {
    if (!source?.content_url || !navigator.onLine || loading) return;
    setLoading(true); setError('');
    try {
      let blob = await api.attachmentBlob(source.content_url);
      if (blob.type.startsWith('image/')) blob = await prepareOfflinePreview(blob, filename);
      await db.attachments.put({
        id,
        issueId: (await db.issues.filter((item) => Boolean(item.data.attachments?.some((attachment) => attachment.id === id))).first())?.id ?? 0,
        filename,
        contentType: contentType || blob.type,
        size: blob.size,
        createdOn: source.created_on,
        blob,
        cachedAt: Date.now(),
      });
      await db.syncState.delete(`attachmentFailure:${id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Datei konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  if (!record || !url) return <Card withBorder p="md" className="attachment-card attachment-card-missing">
    <Stack gap="sm">
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon size={42} radius="md" variant="light" color="orange">↓</ThemeIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={750} truncate>{filename}</Text>
          <Text size="xs" c="dimmed" mt={3}>{navigator.onLine ? 'Noch nicht auf diesem Gerät gespeichert' : 'Offline nicht auf diesem Gerät verfügbar'}</Text>
        </Box>
        <Badge color="orange" variant="light" size="sm">{navigator.onLine ? 'Online' : 'Fehlt'}</Badge>
      </Group>
      {error && <Alert color="red" variant="light" p="xs">{error}</Alert>}
      <Button variant="light" fullWidth loading={loading} disabled={!navigator.onLine || !source?.content_url} onClick={() => void download()}>
        {navigator.onLine ? 'Jetzt offline speichern' : 'Zum Laden Verbindung herstellen'}
      </Button>
    </Stack>
  </Card>;

  if (contentType.startsWith('image/')) return <Card withBorder p={6} className="attachment-card">
    <UnstyledButton component="a" href={url} target="_blank" rel="noreferrer" aria-label={`${filename} öffnen`} className="attachment-preview-link">
      <Image src={url} alt={filename} radius="md" h={190} fit="cover" className="attachment-preview" />
    </UnstyledButton>
    <Group justify="space-between" gap="xs" wrap="nowrap" px={6} pt={8} pb={4}>
      <Box style={{ minWidth: 0 }}>
        <Text size="sm" fw={700} truncate>{filename}</Text>
        <Text size="xs" c="dimmed">Offline · {Math.max(1, Math.ceil(record.size / 1024))} KB</Text>
      </Box>
      <Badge color="green" variant="light" size="sm">Gespeichert</Badge>
    </Group>
  </Card>;

  return <Card withBorder p="md" className="attachment-card">
    <Stack gap="sm">
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon size={44} radius="md" variant="light" color="blue"><Text size="xs" fw={850}>{fileLabel(filename)}</Text></ThemeIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text fw={750} truncate>{filename}</Text>
          <Text size="xs" c="dimmed" mt={3}>Offline gespeichert · {Math.max(1, Math.ceil(record.size / 1024))} KB</Text>
        </Box>
        <Badge color="green" variant="light" size="sm">Offline</Badge>
      </Group>
      <Button component="a" href={url} target="_blank" rel="noreferrer" variant="light" fullWidth>Mit Gerät öffnen</Button>
    </Stack>
  </Card>;
}
