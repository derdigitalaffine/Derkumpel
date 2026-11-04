/* Runs inside the existing Workbox service worker, not as a second worker.
   The backend sends only generic event + ticket ID, never sensitive issue text. */
self.addEventListener('push', function (event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  var route = typeof payload.url === 'string' && /^\/issues\/[0-9]{1,10}$/.test(payload.url)
    ? payload.url : '/';
  event.waitUntil(self.registration.showNotification('DerKumpel', {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 140) : 'Ein Ticket wurde aktualisiert.',
    icon: '/derkumpel-icon-192-v2.png',
    badge: '/favicon-64-v2.png',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 50) : 'derkumpel-update',
    data: { url: route },
    renotify: true,
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var path = event.notification.data && typeof event.notification.data.url === 'string'
    && /^\/issues\/[0-9]{1,10}$/.test(event.notification.data.url)
    ? event.notification.data.url : '/';
  var destination = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async function (clients) {
    for (var client of clients) {
      if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
        await client.navigate(destination);
        if ('focus' in client) return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(destination);
  }));
});
