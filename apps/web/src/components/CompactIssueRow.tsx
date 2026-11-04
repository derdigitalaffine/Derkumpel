import { Badge, Box, Group, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router-dom';
import { dateLabel, issueAddress, statusColor } from '../issueUtils';
import type { RedmineIssue } from '../types';
import { UIIcon } from './UIIcon';

export function CompactIssueRow({ issue }: { issue: RedmineIssue }) {
  const address = issueAddress(issue);
  const due = issue.closed_on ? undefined : issue.due_date;
  return <UnstyledButton component={Link} to={`/issues/${issue.id}`}
    className="compact-ticket-row" aria-label={`Ticket ${issue.id}: ${issue.subject}, ${issue.status.name}`}>
    <Box className="compact-ticket-number">#{issue.id}</Box>
    <Box className="compact-ticket-body">
      <Text fw={760} size="sm" className="compact-ticket-subject" lineClamp={1}>{issue.subject}</Text>
      <Group gap={5} wrap="nowrap" className="compact-ticket-secondary">
        <Text size="xs" c="dimmed" truncate>{issue.tracker.name}</Text>
        {address && <><Text size="xs" c="dimmed" aria-hidden="true">·</Text><Text size="xs" c="dimmed" truncate>{address}</Text></>}
        {due && <><Text size="xs" c="dimmed" aria-hidden="true">·</Text><Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{dateLabel(due)}</Text></>}
      </Group>
    </Box>
    <Badge size="sm" color={statusColor(issue.status.name)} variant="light" className="compact-ticket-status">{issue.status.name}</Badge>
    <UIIcon name="chevron-right" size={16} />
  </UnstyledButton>;
}
