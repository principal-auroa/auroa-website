// Service worker — installability, push notifications, badge count, and a
// resilient caching strategy.
//
// Previously every fetch went straight to the network and returned an error
// on any failure (no cache, no fallback). On flaky mobile connections (common
// on phones / iOS Safari) a single blip made the header image, front-page
// images, or /api/state fail — so they intermittently didn't show. Now:
//   - /uploads/* images + icons  -> cache-first (upload filenames are unique,
//     so a cached copy never goes stale) => images load reliably even offline.
//   - HTML pages + /api/*         -> network-first with cache fallback, so
//     content stays fresh when online but still renders when the network drops.

const CACHE = 'auroa-cache-v2';
const SHELL = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;          // never touch POST/PUT/DELETE
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;  // let cross-origin pass through

  // Uploaded media + static icons: cache-first. Upload filenames are unique,
  // so a cached copy never goes stale, and images stay reliable on flaky nets.
  if (url.pathname.startsWith('/uploads/') ||
      url.pathname === '/icon.svg' ||
      url.pathname === '/manifest.webmanifest') {
    e.respondWith(cacheFirst(req));
    return;
  }

  // HTML pages + API: network-first so content stays fresh when online, but
  // fall back to the cached copy when the network drops.
  e.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {
    // Refresh in the background for next time.
    fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return Response.error();
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    return Response.error();
  }
}

// Incoming push from the server. Payload shape:
//   { title, body, url, count, image }
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'Auroa School';
  const body  = data.body  || '';
  const url   = data.url   || '/';
  const count = typeof data.count === 'number' ? data.count : null;
  const image = typeof data.image === 'string' ? data.image : null;

  const opts = {
    body,
    icon:  '/icon.svg',
    badge: '/icon.svg',
    tag:   'auroa-message',
    renotify: true,
    data: { url }
  };
  // Large preview image (supported on Android/Chrome; ignored elsewhere).
  if (image) opts.image = image;
  const tasks = [
    self.registration.showNotification(title, opts)
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
