export type PushEventKind = 'assignment' | 'status' | 'comment' | 'priority' | 'dates';
export type PushPreferences = Record<PushEventKind, boolean>;
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  assignment: true, status: true, comment: true, priority: true, dates: true,
};

export type IssueSnapshot = {
  issueId: number;
  updatedOn: string;
  statusId: number;
  priorityId: number;
  startDate: string | null;
  dueDate: string | null;
};
export type IssueChange = {
  id: number;
  updated_on: string;
  status: { id: number };
  priority: { id: number };
  start_date?: string | null;
  due_date?: string | null;
};

/** Each returned category is based solely on fields the Redmine user can actually read. */
export function compareIssue(previous: IssueSnapshot | undefined, current: IssueChange, hasNewOtherComment: boolean): PushEventKind[] {
  if (!previous) return ['assignment'];
  if (previous.updatedOn === current.updated_on) return [];
  const result: PushEventKind[] = [];
  if (hasNewOtherComment) result.push('comment');
  if (previous.statusId !== current.status.id) result.push('status');
  if (previous.priorityId !== current.priority.id) result.push('priority');
  if (previous.startDate !== (current.start_date ?? null) || previous.dueDate !== (current.due_date ?? null)) result.push('dates');
  return result;
}

export function toSnapshot(issue: IssueChange): IssueSnapshot {
  return {
    issueId: issue.id,
    updatedOn: issue.updated_on,
    statusId: issue.status.id,
    priorityId: issue.priority.id,
    startDate: issue.start_date ?? null,
    dueDate: issue.due_date ?? null,
  };
}

export function firstEnabledEvent(kinds: PushEventKind[], prefs: PushPreferences): PushEventKind | undefined {
  return kinds.find((kind) => prefs[kind]);
}

export function prefsFromUnknown(raw: unknown): PushPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_PUSH_PREFERENCES };
  const input = raw as Record<string, unknown>;
  return Object.fromEntries((Object.keys(DEFAULT_PUSH_PREFERENCES) as PushEventKind[]).map((key) =>
    [key, typeof input[key] === 'boolean' ? input[key] : DEFAULT_PUSH_PREFERENCES[key]],
  )) as PushPreferences;
}

export function notificationText(kind: PushEventKind): { title: string; body: string } {
  switch (kind) {
    case 'assignment': return { title: 'Neuer Auftrag', body: 'Ein Auftrag wurde dir oder deiner Gruppe zugewiesen.' };
    case 'comment': return { title: 'Neue Rückmeldung', body: 'Es gibt einen neuen Kommentar zu deinem Auftrag.' };
    case 'status': return { title: 'Status geändert', body: 'Der Status eines Auftrags hat sich geändert.' };
    case 'priority': return { title: 'Priorität geändert', body: 'Die Priorität eines Auftrags hat sich geändert.' };
    case 'dates': return { title: 'Termin geändert', body: 'Ein Auftrag hat einen neuen Beginn oder Fälligkeitstermin.' };
  }
}
