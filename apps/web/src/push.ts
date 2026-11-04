import { api } from './api';

export type PushPreferences = {
  assignment: boolean; status: boolean; comment: boolean; priority: boolean; dates: boolean;
};
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  assignment: true, status: true, comment: true, priority: true, dates: true,
};

export type DevicePushStatus = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  registered: boolean;
  reason?: string;
};

export function canUsePush(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function requiresHomeScreenInstall(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return ios && !standalone;
}

function publicKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function readDevicePush(): Promise<DevicePushStatus> {
  if (!canUsePush()) return { supported: false, permission: 'unsupported', subscribed: false, registered: false,
    reason: 'Dein Browser unterstützt Push auf diesem Gerät nicht oder die Verbindung ist nicht sicher.' };
  const permission = Notification.permission;
  const subscription = await currentSubscription();
  if (!subscription) return { supported: true, permission, subscribed: false, registered: false };
  try {
    const status = await api.pushStatus(subscription.endpoint);
    return { supported: true, permission, subscribed: true, registered: status.registered };
  } catch {
    return { supported: true, permission, subscribed: true, registered: false,
      reason: 'Registrierung kann aktuell nicht geprüft werden.' };
  }
}

/** Called from a real button click: permissions must be requested before any awaited work (Safari). */
export async function enableDevicePush(preferences: PushPreferences): Promise<DevicePushStatus> {
  if (!canUsePush() || requiresHomeScreenInstall()) {
    throw new Error(requiresHomeScreenInstall()
      ? 'Auf iPhone/iPad zuerst über „Zum Home-Bildschirm“ installieren und die App dort öffnen.'
      : 'Push setzt HTTPS, Service Worker und Browserbenachrichtigungen voraus.');
  }
  const permissionPromise = Notification.requestPermission();
  const permission = await permissionPromise;
  if (permission !== 'granted') throw new Error('Benachrichtigungen sind nicht erlaubt. Prüfe die Browser-/Systemeinstellungen.');

  const config = await api.pushConfig();
  if (!config.enabled || !config.publicKey) throw new Error('Der Push-Dienst ist serverseitig noch nicht eingerichtet.');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const wanted = publicKeyBytes(config.publicKey);
  if (subscription?.options.applicationServerKey) {
    const existing = new Uint8Array(subscription.options.applicationServerKey);
    if (existing.length !== wanted.length || existing.some((value, index) => value !== wanted[index])) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!subscription) subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: wanted,
  });
  await api.pushSubscribe(subscription.toJSON(), preferences);
  return { supported: true, permission: 'granted', subscribed: true, registered: true };
}

export async function updateDevicePushPreferences(preferences: PushPreferences): Promise<void> {
  if (!canUsePush()) return;
  const subscription = await currentSubscription();
  if (subscription && navigator.onLine) await api.pushPreferences(subscription.endpoint, preferences);
}

export async function disableDevicePush(): Promise<void> {
  if (!canUsePush()) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  // Remove server credentials and the endpoint before invalidating this browser subscription.
  // Offline local unsubscription will still invalidate the endpoint at the push provider.
  if (navigator.onLine) await api.pushUnsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
}

export async function testDevicePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) throw new Error('Dieses Gerät ist noch nicht für Push registriert.');
  await api.pushTest(subscription.endpoint);
}
