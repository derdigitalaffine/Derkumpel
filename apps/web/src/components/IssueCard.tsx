import { Badge, Card, Group, Progress, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { RedmineIssue } from '../types';
import { dateLabel, issueAddress, statusColor } from '../issueUtils';

export function IssueCard({ issue }: { issue: RedmineIssue }) {
  const address = issueAddress(issue);
  return <Card component={Link} to={`/issues/${issue.id}`} withBorder radius="lg" padding="md" className="issue-card" style={{ color: 'inherit', textDecoration: 'none' }}>
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs"><Badge color={statusColor(issue.status.name)} variant="light">{issue.status.name}</Badge><Badge color="gray" variant="light">#{issue.id}</Badge></Group>
        <Text size="xs" fw={700} c="dimmed">{issue.priority.name}</Text>
      </Group>
      <Text fw={800} size="lg" lh={1.25}>{issue.subject}</Text>
      {address && <Text fw={650} size="sm">⌖ {address}</Text>}
      <Group gap="md">
        {issue.due_date && <Text size="sm" c="dimmed">Fällig {dateLabel(issue.due_date)}</Text>}
        {issue.assigned_to && <Text size="sm" c="dimmed">{issue.assigned_to.name}</Text>}
      </Group>
      <Group gap="sm" wrap="nowrap"><Progress value={issue.done_ratio ?? 0} size="sm" radius="xl" style={{ flex: 1 }} /><Text size="xs" fw={700}>{issue.done_ratio ?? 0}%</Text></Group>
    </Stack>
  </Card>;
}
