import type { CurrentUser, PublicConfig, RedmineIssue } from './types';

export class AuthRequiredError extends Error {}
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) throw new AuthRequiredError('Anmeldung erforderlich');
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    const data = payload as { message?: string; details?: unknown };
    throw new ApiError(response.status, data.message ?? `HTTP ${response.status}`, data.details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type TicketBrowserStatus = 'open' | 'closed' | '*';
export type TicketBrowserPage = { issues: RedmineIssue[]; total_count: number; offset: number; limit: number };

export const api = {
  login: (username: string, password: string) => request<{ user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/api/auth/me'),
  config: () => request<PublicConfig>('/api/config'),
  myIssues: () => request<{ issues: RedmineIssue[]; user: CurrentUser }>('/api/issues/my'),
  visibleIssues: (status: TicketBrowserStatus = 'open') => request<{ issues: RedmineIssue[] }>(`/api/issues/visible?status=${encodeURIComponent(status)}`),
  browseIssues: (options: { status?: TicketBrowserStatus; trackerId?: number; projectId?: number; offset?: number; limit?: number } = {}) => {
    const params = new URLSearchParams();
    params.set('status', options.status ?? '*');
    if (options.trackerId) params.set('tracker_id', String(options.trackerId));
    if (options.projectId) params.set('project_id', String(options.projectId));
    params.set('offset', String(options.offset ?? 0));
    params.set('limit', String(options.limit ?? 50));
    return request<TicketBrowserPage>(`/api/issues/browse?${params.toString()}`);
  },
  issue: async (id: number) => (await request<{ issue: RedmineIssue }>(`/api/issues/${id}`)).issue,
  updateIssue: (id: number, issue: Record<string, unknown>) => request<void>(`/api/issues/${id}`, { method: 'PUT', body: JSON.stringify({ issue }) }),
  comment: (id: number, notes: string, privateNote = false) => request<void>(`/api/issues/${id}/comments`, { method: 'POST', body: JSON.stringify({ notes, private: privateNote }) }),
  uploadAttachment: (id: number, blob: Blob, filename: string) => {
    const form = new FormData();
    form.append('file', blob, filename);
    return request<{ ok: true }>(`/api/issues/${id}/attachments`, { method: 'POST', body: form });
  },
  attachmentBlob: async (contentUrl: string) => {
    const response = await fetch(`/api/attachments/content?url=${encodeURIComponent(contentUrl)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) throw new AuthRequiredError('Anmeldung erforderlich');
    if (!response.ok) throw new ApiError(response.status, `Anhang konnte nicht geladen werden (${response.status})`);
    return response.blob();
  },
  meta: <T>(kind: string) => request<T>(`/api/meta/${encodeURIComponent(kind)}`),
  projectMemberships: <T>(projectId: number) => request<T>(`/api/projects/${projectId}/memberships`),
};
