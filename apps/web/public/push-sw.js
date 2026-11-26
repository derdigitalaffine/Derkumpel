/* Workbox imports this worker. Only allow known internal routes; no arbitrary URLs. */
function safePushRoute(value) {
  if (typeof value !== 'string') return null;
  if (value === '/' || value === '/green/mine' || /^\/green\/mine\?order=[1-9][0-9]{0,15}$/.test(value) || /^\/issues\/[1-9][0-9]{0,15}$/.test(value)) return value;
  if (value === '/green') return '/green/mine'; // old crew assignment URL
  return null;
}

function notificationRoute(data, body, tag) {
  data = data || {};
  // Existing notifications may have lost their URL in an older worker.
  var legacyCrew = body === 'Neuer Auftrag für die Kolonne';
  var crew = data.kind === 'crew-assignment' || legacyCrew;
  var id = String(data.orderId || '');
  if (crew && !/^[1-9][0-9]{0,15}$/.test(id)) {
    var match = /^(?:crew-order|issue)-([1-9][0-9]{0,15})$/.exec(tag || '');
    id = match ? match[1] : '';
  }
  if (crew) return /^[1-9][0-9]{0,15}$/.test(id) ? '/green/mine?order=' + id : '/green/mine';
  return safePushRoute(data.url) || '/';
}

self.addEventListener('push', function (event) {
  var payload = {};
  try { payload = event.data ? event.data.json() || {} : {}; } catch (_) {}
  var body = typeof payload.body === 'string' ? payload.body.slice(0, 140) : 'Ein Ticket wurde aktualisiert.';
  var tag = typeof payload.tag === 'string' ? payload.tag.slice(0, 50) : 'derkumpel-update';
  var route = notificationRoute(payload, body, tag);
  event.waitUntil(self.registration.showNotification('DerKumpel', {
    body: body,
    icon: '/derkumpel-icon-192-v2.png',
    badge: '/favicon-64-v2.png',
    tag: tag,
    data: { url: route, kind: payload.kind, orderId: payload.orderId },
    renotify: true,
  }));
});

// Use the running router if available. An acknowledgement avoids treating an
// old app without the listener as successfully navigated.
function navigateRunningApp(client, path) {
  if (typeof MessageChannel === 'undefined' || typeof client.postMessage !== 'function') return Promise.resolve(false);
  return new Promise(function (resolve) {
    var channel = new MessageChannel();
    var done = false;
    var timer = setTimeout(function () { finish(false); }, 600);
    function finish(ok) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      channel.port1.close();
      resolve(ok);
    }
    channel.port1.onmessage = function (message) { finish(message.data && message.data.ok === true); };
    try { client.postMessage({ type: 'DERKUMPEL_PUSH_NAVIGATE', path: path }, [channel.port2]); }
    catch (_) { finish(false); }
  });
}

async function openNotification(path) {
  var destination = new URL(path, self.location.origin).href;
  var windows = [];
  try { windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); } catch (_) {}
  for (var client of windows) {
    try {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if (client.url === destination && typeof client.focus === 'function') {
        try { await client.focus(); return; } catch (_) {}
      }
      if (await navigateRunningApp(client, path)) {
        try { await client.focus(); return; } catch (_) { continue; }
      }
      if (typeof client.navigate === 'function') {
        // navigate() returns a potentially different WindowClient, or null.
        var navigated = await client.navigate(destination);
        if (navigated && navigated.url === destination && typeof navigated.focus === 'function') {
          await navigated.focus();
          return;
        }
      }
    } catch (_) { /* A closed/stale window must not prevent opening another. */ }
  }
  if (typeof self.clients.openWindow === 'function') {
    var opened = await self.clients.openWindow(destination);
    // Some installed PWAs reuse a window at their start URL.
    if (opened && new URL(opened.url).origin === self.location.origin && opened.url !== destination) {
      if (!(await navigateRunningApp(opened, path)) && typeof opened.navigate === 'function') {
        var moved = await opened.navigate(destination);
        if (moved && typeof moved.focus === 'function') await moved.focus();
      }
    }
  }
}

self.addEventListener('notificationclick', function (event) {
  var notification = event.notification;
  var path = notificationRoute(notification.data, notification.body, notification.tag);
  notification.close();
  event.waitUntil(openNotification(path));
});
