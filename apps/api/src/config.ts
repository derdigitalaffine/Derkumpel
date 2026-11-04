export type AppConfig = {
  host: string;
  port: number;
  redmineBaseUrl: URL;
  publicBaseUrl: URL;
  sessionKey: Buffer;
  sessionMaxAgeSeconds: number;
  redmineTimeoutMs: number;
  maxUploadBytes: number;
  production: boolean;
  mapStyleUrl: string;
  mapCenter: [number, number];
  offlineMapBounds?: [number, number, number, number];
  offlineMapRadiusKm: number;
  pollIntervalMs: number;
  push: { enabled: boolean; vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string; eventToken: string; storeFile: string };
};

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function positiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function requiredUrl(name: string, fallback?: string): URL {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use http or https`);
  return url;
}

function tuple(name: string, fallback: [number, number]): [number, number] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) throw new Error(`${name} must be lon,lat`);
  return [parts[0]!, parts[1]!];
}

function bounds(name: string): [number, number, number, number] | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) throw new Error(`${name} must be west,south,east,north`);
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

export function loadConfig(): AppConfig {
  const production = process.env.NODE_ENV === 'production';
  const secret = process.env.SESSION_SECRET ?? '';
  const sessionKey = Buffer.from(secret, 'base64');
  if (sessionKey.length !== 32) throw new Error('SESSION_SECRET must be exactly 32 random bytes encoded as base64');

  const pushEnabled = process.env.PUSH_ENABLED === 'true';
  const push = {
    enabled: pushEnabled,
    vapidPublicKey: process.env.PUSH_VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey: process.env.PUSH_VAPID_PRIVATE_KEY ?? '',
    vapidSubject: process.env.PUSH_VAPID_SUBJECT ?? '',
    eventToken: process.env.PUSH_EVENT_TOKEN ?? '',
    storeFile: process.env.PUSH_STORE_FILE ?? '/app/push-data/subscriptions.json',
  };
  if (pushEnabled && (!push.vapidPublicKey || !push.vapidPrivateKey ||
    !/^mailto:.+@.+|^https:\/\//.test(push.vapidSubject) || push.eventToken.length < 32)) {
    throw new Error('PUSH_ENABLED requires VAPID public/private keys, VAPID subject and PUSH_EVENT_TOKEN (32+ characters)');
  }

  return {
    push,
    host: process.env.HOST ?? '0.0.0.0',
    port: positiveInt('PORT', 8080),
    redmineBaseUrl: requiredUrl('REDMINE_BASE_URL', 'https://redmine.vgo-o.de'),
    publicBaseUrl: requiredUrl('PUBLIC_BASE_URL', production ? undefined : 'http://localhost:8080'),
    sessionKey,
    sessionMaxAgeSeconds: positiveInt('SESSION_MAX_AGE_DAYS', 30) * 86_400,
    redmineTimeoutMs: positiveInt('REDMINE_TIMEOUT_MS', 15_000),
    maxUploadBytes: positiveInt('MAX_UPLOAD_MB', 25) * 1024 * 1024,
    production,
    mapStyleUrl: 'basemap-raster', // Legacy MAP_STYLE_URL is intentionally ignored: raster is always the default.
    mapCenter: tuple('MAP_DEFAULT_CENTER', [7.77, 49.5]),
    offlineMapBounds: bounds('MAP_OFFLINE_BOUNDS'),
    offlineMapRadiusKm: positiveNumber('MAP_OFFLINE_RADIUS_KM', 12),
    pollIntervalMs: Math.max(120_000, positiveInt('POLL_INTERVAL_MS', 120_000)),
  };
}
