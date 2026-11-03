import { Button, Card, Image, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../db';
import { useDexieLive } from '../live';

export function AttachmentTile({ id, filename, contentType }: { id: number; filename: string; contentType: string }) {
  const query = useCallback(() => db.attachments.get(id), [id]);
  const record = useDexieLive(query, undefined);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!record?.blob) { setUrl(undefined); return; }
    const objectUrl = URL.createObjectURL(record.blob); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [record?.blob]);
  if (!record || !url) return <Card withBorder radius="md" p="sm"><Text size="sm" fw={650}>{filename}</Text><Text size="xs" c="dimmed">Noch nicht offline verfügbar</Text></Card>;
  if (contentType.startsWith('image/')) return <Card withBorder radius="md" p={6}><Image src={url} alt={filename} radius="sm" mah={280} fit="contain" /><Text size="xs" mt={6} truncate>{filename}</Text></Card>;
  return <Card withBorder radius="md"><Stack gap="xs"><Text fw={650}>{filename}</Text><Text size="xs" c="dimmed">Offline gespeichert · {Math.ceil(record.size / 1024)} KB</Text><Button component="a" href={url} target="_blank" rel="noreferrer" variant="light">Mit Gerät öffnen</Button></Stack></Card>;
}
