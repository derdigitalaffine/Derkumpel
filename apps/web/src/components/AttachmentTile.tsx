import { Badge, Box, Button, Card, Group, Image, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../db';
import { useDexieLive } from '../live';

function fileLabel(filename: string): string {
  const extension = filename.split('.').pop()?.toUpperCase();
  return extension && extension.length <= 6 ? extension : 'DATEI';
}

export function AttachmentTile({ id, filename, contentType }: { id: number; filename: string; contentType: string }) {
  const query = useCallback(() => db.attachments.get(id), [id]);
  const record = useDexieLive(query, undefined);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!record?.blob) { setUrl(undefined); return; }
    const objectUrl = URL.createObjectURL(record.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [record?.blob]);

  if (!record || !url) return <Card withBorder p="md" className="attachment-card attachment-card-missing">
    <Group wrap="nowrap" align="flex-start">
      <ThemeIcon size={42} radius="md" variant="light" color="orange">↓</ThemeIcon>
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={750} truncate>{filename}</Text>
        <Text size="xs" c="dimmed" mt={3}>Noch nicht auf diesem Gerät gespeichert</Text>
      </Box>
      <Badge color="orange" variant="light" size="sm">Online</Badge>
    </Group>
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
