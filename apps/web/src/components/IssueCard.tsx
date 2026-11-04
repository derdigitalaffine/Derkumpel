import { Badge, Box, Card, Group, Progress, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { RedmineIssue } from '../types';
import { dateLabel, issueAddress, statusColor } from '../issueUtils';
import { UIIcon } from './UIIcon';

const statusAccent: Record<string, string> = {
  blue: '#4e94be', green: '#74aa44', orange: '#dfa449', red: '#d46e69', gray: '#8da8b6',
};

/** Pure, date-only classification so the same due cues work through DST changes. */
export function dueInfo(value?: string, now: Date = new Date()) {
  if (!value) return { label: undefined, color: 'gray', urgent: false };
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(timestamp)) return { label: value, color: 'gray', urgent: false };
  const [y, m, d] = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  const startDay = Date.UTC(y, m - 1, d);
  const [year, month, day] = value.split('-').map(Number);
  const dueDay = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const days = Math.round((dueDay - startDay) / 86_400_000);
  if (days < 0) return { label: `Überfällig · ${dateLabel(value)}`, color: 'red', urgent: true };
  if (days === 0) return { label: 'Heute fällig', color: 'orange', urgent: true };
  if (days === 1) return { label: 'Morgen fällig', color: 'yellow', urgent: false };
  return { label: `Fällig ${dateLabel(value)}`, color: 'gray', urgent: false };
}

function urgentPriority(name: string): boolean {
  return /dringend|hoch|sofort|kritisch/i.test(name);
}

export function IssueCard({ issue, to }: { issue: RedmineIssue; to?: string }) {
  const status = statusColor(issue.status.name);
  const address = issueAddress(issue);
  const due = issue.closed_on
    ? { label: `Geschlossen · ${dateLabel(issue.closed_on.slice(0, 10))}`, color: 'gray', urgent: false }
    : dueInfo(issue.due_date);
  const done = issue.done_ratio ?? 0;

  return <Card component={Link} to={to ?? `/issues/${issue.id}`} withBorder
    className="issue-card" padding="md"
    style={{ '--issue-accent': statusAccent[status] ?? statusAccent.gray, color: 'inherit', textDecoration: 'none' } as CSSProperties}
    aria-label={`Auftrag ${issue.id}: ${issue.subject}, ${issue.status.name}`}>
    <Stack gap="sm">
      <Group justify="space-between" align="center" wrap="nowrap" gap={7}>
        <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
          <Badge color={status} variant="light" size="md">{issue.status.name}</Badge>
          <Badge color="gray" variant="outline" size="sm">{issue.tracker.name}</Badge>
        </Group>
        <Group gap={5} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Text size="xs" fw={750} c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>#{issue.id}</Text>
          <span className="issue-chevron"><UIIcon name="chevron-right" size={17} /></span>
        </Group>
      </Group>

      <Text fw={820} className="issue-card-title">{issue.subject}</Text>

      {address && <Box className="issue-location">
        <Group gap={8} wrap="nowrap" align="flex-start">
          <UIIcon name="pin" size={17} />
          <Text size="sm" fw={680} lh={1.38} style={{ overflowWrap: 'anywhere' }}>{address}</Text>
        </Group>
      </Box>}

      <Group className="issue-footer" justify="space-between" align="center" gap="xs" wrap="wrap">
        <Group gap={6} wrap="wrap">
          {due.label ? <Badge variant={due.urgent ? 'filled' : 'light'} color={due.color}
            size="sm" leftSection={<UIIcon name="calendar" size={12} />}>{due.label}</Badge>
            : <Text size="xs" c="dimmed">Kein Fälligkeitsdatum</Text>}
        </Group>
        {issue.assigned_to && <Group gap={5} wrap="nowrap" style={{ maxWidth: '100%' }}>
          <UIIcon name="user" size={14} />
          <Text size="xs" c="dimmed" fw={650} truncate>{issue.assigned_to.name}</Text>
        </Group>}
      </Group>

      {(done > 0 || urgentPriority(issue.priority.name)) && <Group gap="sm" wrap="nowrap">
        {done > 0 ? <>
          <Progress value={done} size={5} radius="xl" style={{ flex: 1 }}
            color={done >= 100 ? 'green' : 'brand'} aria-label={`Fortschritt ${done} Prozent`} />
          <Text size="xs" fw={800} c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>{done}%</Text>
        </> : <Box style={{ flex: 1 }} />}
        {urgentPriority(issue.priority.name) && <Badge color="red" size="sm" variant="light">{issue.priority.name}</Badge>}
      </Group>}
    </Stack>
  </Card>;
}
