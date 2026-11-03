import type { AppConfig } from './config.js';
import type { CredentialEnvelope } from './session.js';

export class RedmineError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

function authHeader(creds: CredentialEnvelope): string {
  return `Basic ${Buffer.from(`${creds.username}:${creds.password}`, 'utf8').toString('base64')}`;
}

function buildUrl(config: AppConfig, path: string): URL {
  const base = new URL(config.redmineBaseUrl.toString());
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error('Refusing cross-origin Redmine request');
  return url;
}

async function request(config: AppConfig, creds: CredentialEnvelope, path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.redmineTimeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', authHeader(creds));
    headers.set('Accept', 'application/json');
    const response = await fetch(buildUrl(config, path), { ...init, headers, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function redmineJson<T>(config: AppConfig, creds: CredentialEnvelope, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await request(config, creds, path, { ...init, headers });
  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) throw new RedmineError(response.status, `Redmine request failed (${response.status})`, payload);
  return payload as T;
}

export async function redmineBinary(config: AppConfig, creds: CredentialEnvelope, urlOrPath: string): Promise<{ body: ArrayBuffer; contentType: string; filename?: string }> {
  let path = urlOrPath;
  if (/^https?:/i.test(urlOrPath)) {
    const url = new URL(urlOrPath);
    if (url.origin !== config.redmineBaseUrl.origin) throw new Error('Refusing attachment from foreign origin');
    path = `${url.pathname}${url.search}`;
  }
  const response = await request(config, creds, path);
  if (!response.ok) throw new RedmineError(response.status, `Redmine attachment failed (${response.status})`);
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8''|\")?([^\";]+)/i.exec(disposition);
  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    filename: match ? decodeURIComponent(match[1] ?? '') : undefined,
  };
}

export async function uploadToRedmine(config: AppConfig, creds: CredentialEnvelope, filename: string, contentType: string, bytes: Buffer): Promise<{ token: string }> {
  const path = `/uploads.json?filename=${encodeURIComponent(filename)}`;
  const response = await request(config, creds, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  const payload = await response.json() as { upload?: { token?: string } };
  if (!response.ok || !payload.upload?.token) throw new RedmineError(response.status, 'Redmine upload failed', payload);
  return { token: payload.upload.token };
}

export type RedmineUserResponse = {
  user: { id: number; login: string; firstname: string; lastname: string; mail?: string; groups?: Array<{ id: number; name: string }> };
};

export type RedmineIssueList = { issues: Array<Record<string, unknown>>; total_count?: number; limit?: number; offset?: number };

export async function fetchCurrentUser(config: AppConfig, creds: CredentialEnvelope): Promise<RedmineUserResponse> {
  return redmineJson(config, creds, '/users/current.json?include=groups,memberships');
}

async function listAssigned(config: AppConfig, creds: CredentialEnvelope, assignee: string, status: string): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    const qs = new URLSearchParams({ assigned_to_id: assignee, status_id: status, limit: '100', offset: String(offset), include: 'attachments,relations', sort: 'updated_on:desc' });
    const page = await redmineJson<RedmineIssueList>(config, creds, `/issues.json?${qs.toString()}`);
    result.push(...page.issues);
    const total = page.total_count ?? result.length;
    if (result.length >= total || page.issues.length === 0) break;
    offset += page.issues.length;
  }
  return result;
}

export async function fetchMyWork(config: AppConfig, creds: CredentialEnvelope, status = 'open'): Promise<{ issues: Array<Record<string, unknown>>; user: RedmineUserResponse['user'] }> {
  const current = await fetchCurrentUser(config, creds);
  const scopes = ['me', ...(current.user.groups ?? []).map((g) => String(g.id))];
  const pages = await Promise.all(scopes.map((scope) => listAssigned(config, creds, scope, status)));
  const byId = new Map<number, Record<string, unknown>>();
  for (const issue of pages.flat()) {
    const id = Number(issue.id);
    if (Number.isInteger(id)) byId.set(id, issue);
  }
  return { issues: [...byId.values()], user: current.user };
}
