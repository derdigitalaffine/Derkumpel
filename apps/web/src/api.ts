import type { RapportReport, Catalog } from './rapportBook';
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

export type PushPreferences = { assignment: boolean; status: boolean; comment: boolean; priority: boolean; dates: boolean };
export type PushConfig = { enabled: boolean; publicKey: string | null };
export type DevicePushSubscription = { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null };

export type TicketBrowserStatus = 'open' | 'closed' | '*';
export type TicketBrowserPage = { issues: RedmineIssue[]; total_count: number; offset: number; limit: number; filterUnavailable?:boolean; nextOffset?:number; hasMore?:boolean; totalExact?:boolean };

export type TechnicalSelection={storageProjectId:number|null;storageTrackerId:number|null;greenProjectId:number|null;greenTrackerId:number|null;greenFieldId:number|null};
export type TechnicalSettings={selection:TechnicalSelection;defaults:TechnicalSelection;projects:{id:number;name:string;identifier:string;isPublic:boolean}[];trackers:{id:number;name:string;defaultStatusId:number|null}[];fields:{id:number;name:string;format:string}[];mode:string};
export const api = {
  technicalAccess:()=>request<{allowed:boolean}>('/api/rapport/settings/access'),
  technicalSettings:()=>request<TechnicalSettings>('/api/rapport/settings'),
  technicalProject:(id:number)=>request<{id:number;name:string;trackers:{id:number;name:string}[];isPublic:boolean}>('/api/rapport/settings/project/'+id),
  technicalSave:(value:TechnicalSelection)=>request<{selection:TechnicalSelection;storageProjectId:number;storageTrackerId:number}>('/api/rapport/settings',{method:'PUT',body:JSON.stringify(value)}),
  technicalCheck:()=>request<{checks:{label:string;ok:boolean;detail:string}[];elapsedMs:number}>('/api/rapport/settings/check'),
  materialRows:()=>request<import('./green').MaterialRows>('/api/rapport/materials'),
  classifyMaterial:(code:string,previous:'machine'|'material',kind:'machine'|'material',unit?:string)=>request<import('./green').MaterialRows>('/api/rapport/materials/'+encodeURIComponent(code)+'/classification',{method:'PUT',body:JSON.stringify({previous,kind,unit})}),
  addMaterialRow:(body:import('./green').MaterialItem)=>request<import('./green').MaterialRows>('/api/rapport/materials',{method:'POST',body:JSON.stringify(body)}),
  greenAssign:(body:import('./green').FreeOrderInput)=>request<{id:number}>('/api/rapport/green/assign',{method:'POST',body:JSON.stringify(body)}),
  greenActive:(operation:string)=>request<{baseSourceIds?:number[];accepted:import('./green').GreenTask[];pending:import('./green').GreenTask[]}>('/api/rapport/green/active/'+encodeURIComponent(operation)),
  greenAccept:(operation:string,id:number)=>request<{task:import('./green').GreenTask;baseSourceIds:number[]}>('/api/rapport/green/active/'+encodeURIComponent(operation)+'/accept/'+id,{method:'POST'}),
  greenMyCrews:()=>request<import('./crews').CrewOverview>('/api/rapport/green/my-crews'),
  greenAcceptCrew:(id:number,task:number)=>request<{task:import('./green').GreenTask}>('/api/rapport/green/crews/'+id+'/accept/'+task,{method:'POST'}),
  greenRecoveryList:()=>request<{crews:import('./crews').Crew[]}>('/api/rapport/green/recovery'),
  greenRecovery:(id:number)=>request<import('./crews').CrewRecovery>('/api/rapport/green/recovery/'+id),
  greenRecover:(id:number,body:unknown)=>request<{complete:boolean;results:{employee:number;ok:boolean;message?:string;reportId?:number}[]}>('/api/rapport/green/recovery/'+id,{method:'POST',body:JSON.stringify(body)}),
  greenStopCrew:(id:number)=>request<{id:number;endedAt:string}>('/api/rapport/green/crews/'+id+'/stop',{method:'POST'}),
  greenRemoteStop:(operation:string)=>request<{endedAt?:string;stoppedBy?:{id:number;name:string}}>('/api/rapport/green/stop/'+encodeURIComponent(operation)),
  greenCrews:()=>request<import('./crews').CrewOverview>('/api/rapport/green/crews'),
  greenEvent:(body:unknown)=>request<{id:number}>('/api/rapport/green/event',{method:'POST',body:JSON.stringify(body)}),
  greenTasks: () => request<{tasks:import('./green').GreenTask[]}>('/api/rapport/green/tasks'),
  rapportOrders: (q:string) => request<{orders:{id:number;subject:string}[]}>(`/api/rapport/orders?q=${encodeURIComponent(q)}`),
  rapportReviewAccess:()=>request<{allowed:boolean}>('/api/rapport/review/access'),
  rapportReview:(from:string,to:string)=>request<import('./review').ReviewData>('/api/rapport/review?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)),
  rapportHolidays:(year:number)=>request<import('./review').HolidayCalendar>('/api/rapport/holidays/'+year),
  rapportSaveHolidays:(year:number,body:{revision:string;description:string})=>request<import('./review').HolidayCalendar>('/api/rapport/holidays/'+year,{method:'PUT',body:JSON.stringify(body)}),
  rapportList: (from:string,to:string,all=false) => request<{reports:RapportReport[];dispatcher:boolean}>(`/api/rapport/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&all=${all?'1':'0'}`),
  rapportCorrection: (id:number,reason:string) => request<RapportReport>(`/api/rapport/reports/${id}/correction`,{method:'POST',body:JSON.stringify({reason})}),
  rapportArchive: (id:number) => request<{id:number}>(`/api/rapport/reports/${id}/archive`,{method:'POST'}),
  rapportDetail: (id:number) => request<RapportReport>(`/api/rapport/reports/${id}`),
  rapportSave: (id:number,body:unknown) => request<RapportReport>(`/api/rapport/reports/${id}`,{method:'PUT',body:JSON.stringify(body)}),
  rapportTransition: (id:number,body:unknown) => request<RapportReport>(`/api/rapport/reports/${id}/transition`,{method:'POST',body:JSON.stringify(body)}),
  rapportOrder: (id:number) => request<{id:number;subject:string}>(`/api/rapport/order/${id}`),
  rapportCatalog: () => request<Catalog>('/api/rapport/catalog'),
  rapportAddCatalog: (kind:string,name:string) => request<{id:number;name:string}>('/api/rapport/catalog',{method:'POST',body:JSON.stringify({kind,name})}),
  rapportCaptureCheck: (body:unknown) => request<{results:{employee:number;stored:boolean;editable:boolean;overlap:boolean;reportId?:number;overlaps?:{start:string;end:string;activity:string}[]}[]}>('/api/rapport/capture/check',{method:'POST',body:JSON.stringify(body)}),
  rapportCapture: (body:unknown) => request<{results:{employee:number;ok:boolean;message?:string;reportId?:number;status?:number;conflict?:{kind:'overlap';reportId?:number}}[]}>('/api/rapport/capture',{method:'POST',body:JSON.stringify(body)}),
  rapportUsers: () => request<{ users: { id: number; name: string; groups: string[] }[]; missingGroups: string[]; dispatcher?: boolean }>('/api/rapport/users'),
  login: (username: string, password: string) => request<{ user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/api/auth/me'),
  pushConfig: () => request<PushConfig>('/api/push/config'),
  pushSubscribe: (subscription: DevicePushSubscription, preferences: PushPreferences) => request<{ ok: true }>('/api/push/subscriptions', { method: 'POST', body: JSON.stringify({ subscription, preferences }) }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: true }>('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
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
