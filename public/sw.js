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

const CACHE = 'auroa-cache-v19';
const SHELL = ['/', '/icon.svg', '/icon-192.png', '/badge-96.png', '/manifest.webmanifest'];

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
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;  // skip blob:/data: (downloads etc.)
  if (url.origin !== self.location.origin) return;  // let cross-origin pass through

  // API data must ALWAYS be fresh — never cache it, or different devices can
  // show stale content (e.g. old newsletter data after an edit). Go straight
  // to the network with caching bypassed; if it fails, the page's own error
  // handling takes over.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req.url, { cache: 'no-store' }));
    return;
  }

  // Uploaded media + static icons: cache-first. Upload filenames are unique,
  // so a cached copy never goes stale, and images stay reliable on flaky nets.
  if (url.pathname.startsWith('/uploads/') ||
      url.pathname === '/icon.svg' ||
      url.pathname === '/manifest.webmanifest') {
    e.respondWith(cacheFirst(req));
    return;
  }

  // HTML pages: network-first so content stays fresh when online, but fall
  // back to the cached copy when the network drops.
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
    // Bypass the HTTP cache for the HTML shell so a fixed build is never
    // blocked by a stale cached page.
    const res = await fetch(req, { cache: 'no-store' });
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
    // PNG icons only. SVG icons/badges are unreliable for notifications — the
    // badge in particular MUST be a raster PNG (Android tints its alpha), and a
    // bad icon can cause the whole banner to silently fail to render on some
    // platforms. That looked like "push not working" even though delivery
    // succeeded.
    icon:  '/icon-192.png',
    badge: '/badge-96.png',
    tag:   'auroa-message',
    renotify: true,
    data: { url }
  };
  // Large preview image (supported on Android/Chrome; ignored elsewhere).
  if (image) opts.image = image;

  // Show the notification. If anything about the rich options (image, icon,
  // badge) makes showNotification reject, fall back to a bare notification so a
  // banner ALWAYS appears — a delivered push must never be silently dropped.
  const show = self.registration.showNotification(title, opts)
    .catch(() => self.registration.showNotification(title, { body, data: { url } }))
    .catch(() => {});

  const tasks = [show];
  // Bump the app icon badge (Chrome desktop/Android, Safari iOS 16.4+ PWA).
  if (count != null && self.navigator && typeof self.navigator.setAppBadge === 'function') {
    tasks.push(self.navigator.setAppBadge(count).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});

// The browser can rotate or expire a push subscription at any time (Apple's
// push service on iPhone does this silently). When it does, the OLD endpoint
// the server stored stops delivering. This event fires on rotation — re-create
// the subscription and re-register it so the server always has a live endpoint.
// (iOS Safari is unreliable about firing this, which is why the page ALSO
// re-syncs on every load; the two together cover both cases.)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      let appServerKey = null;
      const oldSub = event.oldSubscription || (await self.registration.pushManager.getSubscription());
      if (oldSub && oldSub.options && oldSub.options.applicationServerKey) {
        appServerKey = oldSub.options.applicationServerKey;  // ArrayBuffer — reuse as-is
      } else {
        const r = await fetch('/api/push/vapid-public-key');
        const b = await r.json();
        if (!b || !b.key) return;
        appServerKey = urlBase64ToUint8Array(b.key);
      }
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
    } catch (_) {}
  })());
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Tap on notification → open the target page (Messages page for message
// notifications). Reliably lands on the right page: focus a window already
// there, else navigate an existing window, else open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/messages';
  const targetUrl = new URL(target, self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // A window already on the target page — just focus it.
    for (const c of all) {
      if (c.url === targetUrl && 'focus' in c) return c.focus();
    }
    // Otherwise navigate an existing window to the target page.
    const c = all.find((w) => 'focus' in w);
    if (c) {
      try { await c.navigate(targetUrl); } catch (_) {}
      return c.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
