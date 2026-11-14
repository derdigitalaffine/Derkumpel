import { RedmineError } from './redmine.js';

export type IssueCreateRequest = {
  projectId: number;
  trackerId: number;
  subject: string;
  description?: string;
  dueDate?: string;
  priorityId?: number;
};

/** Whitelist and validate issue creation; Redmine remains authoritative for rights/workflows. */
export function validateIssueCreate(input: unknown): IssueCreateRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new RedmineError(400, 'Ungültiger Auftrag');
  const obj = input as Record<string, unknown>;
  const validId = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  if (!validId(obj.projectId) || !validId(obj.trackerId))
    throw new RedmineError(400, 'Projekt und Tracker sind erforderlich');
  if (typeof obj.subject !== 'string' || !obj.subject.trim() || obj.subject.length > 255)
    throw new RedmineError(400, 'Der Titel muss 1 bis 255 Zeichen enthalten');
  if (obj.description !== undefined && (typeof obj.description !== 'string' || obj.description.length > 20_000))
    throw new RedmineError(400, 'Beschreibung ist ungültig oder zu lang');
  if (obj.priorityId !== undefined && !validId(obj.priorityId))
    throw new RedmineError(400, 'Priorität ist ungültig');
  if (obj.dueDate !== undefined && (typeof obj.dueDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(obj.dueDate) || Number.isNaN(Date.parse(obj.dueDate)) ||
      new Date(obj.dueDate).toISOString().slice(0, 10) !== obj.dueDate))
    throw new RedmineError(400, 'Fälligkeitsdatum ist ungültig');
  return {
    projectId: obj.projectId, trackerId: obj.trackerId,
    subject: obj.subject.trim(), description: obj.description as string | undefined,
    priorityId: obj.priorityId as number | undefined, dueDate: obj.dueDate as string | undefined,
  };
}

export function issueCreatePayload(input: IssueCreateRequest) {
  return { issue: {
    project_id: input.projectId,
    tracker_id: input.trackerId,
    subject: input.subject,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.priorityId !== undefined ? { priority_id: input.priorityId } : {}),
    ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
  } };
}
