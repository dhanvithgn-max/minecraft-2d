const CACHE_NAME = 'blockcraft-161dac1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/sound.js',
  './js/recipes.js',
  './js/app.js',
  './js/game.js',
  './js/game3d.js',
  './js/three.min.js',
  './manifest.json',
  './icons/icon-180x180.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const fresh = req.mode === 'navigate' || /\.(?:html|js|css|json)$/i.test(url.pathname);

  e.respondWith(
    (fresh ? fetch(req) : caches.match(req).then((hit) => hit || fetch(req)))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
