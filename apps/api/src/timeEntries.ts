import { RedmineError } from './redmine.js';

export type TimeEntryInput = {
  issueId: number;
  activityId: number;
  spentOn: string;
  hours: number;
  comments: string;
};

/** Validate client input before reaching the Redmine REST API. */
export function validateTimeEntry(input: unknown): TimeEntryInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RedmineError(400, 'Ungültige Zeitbuchung');
  }
  const obj = input as Record<string, unknown>;
  const positiveId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (!positiveId(obj.issueId) || !positiveId(obj.activityId)) {
    throw new RedmineError(400, 'Auftrag und Tätigkeit müssen gültige IDs haben');
  }
  if (typeof obj.hours !== 'number' || !Number.isFinite(obj.hours) ||
      obj.hours <= 0 || obj.hours > 24 || Math.round(obj.hours * 100) / 100 !== obj.hours) {
    throw new RedmineError(400, 'Stunden müssen zwischen 0,01 und 24 liegen (maximal zwei Nachkommastellen)');
  }
  if (typeof obj.spentOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.spentOn) ||
      Number.isNaN(Date.parse(obj.spentOn)) ||
      new Date(obj.spentOn).toISOString().slice(0, 10) !== obj.spentOn) {
    throw new RedmineError(400, 'Datum muss ein gültiges ISO-Datum (JJJJ-MM-TT) sein');
  }
  if (obj.comments !== undefined && typeof obj.comments !== 'string') {
    throw new RedmineError(400, 'Bemerkung muss Text sein');
  }
  const comments = (obj.comments ?? '') as string;
  if (comments.length > 255) {
    throw new RedmineError(400, 'Bemerkung darf höchstens 255 Zeichen enthalten');
  }
  return {
    issueId: obj.issueId,
    activityId: obj.activityId,
    spentOn: obj.spentOn,
    hours: obj.hours,
    comments: comments.trim(),
  };
}

export function timeEntryPayload(entry: TimeEntryInput) {
  return {
    time_entry: {
      issue_id: entry.issueId,
      activity_id: entry.activityId,
      spent_on: entry.spentOn,
      hours: entry.hours,
      comments: entry.comments,
    },
  };
}
