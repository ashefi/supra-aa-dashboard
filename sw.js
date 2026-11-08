// Supra AA 1.4: network-first document navigation, offline fallback.
// New SW versions install immediately; UI invites user to restart when a new build is live.
const CACHE = 'supra-aa-a90-1.4';
const CORE = ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('supra-aa-') && k !== CACHE).map(k => caches.delete(k))))
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never answer build metadata from old cache; prevents false 'up-to-date' status.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(req, {cache:'no-store'}));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req, {cache:'no-store'}).catch(() => caches.match('./index.html')));
  }
});
