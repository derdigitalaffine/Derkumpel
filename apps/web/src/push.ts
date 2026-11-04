import { api, type PushPreferences, type DevicePushSubscription } from './api';

export function pushSupported(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;
}

function decodeBase64Url(encoded: string): ArrayBuffer {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), char => char.charCodeAt(0));
  // Copy into a new ArrayBuffer with no shared/resizable backing.
  const result = new ArrayBuffer(bytes.length);
  new Uint8Array(result).set(bytes);
  return result;
}

function serializeSubscription(subscription: PushSubscription): DevicePushSubscription {
  const raw = subscription.toJSON();
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys.auth) throw new Error('Push-Abonnement ist unvollständig');
  return { endpoint: raw.endpoint, expirationTime: raw.expirationTime, keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth } };
}

export async function pushState(): Promise<'unsupported' | 'denied' | 'not-subscribed' | 'subscribed'> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? 'subscribed' : 'not-subscribed';
}

/** Called ONLY on a user click; permission prompts must never be triggered automatically. */
export async function enablePush(preferences: PushPreferences): Promise<void> {
  if (!pushSupported()) throw new Error('Dieser Browser unterstützt keine Web-Push-Benachrichtigungen.');
  const config = await api.pushConfig();
  if (!config.enabled || !config.publicKey) throw new Error('Der Push-Dienst ist serverseitig noch nicht eingerichtet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt. Bitte die Berechtigung im Browser prüfen.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: decodeBase64Url(config.publicKey),
  });
  try {
    await api.pushSubscribe(serializeSubscription(subscription), preferences);
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => undefined);
    throw error;
  }
}

/** Preference changes update an existing device subscription, without showing another permission dialog. */
export async function updatePushPreferences(preferences: PushPreferences): Promise<void> {
  if (!pushSupported() || !navigator.onLine) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await api.pushSubscribe(serializeSubscription(subscription), preferences);
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  if (navigator.onLine) await api.pushUnsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
}
