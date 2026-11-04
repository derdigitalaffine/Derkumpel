import { Badge, Box, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { RedmineIssue } from '../types';
import { dueInfo } from './IssueCard';
import { issueAddress, statusColor } from '../issueUtils';
import { UIIcon } from './UIIcon';

/** High-density accessible mobile list row, shared status semantics with the full issue cards. */
export function CompactIssueRow({ issue }: { issue: RedmineIssue }) {
  const due = issue.closed_on ? undefined : dueInfo(issue.due_date);
  const address = issueAddress(issue);
  return <UnstyledButton component={Link} to={`/issues/${issue.id}`} className="compact-issue"
    aria-label={`Ticket ${issue.id}: ${issue.subject}, ${issue.status.name}`}>
    <Box className="compact-issue-main">
      <Group justify="space-between" gap={6} wrap="nowrap">
        <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
          <Badge variant="light" color={statusColor(issue.status.name)} size="sm">{issue.status.name}</Badge>
          <Text size="xs" c="dimmed" fw={650}>{issue.tracker.name}</Text>
        </Group>
        <Text size="xs" c="dimmed" fw={700} style={{ flexShrink: 0 }}>#{issue.id}</Text>
      </Group>
      <Text fw={780} size="sm" lh={1.34} className="compact-issue-title" mt={5}>{issue.subject}</Text>
      <Group gap={11} mt={6} wrap="wrap" align="center">
        {address && <Group gap={4} wrap="nowrap" style={{ minWidth: 0, maxWidth: '100%' }}>
          <UIIcon name="pin" size={14} />
          <Text size="xs" c="dimmed" truncate>{address}</Text>
        </Group>}
        {due?.label && <Group gap={4} wrap="nowrap" c={due.urgent ? 'red.7' : 'dimmed'}>
          <UIIcon name="calendar" size={14} /><Text size="xs" fw={due.urgent ? 750 : 600}>{due.label}</Text>
        </Group>}
        {issue.closed_on && <Text size="xs" c="dimmed">Abgeschlossen</Text>}
      </Group>
    </Box>
    <Box className="compact-issue-arrow"><UIIcon name="chevron-right" size={18} /></Box>
  </UnstyledButton>;
}
