/* DerKumpel service worker: offline app shell, basemap raster tiles and real Web Push.
   All API responses deliberately bypass caching; tickets/attachments stay in IndexedDB. */

const SHELL_CACHE = 'derkumpel-shell-v4';
const MAP_CACHE = 'derkumpel-map';
// Replaced by vite-plugin-pwa injectManifest during the production build.
const files = self.__WB_MANIFEST;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(files.map((entry) => typeof entry === 'string' ? entry : entry.url));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) =>
      (name.startsWith('derkumpel-shell-') && name !== SHELL_CACHE) ||
      name.startsWith('workbox-precache-')
    ).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (url.hostname === 'sgx.geodatenzentrum.de' && url.pathname.startsWith('/wmts_basemapde/tile/')) {
    event.respondWith((async () => {
      const cache = await caches.open(MAP_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const response = await fetch(req);
      if (response.ok) {
        await cache.put(req, response.clone());
        // Bound the cache for devices with small storage. Explicit Offline-Karte downloads also use MAP_CACHE.
        const keys = await cache.keys();
        if (keys.length > 3000) await cache.delete(keys[0]);
      }
      return response;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () =>
      (await caches.match('/index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});

function safePath(value) {
  if (typeof value !== 'string') return '/';
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return '/';
    if (/^\/issues\/[1-9][0-9]*$/.test(url.pathname) && !url.search) return url.pathname;
    if (url.pathname === '/settings') return '/settings';
  } catch { /* invalid URL */ }
  return '/';
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* keep a generic notification */ }
  const path = safePath(data.url);
  const title = typeof data.title === 'string' ? data.title.slice(0, 100) : 'Neue Änderung';
  const body = typeof data.body === 'string' ? data.body.slice(0, 200) : 'In DerKumpel gibt es neue Informationen.';
  event.waitUntil(self.registration.showNotification(`DerKumpel · ${title}`, {
    body,
    icon: '/derkumpel-icon-192-v2.png',
    badge: '/favicon-64-v2.png',
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 90) : 'derkumpel-update',
    renotify: false,
    data: { path },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safePath(event.notification.data?.path);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if ('navigate' in client) await client.navigate(target).catch(() => undefined);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
