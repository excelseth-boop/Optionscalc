// StratCalc Service Worker
// Precaches the entire app shell at install time so the app works fully
// offline, including when launched from the iPhone Home Screen with no
// network connection at all.

var CACHE_NAME = 'stratcalc-v1';

// Everything needed to run the app with zero network access.
// index.html itself contains all CSS/JS inline, plus the 3 external
// libraries (xlsx, jspdf, jspdf-autotable) used only for export features.
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js'
];

// ─── INSTALL: download and cache the full app shell ────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // addAll fails entirely if ANY single request fails (e.g. a CDN hiccup),
      // so we cache each file individually and just log failures instead of
      // aborting the whole install — the core app (index.html) must succeed.
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] Failed to precache:', url, err);
          });
        })
      );
    }).then(function () {
      // Activate this new SW immediately instead of waiting for old tabs to close
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATE: clean up old cache versions ──────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim(); // take control of any already-open tabs
    })
  );
});

// ─── FETCH: cache-first, with background refresh + network fallback ───────────
self.addEventListener('fetch', function (event) {
  // Only handle GET requests — POST/PUT etc. should always hit the network
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      // Kick off a network fetch regardless (to keep the cache fresh for next time),
      // but don't let it block — we respond from cache immediately if we have it.
      var networkFetch = fetch(event.request).then(function (networkResponse) {
        // Only cache successful, basic/cors responses (skip opaque/error responses)
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function () {
        // Network failed (offline) — fall back to cache, or to index.html
        // for navigation requests so the app shell still loads.
        return cachedResponse || caches.match('/index.html');
      });

      // Cache-first: return cached version instantly if we have one,
      // otherwise wait for the network (which falls back to cache/shell on failure).
      return cachedResponse || networkFetch;
    })
  );
});

// Allow the page to tell the SW to activate immediately after an update
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
