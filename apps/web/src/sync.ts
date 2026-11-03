import { api, ApiError, AuthRequiredError } from './api';
import { db, getSetting, type OutboxRecord } from './db';
import { prepareOfflinePreview } from './image';
import { redminePatchValue, sameValue } from './issueUtils';
import type { RedmineIssue } from './types';

let activeSync: Promise<void> | undefined;

type AttachmentCacheWarning = { attachmentId: number; issueId: number; filename: string; message: string };
type AttachmentFailure = { retryAfter: number; message: string };

async function setSync(key: string, value: unknown): Promise<void> { await db.syncState.put({ key, value }); }
function attachmentFailureKey(id: number): string { return `attachmentFailure:${id}`; }

async function storeFreshIssue(fresh: RedmineIssue): Promise<void> {
  const existing = await db.issues.get(fresh.id);
  const active = existing?.active ?? 0;
  await db.issues.put({
    id: fresh.id,
    data: fresh,
    active,
    staleSince: active === 1 ? undefined : (existing?.staleSince ?? Date.now()),
    syncedAt: Date.now(),
  });
}

export async function queueIssueUpdate(issue: RedmineIssue, patch: Record<string, unknown>, optimistic?: (current: RedmineIssue) => RedmineIssue): Promise<string> {
  const id = crypto.randomUUID();
  const baseValues = Object.fromEntries(Object.keys(patch).map((key) => [key, redminePatchValue(issue, key)]));
  await db.transaction('rw', db.outbox, db.issues, async () => {
    await db.outbox.put({ id, issueId: issue.id, kind: 'update', createdAt: Date.now(), attempts: 0, state: 'pending', baseUpdatedOn: issue.updated_on, baseValues, payload: patch });
    if (optimistic) {
      const record = await db.issues.get(issue.id);
      if (record) await db.issues.put({ ...record, data: optimistic(record.data) });
    }
  });
  void syncNow();
  return id;
}

export async function queueComment(issue: RedmineIssue, notes: string, privateNote: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await db.outbox.put({ id, issueId: issue.id, kind: 'comment', createdAt: Date.now(), attempts: 0, state: 'pending', baseUpdatedOn: issue.updated_on, payload: { notes, private: privateNote } });
  void syncNow();
  return id;
}

export async function queueAttachment(issue: RedmineIssue, blob: Blob, filename: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.outbox.put({ id, issueId: issue.id, kind: 'attachment', createdAt: Date.now(), attempts: 0, state: 'pending', baseUpdatedOn: issue.updated_on, payload: { filename, contentType: blob.type }, blob });
  void syncNow();
  return id;
}

function wasCommentAlreadyApplied(remote: RedmineIssue, record: OutboxRecord): boolean {
  const notes = String(record.payload.notes ?? '').trim();
  if (!notes) return false;
  const threshold = record.createdAt - 2 * 60_000;
  return (remote.journals ?? []).some((journal) => journal.notes?.trim() === notes && Boolean(journal.private_notes) === Boolean(record.payload.private) && Date.parse(journal.created_on) >= threshold);
}

function wasAttachmentAlreadyApplied(remote: RedmineIssue, record: OutboxRecord): boolean {
  if (!record.blob) return false;
  const filename = String(record.payload.filename ?? '');
  const threshold = record.createdAt - 2 * 60_000;
  return (remote.attachments ?? []).some((attachment) => attachment.filename === filename && attachment.filesize === record.blob!.size && Date.parse(attachment.created_on) >= threshold);
}

async function replay(record: OutboxRecord): Promise<void> {
  const remote = await api.issue(record.issueId);
  if (record.kind === 'update') {
    const conflicts = Object.entries(record.payload).filter(([key]) => !sameValue(redminePatchValue(remote, key), record.baseValues?.[key]));
    if (conflicts.length > 0) {
      await db.outbox.update(record.id, { state: 'conflict', conflict: { server: remote, local: record.payload, reason: `Parallel geändert: ${conflicts.map(([key]) => key).join(', ')}` } });
      return;
    }
    await api.updateIssue(record.issueId, record.payload);
  } else if (record.kind === 'comment') {
    if (!wasCommentAlreadyApplied(remote, record)) await api.comment(record.issueId, String(record.payload.notes ?? ''), Boolean(record.payload.private));
  } else if (record.kind === 'attachment') {
    if (!record.blob) throw new Error('Lokale Datei fehlt');
    if (!wasAttachmentAlreadyApplied(remote, record)) await api.uploadAttachment(record.issueId, record.blob, String(record.payload.filename ?? 'foto.jpg'));
  }
  await db.outbox.delete(record.id);
  const fresh = await api.issue(record.issueId);
  await storeFreshIssue(fresh);
}

function isPermanentApiFailure(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
}

async function replayOutbox(): Promise<void> {
  const queue = await db.outbox.where('state').anyOf('pending', 'retrying').sortBy('createdAt');
  for (const record of queue) {
    try {
      await db.outbox.update(record.id, { state: 'retrying', attempts: record.attempts + 1, lastError: undefined });
      await replay({ ...record, attempts: record.attempts + 1, state: 'retrying' });
    } catch (error) {
      if (error instanceof AuthRequiredError) throw error;
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      if (isPermanentApiFailure(error)) {
        const remote = await api.issue(record.issueId).catch(() => undefined);
        await db.outbox.update(record.id, {
          state: 'conflict',
          attempts: record.attempts + 1,
          lastError: message,
          conflict: { server: remote ?? null, local: record.payload, reason: `Redmine hat die Änderung abgelehnt (${error.status}).` },
        });
      } else {
        await db.outbox.update(record.id, { state: 'retrying', attempts: record.attempts + 1, lastError: message });
      }
    }
  }
}

async function withLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  }));
}

async function cacheAttachments(issue: RedmineIssue, warnings: AttachmentCacheWarning[]): Promise<void> {
  const attachments = issue.attachments ?? [];
  await withLimit(attachments, 3, async (attachment) => {
    const existing = await db.attachments.get(attachment.id);
    if (existing) return;

    const failureRecord = await db.syncState.get(attachmentFailureKey(attachment.id));
    const failure = failureRecord?.value as AttachmentFailure | undefined;
    if (failure && failure.retryAfter > Date.now()) {
      warnings.push({ attachmentId: attachment.id, issueId: issue.id, filename: attachment.filename, message: failure.message });
      return;
    }

    try {
      let blob = await api.attachmentBlob(attachment.content_url);
      if (blob.type.startsWith('image/')) blob = await prepareOfflinePreview(blob, attachment.filename);
      await db.attachments.put({ id: attachment.id, issueId: issue.id, filename: attachment.filename, contentType: attachment.content_type || blob.type, size: blob.size, createdOn: attachment.created_on, blob, cachedAt: Date.now() });
      await db.syncState.delete(attachmentFailureKey(attachment.id));
    } catch (error) {
      if (error instanceof AuthRequiredError) throw error;
      const message = error instanceof Error ? error.message : 'Anhang konnte nicht offline gespeichert werden';
      const retryAfter = Date.now() + 10 * 60_000;
      await db.syncState.put({ key: attachmentFailureKey(attachment.id), value: { retryAfter, message } satisfies AttachmentFailure });
      warnings.push({ attachmentId: attachment.id, issueId: issue.id, filename: attachment.filename, message });
    }
  });
}

async function refreshMyWork(): Promise<void> {
  const list = await api.myIssues();
  const activeIds = new Set(list.issues.map((issue) => issue.id));
  const existing = await db.issues.toArray();
  const now = Date.now();
  const attachmentWarnings: AttachmentCacheWarning[] = [];
  await db.transaction('rw', db.issues, async () => {
    for (const record of existing) {
      if (!activeIds.has(record.id) && record.active === 1) await db.issues.update(record.id, { active: 0, staleSince: now });
    }
  });
  await withLimit(list.issues, 4, async (summary) => {
    const detail = await api.issue(summary.id);
    await db.issues.put({ id: detail.id, data: detail, active: 1, staleSince: undefined, syncedAt: now });
    await cacheAttachments(detail, attachmentWarnings);
  });
  await setSync('attachmentWarnings', attachmentWarnings);
  await db.settings.put({ key: 'lastUser', value: list.user });
}

async function purgeStale(): Promise<void> {
  const retentionDays = await getSetting('retentionDays', 30);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const stale = await db.issues.where('active').equals(0).and((record) => (record.staleSince ?? Infinity) < cutoff).toArray();
  for (const record of stale) {
    if ((await db.outbox.where('issueId').equals(record.id).count()) > 0) continue;
    await db.transaction('rw', db.issues, db.attachments, async () => {
      await db.attachments.where('issueId').equals(record.id).delete();
      await db.issues.delete(record.id);
    });
  }
}

async function doSync(): Promise<void> {
  if (!navigator.onLine) { await setSync('status', { state: 'offline', at: Date.now() }); return; }
  await setSync('status', { state: 'syncing', at: Date.now() });
  try {
    await replayOutbox();
    await refreshMyWork();
    await purgeStale();
    await setSync('status', { state: 'idle', at: Date.now(), lastSuccess: Date.now() });
    await setSync('authRequired', false);
  } catch (error) {
    if (error instanceof AuthRequiredError) await setSync('authRequired', true);
    await setSync('status', { state: 'error', at: Date.now(), message: error instanceof Error ? error.message : 'Synchronisation fehlgeschlagen' });
    throw error;
  }
}

export function syncNow(): Promise<void> {
  if (!activeSync) activeSync = doSync().finally(() => { activeSync = undefined; });
  return activeSync;
}

export function startSyncLoop(onAuthRequired?: () => void): () => void {
  let disposed = false;
  let timer: number | undefined;
  const run = () => void syncNow().catch((error) => { if (error instanceof AuthRequiredError) onAuthRequired?.(); });
  const onVisible = () => { if (document.visibilityState === 'visible') run(); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisible);
  void api.config().then((cfg) => {
    if (!disposed) timer = window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, Math.max(120_000, cfg.pollIntervalMs));
  }).catch(() => { if (!disposed) timer = window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, 120_000); });
  run();
  return () => { disposed = true; window.removeEventListener('online', run); document.removeEventListener('visibilitychange', onVisible); if (timer) window.clearInterval(timer); };
}

export async function resolveConflict(id: string, choice: 'server' | 'local'): Promise<void> {
  const record = await db.outbox.get(id);
  if (!record || record.state !== 'conflict') return;
  if (choice === 'server') {
    await db.outbox.delete(id);
    const fresh = await api.issue(record.issueId);
    await storeFreshIssue(fresh);
  } else {
    if (record.kind === 'update') await api.updateIssue(record.issueId, record.payload);
    else if (record.kind === 'comment') await api.comment(record.issueId, String(record.payload.notes ?? ''), Boolean(record.payload.private));
    else if (record.kind === 'attachment' && record.blob) await api.uploadAttachment(record.issueId, record.blob, String(record.payload.filename ?? 'foto.jpg'));
    await db.outbox.delete(id);
    const fresh = await api.issue(record.issueId);
    await storeFreshIssue(fresh);
  }
}
