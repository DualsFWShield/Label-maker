const CACHE_NAME = 'label-maker-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './css/print.css',
  './js/app.js',
  './js/state.js',
  './js/db.js',
  './js/editor.js',
  './js/layout-engine.js',
  './js/print.js',
  './js/importer.js',
  './js/fonts.js',
  './js/pwa.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install – cache all static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Activate – clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch – cache-first for static, network-first for fonts/external
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Early exit for non-HTTP(S) protocols (like blob: or data: used for downloads)
  if (!request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // Google Fonts: network-first with cache fallback
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // All other: cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// Listen for force-update messages from the client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
