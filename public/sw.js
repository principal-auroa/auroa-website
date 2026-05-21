// Service worker — installability + push notifications + badge count.
// No content caching: every fetch goes to the network so admins'
// publishes are visible immediately.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => Response.error()));
});

// Incoming push from the server. Payload shape:
//   { title, body, url, count }
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'Auroa School';
  const body  = data.body  || '';
  const url   = data.url   || '/';
  const count = typeof data.count === 'number' ? data.count : null;

  const tasks = [
    self.registration.showNotification(title, {
      body,
      icon:  '/icon.svg',
      badge: '/icon.svg',
      tag:   'auroa-message',
      renotify: true,
      data: { url }
    })
  ];
  // Bump the app icon badge (Chrome desktop/Android, Safari iOS 16.4+ PWA).
  if (count != null && self.navigator && typeof self.navigator.setAppBadge === 'function') {
    tasks.push(self.navigator.setAppBadge(count).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});

// Tap on notification → focus an existing app tab or open the Messages page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/messages';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if ('focus' in c) {
        // Prefer a tab already on this origin; navigate it to the target URL.
        try { await c.navigate(url); } catch (_) {}
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
