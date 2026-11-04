import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { decryptCredentials, encryptCredentials, type CredentialEnvelope } from './session.js';
import { fetchCurrentUser, fetchIssueBrowser, fetchMyWork, fetchVisibleIssues, redmineBinary, redmineJson, RedmineError, uploadToRedmine } from './redmine.js';
import { PushService } from './push.js';
import { prefsFromUnknown } from './push-events.js';

const config = loadConfig();
const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] }, bodyLimit: config.maxUploadBytes + 1024 * 1024 });
const SESSION_COOKIE = 'derkumpel_session';
const pushService = config.push.enabled ? new PushService(config, app.log) : undefined;
const mapOrigin = 'https://sgx.geodatenzentrum.de'; // Raster tiles are fetched directly by the client.

await app.register(cookie);
await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/api/')) return;
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (!unsafe) return;
  const origin = request.headers.origin;
  if (origin && origin !== config.publicBaseUrl.origin) {
    return reply.code(403).send({ error: 'invalid_origin', message: 'Ungültiger Anfrageursprung' });
  }
});

app.addHook('onSend', async (request, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
  reply.header('Content-Security-Policy', `default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ${mapOrigin}; worker-src 'self' blob:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
  if (request.url.startsWith('/api/') && !request.url.startsWith('/api/health/')) reply.header('Cache-Control', 'no-store');
  return payload;
});

function setSession(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionMaxAgeSeconds,
  });
}

function clearSession(reply: FastifyReply): void { reply.clearCookie(SESSION_COOKIE, { path: '/' }); }

function credentials(request: FastifyRequest): CredentialEnvelope {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) throw new RedmineError(401, 'Authentication required');
  try {
    const value = decryptCredentials(token, config.sessionKey);
    if (Date.now() - value.issuedAt > config.sessionMaxAgeSeconds * 1000) throw new Error('expired');
    return value;
  } catch {
    throw new RedmineError(401, 'Authentication required');
  }
}

function numeric(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new RedmineError(400, 'Invalid id');
  return id;
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function safeAttachmentUrl(value: string, expectedId?: number): string {
  const url = new URL(value, config.redmineBaseUrl);
  if (url.origin !== config.redmineBaseUrl.origin) throw new RedmineError(400, 'Invalid attachment URL');
  const match = /^\/attachments\/(?:download\/)?(\d+)(?:\/|$)/.exec(url.pathname);
  if (!match) throw new RedmineError(400, 'Invalid attachment URL');
  if (expectedId && Number(match[1]) !== expectedId) throw new RedmineError(400, 'Attachment URL does not match id');
  return url.toString();
}

function sendBinary(reply: FastifyReply, file: { body: ArrayBuffer; contentType: string; filename?: string }, filename?: string) {
  reply.header('Content-Type', file.contentType || 'application/octet-stream');
  const finalName = filename || file.filename;
  if (finalName) reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(finalName)}`);
  return reply.send(Buffer.from(file.body));
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof RedmineError) {
    if (error.status === 401) clearSession(reply);
    return reply.code(error.status).send({ error: error.status === 401 ? 'authentication_required' : 'redmine_error', message: error.status === 401 ? 'Anmeldung erforderlich' : error.message, details: error.payload });
  }
  app.log.error(error);
  return reply.code(500).send({ error: 'internal_error', message: 'Interner Fehler' });
});

app.get('/api/health/live', async () => ({ ok: true }));
app.get('/api/health/ready', async () => ({ ok: true, redmine: config.redmineBaseUrl.origin }));
app.get('/api/config', async () => ({ mapStyleUrl: config.mapStyleUrl, mapCenter: config.mapCenter, offlineMapBounds: config.offlineMapBounds, offlineMapRadiusKm: config.offlineMapRadiusKm, pollIntervalMs: config.pollIntervalMs }));

app.post('/api/auth/login', async (request, reply) => {
  const body = request.body as { username?: string; password?: string } | undefined;
  const username = body?.username?.trim() ?? '';
  const password = body?.password ?? '';
  if (!username || !password || username.length > 200 || password.length > 1000) return reply.code(400).send({ error: 'invalid_login' });
  const creds: CredentialEnvelope = { version: 1, username, password, issuedAt: Date.now() };
  try {
    const current = await fetchCurrentUser(config, creds);
    setSession(reply, encryptCredentials(creds, config.sessionKey));
    return { user: current.user };
  } catch (error) {
    if (error instanceof RedmineError && [401, 403].includes(error.status)) return reply.code(401).send({ error: 'invalid_login', message: 'Anmeldung fehlgeschlagen' });
    throw error;
  }
});


app.get('/api/push/config', async () => ({
  enabled: Boolean(pushService),
  publicKey: pushService ? config.push.vapidPublicKey : null,
  pollIntervalMs: config.push.pollIntervalMs,
}));

// Push subscriptions are strictly opt-in and bound to the *actual Redmine user*.
app.post('/api/push/subscribe', async (request, reply) => {
  if (!pushService) return reply.code(503).send({ error: 'push_disabled', message: 'Push-Dienst nicht aktiviert' });
  const creds = credentials(request);
  const user = await fetchCurrentUser(config, creds);
  const body = request.body as { subscription?: unknown; preferences?: unknown } | undefined;
  try {
    pushService.subscribe(user.user.id, creds, body?.subscription, body?.preferences);
  } catch (error) {
    if (error instanceof Error && /subscription|endpoint|keys/i.test(error.message)) {
      return reply.code(400).send({ error: 'invalid_subscription', message: 'Push-Abonnement ungültig' });
    }
    throw error;
  }
  return { ok: true };
});

app.post('/api/push/status', async (request, reply) => {
  if (!pushService) return reply.code(503).send({ error: 'push_disabled' });
  const creds = credentials(request);
  const user = await fetchCurrentUser(config, creds);
  const { endpoint } = (request.body ?? {}) as { endpoint?: string };
  if (!endpoint || endpoint.length > 2048) return reply.code(400).send({ error: 'invalid_endpoint' });
  return pushService.status(user.user.id, endpoint);
});

app.post('/api/push/preferences', async (request, reply) => {
  if (!pushService) return reply.code(503).send({ error: 'push_disabled' });
  const creds = credentials(request);
  const user = await fetchCurrentUser(config, creds);
  const { endpoint, preferences } = (request.body ?? {}) as { endpoint?: string; preferences?: unknown };
  if (!endpoint || endpoint.length > 2048) return reply.code(400).send({ error: 'invalid_endpoint' });
  if (!pushService.updatePreferences(user.user.id, endpoint, prefsFromUnknown(preferences))) {
    return reply.code(404).send({ error: 'subscription_missing' });
  }
  return { ok: true };
});

app.post('/api/push/unsubscribe', async (request, reply) => {
  if (!pushService) return reply.code(503).send({ error: 'push_disabled' });
  const creds = credentials(request);
  const user = await fetchCurrentUser(config, creds);
  const { endpoint } = (request.body ?? {}) as { endpoint?: string };
  if (!endpoint || endpoint.length > 2048) return reply.code(400).send({ error: 'invalid_endpoint' });
  pushService.unsubscribe(user.user.id, endpoint);
  return { ok: true };
});

app.post('/api/push/test', async (request, reply) => {
  if (!pushService) return reply.code(503).send({ error: 'push_disabled' });
  const creds = credentials(request);
  const user = await fetchCurrentUser(config, creds);
  const { endpoint } = (request.body ?? {}) as { endpoint?: string };
  if (!endpoint || endpoint.length > 2048) return reply.code(400).send({ error: 'invalid_endpoint' });
  try {
    const sent = await pushService.sendTest(user.user.id, endpoint);
    return sent ? { ok: true } : reply.code(404).send({ error: 'subscription_missing' });
  } catch (error) {
    if (error instanceof Error && /einmal pro Minute/.test(error.message)) return reply.code(429).send({ error: 'rate_limited', message: error.message });
    throw error;
  }
});

app.post('/api/auth/logout', async (_request, reply) => { clearSession(reply); return { ok: true }; });
app.get('/api/auth/me', async (request) => (await fetchCurrentUser(config, credentials(request))).user);

app.get('/api/issues/my', async (request) => {
  const query = request.query as { status?: string };
  const status = query.status && ['open', 'closed', '*'].includes(query.status) ? query.status : 'open';
  return fetchMyWork(config, credentials(request), status);
});

app.get('/api/issues/visible', async (request) => {
  const query = request.query as { status?: string };
  const status = query.status && ['open', 'closed', '*'].includes(query.status) ? query.status : 'open';
  return fetchVisibleIssues(config, credentials(request), status);
});

app.get('/api/issues/browse', async (request) => {
  const query = request.query as { status?: string; tracker_id?: string; project_id?: string; offset?: string; limit?: string };
  const status = query.status && ['open', 'closed', '*'].includes(query.status) ? query.status : '*';
  return fetchIssueBrowser(config, credentials(request), {
    status,
    trackerId: query.tracker_id ? numeric(query.tracker_id) : undefined,
    projectId: query.project_id ? numeric(query.project_id) : undefined,
    offset: boundedInt(query.offset, 0, 0, 1_000_000),
    limit: boundedInt(query.limit, 50, 1, 100),
  });
});

app.get('/api/issues/:id', async (request) => {
  const { id } = request.params as { id: string };
  return redmineJson(config, credentials(request), `/issues/${numeric(id)}.json?include=children,attachments,relations,journals,allowed_statuses`);
});

app.put('/api/issues/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { issue?: Record<string, unknown> } | undefined;
  if (!body?.issue || typeof body.issue !== 'object') return reply.code(400).send({ error: 'invalid_issue' });
  await redmineJson(config, credentials(request), `/issues/${numeric(id)}.json`, { method: 'PUT', body: JSON.stringify({ issue: body.issue }) });
  return reply.code(204).send();
});

app.post('/api/issues/:id/comments', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { notes?: string; private?: boolean } | undefined;
  const notes = body?.notes?.trim() ?? '';
  if (!notes || notes.length > 20_000) return reply.code(400).send({ error: 'invalid_notes' });
  await redmineJson(config, credentials(request), `/issues/${numeric(id)}.json`, { method: 'PUT', body: JSON.stringify({ issue: { notes, private_notes: Boolean(body?.private) } }) });
  return reply.code(204).send();
});

app.post('/api/issues/:id/attachments', async (request, reply) => {
  const { id } = request.params as { id: string };
  const issueId = numeric(id);
  const part = await request.file();
  if (!part) return reply.code(400).send({ error: 'file_required' });
  const bytes = await part.toBuffer();
  const creds = credentials(request);
  const upload = await uploadToRedmine(config, creds, part.filename, part.mimetype, bytes);
  await redmineJson(config, creds, `/issues/${issueId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ issue: { uploads: [{ token: upload.token, filename: part.filename, content_type: part.mimetype }] } }),
  });
  return reply.code(201).send({ ok: true });
});

app.get('/api/attachments/content', async (request, reply) => {
  const query = request.query as { url?: string; filename?: string };
  if (!query.url?.trim()) return reply.code(400).send({ error: 'attachment_url_required' });
  const file = await redmineBinary(config, credentials(request), safeAttachmentUrl(query.url.trim()));
  return sendBinary(reply, file, query.filename);
});

// Compatibility for already-installed clients. Supplying ?url= avoids an extra metadata lookup.
app.get('/api/attachments/:id/content', async (request, reply) => {
  const { id } = request.params as { id: string };
  const attachmentId = numeric(id);
  const { url } = request.query as { url?: string };
  const creds = credentials(request);
  if (url?.trim()) return sendBinary(reply, await redmineBinary(config, creds, safeAttachmentUrl(url.trim(), attachmentId)));
  const meta = await redmineJson<{ attachment: { content_url: string; filename: string; content_type?: string } }>(config, creds, `/attachments/${attachmentId}.json`);
  const file = await redmineBinary(config, creds, safeAttachmentUrl(meta.attachment.content_url, attachmentId));
  return sendBinary(reply, { ...file, contentType: meta.attachment.content_type || file.contentType }, meta.attachment.filename);
});

const metaRoutes: Record<string, string> = {
  statuses: '/issue_statuses.json',
  trackers: '/trackers.json',
  priorities: '/enumerations/issue_priorities.json',
  projects: '/projects.json?limit=100',
  customFields: '/custom_fields.json',
  queries: '/queries.json',
};

app.get('/api/meta/:kind', async (request, reply) => {
  const { kind } = request.params as { kind: string };
  const target = metaRoutes[kind];
  if (!target) return reply.code(404).send({ error: 'unknown_meta' });
  return redmineJson(config, credentials(request), target);
});

app.get('/api/projects/:id/memberships', async (request) => {
  const { id } = request.params as { id: string };
  return redmineJson(config, credentials(request), `/projects/${numeric(id)}/memberships.json?limit=100`);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../../web/dist');
await app.register(fastifyStatic, { root: webRoot, wildcard: false });
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
  return reply.type('text/html').sendFile('index.html');
});

await app.listen({ host: config.host, port: config.port });
pushService?.start();
app.addHook('onClose', async () => { pushService?.stop(); });
