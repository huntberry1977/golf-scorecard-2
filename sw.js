// Service worker: keeps the app usable with no network.
// App files are served from cache first (instant start on weak signal) and
// refreshed in the background, so a new deploy shows up on the next launch.
const APP_CACHE = 'golf-app-v1';
const FONT_CACHE = 'golf-fonts-v1';
const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const keep = [APP_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache, update the cache from the network in the background.
function staleWhileRevalidate(event, cacheName, cacheKey) {
  return caches.open(cacheName).then(cache =>
    cache.match(cacheKey, { ignoreSearch: true }).then(cached => {
      const network = fetch(event.request)
        .then(res => {
          if (res.ok || res.type === 'opaque') cache.put(cacheKey, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    })
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts (stylesheet + font files)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event, FONT_CACHE, req));
    return;
  }

  // Only this app's own files; leave /api/ and anything else to the network
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope) || url.pathname.includes('/api/')) return;

  // Page loads always resolve to the cached app page
  const key = req.mode === 'navigate' ? './' : req;
  event.respondWith(staleWhileRevalidate(event, APP_CACHE, key));
});
