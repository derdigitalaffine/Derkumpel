import { Badge, Box, Card, Group, Progress, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { RedmineIssue } from '../types';
import { dateLabel, issueAddress, statusColor } from '../issueUtils';

function dueState(value?: string): { label?: string; color: string } {
  if (!value) return { color: 'gray' };
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delta = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (delta < 0) return { label: `Überfällig · ${dateLabel(value)}`, color: 'red' };
  if (delta === 0) return { label: 'Heute fällig', color: 'orange' };
  if (delta === 1) return { label: 'Morgen fällig', color: 'yellow' };
  return { label: `Fällig ${dateLabel(value)}`, color: 'gray' };
}

export function IssueCard({ issue }: { issue: RedmineIssue }) {
  const address = issueAddress(issue);
  const due = dueState(issue.due_date);
  const done = issue.done_ratio ?? 0;

  return <Card
    component={Link}
    to={`/issues/${issue.id}`}
    withBorder
    padding="md"
    className="issue-card"
    style={{ color: 'inherit', textDecoration: 'none' }}
    aria-label={`Auftrag ${issue.id}: ${issue.subject}`}
  >
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Group gap={6} wrap="wrap">
          <Badge color={statusColor(issue.status.name)} variant="light">{issue.status.name}</Badge>
          <Badge color="gray" variant="outline">{issue.tracker.name}</Badge>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Badge color="gray" variant="light">{issue.priority.name}</Badge>
          <Text className="issue-chevron" aria-hidden="true">›</Text>
        </Group>
      </Group>

      <Box>
        <Text fw={850} fz="lg" lh={1.22} style={{ letterSpacing: '-0.015em' }}>{issue.subject}</Text>
        <Text size="xs" c="dimmed" mt={4}>Auftrag #{issue.id}</Text>
      </Box>

      {address && <Box className="issue-location">
        <Group gap={8} wrap="nowrap" align="flex-start">
          <Text aria-hidden="true" fw={900}>⌖</Text>
          <Text fw={700} size="sm" lh={1.35}>{address}</Text>
        </Group>
      </Box>}

      <Group gap="xs" justify="space-between" align="center">
        <Group gap={6} wrap="wrap">
          {due.label && <Badge color={due.color} variant={due.color === 'gray' ? 'light' : 'filled'}>{due.label}</Badge>}
          {issue.assigned_to && <Text size="sm" c="dimmed" fw={600}>👤 {issue.assigned_to.name}</Text>}
        </Group>
      </Group>

      {done > 0 && <Group gap="sm" wrap="nowrap">
        <Progress value={done} size="sm" radius="xl" style={{ flex: 1 }} color={done >= 100 ? 'green' : 'blue'} />
        <Text size="xs" fw={800} c="dimmed">{done}%</Text>
      </Group>}
    </Stack>
  </Card>;
}
