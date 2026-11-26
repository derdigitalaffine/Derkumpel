import Dexie, { type EntityTable } from 'dexie';
import type { RapportReport } from './rapportBook';
import type { RedmineIssue } from './types';

export type IssueRecord = { id: number; data: RedmineIssue; syncedAt: number; active: 0 | 1; staleSince?: number };
export type AttachmentRecord = { id: number; issueId: number; filename: string; contentType: string; size: number; createdOn: string; blob: Blob; cachedAt: number };
export type OutboxKind = 'update' | 'comment' | 'attachment';
export type OutboxState = 'pending' | 'retrying' | 'conflict';
export type OutboxRecord = {
  id: string;
  issueId: number;
  kind: OutboxKind;
  createdAt: number;
  attempts: number;
  state: OutboxState;
  baseUpdatedOn?: string;
  baseValues?: Record<string, unknown>;
  payload: Record<string, unknown>;
  blob?: Blob;
  conflict?: { server: unknown; local: unknown; reason: string };
  lastError?: string;
};
export type RapportCaptureBody={actorId:number;date:string;employees:number[];line:{sourceIds?:number[];id:string;start:string;end:string;kind:'work';activity:string;order:string;machines:never[];materials:never[]}};
export type RapportQueueRecord={id:string;ownerId:number;createdAt:number;body:RapportCaptureBody;state:'pending'|'retrying'|'conflict';message?:string};
export type RapportLocalDraft={key:string;ownerId:number;report:RapportReport;reason:string;updatedAt:number};
export type SettingRecord = { key: string; value: unknown };
export type SyncStateRecord = { key: string; value: unknown };

class DerkumpelDB extends Dexie {
  issues!: EntityTable<IssueRecord, 'id'>;
  attachments!: EntityTable<AttachmentRecord, 'id'>;
  outbox!: EntityTable<OutboxRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  rapportQueue!: EntityTable<RapportQueueRecord,'id'>;
  rapportDrafts!: EntityTable<RapportLocalDraft,'key'>;
  syncState!: EntityTable<SyncStateRecord, 'key'>;

  constructor() {
    super('derkumpel');
    this.version(1).stores({
      issues: 'id, active, staleSince, syncedAt, data.updated_on, data.status.id, data.tracker.id',
      attachments: 'id, issueId, cachedAt',
      outbox: 'id, issueId, kind, state, createdAt',
      settings: 'key',
      syncState: 'key',
    });
    this.version(2).stores({rapportQueue:'id, ownerId, createdAt, state'});
    this.version(3).stores({rapportDrafts:'key,ownerId,updatedAt'});
  }
}

export const db = new DerkumpelDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  return (record?.value as T | undefined) ?? fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function clearBusinessData(): Promise<void> {
  await db.transaction('rw', db.issues, db.attachments, db.outbox, db.syncState, db.settings, async () => {
    await Promise.all([db.issues.clear(), db.attachments.clear(), db.outbox.clear(), db.syncState.clear(), db.settings.delete('rapport-roster'),db.settings.delete('green-cache'),db.settings.delete('rapport-view-cache')]);
  });
}
