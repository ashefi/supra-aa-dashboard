const CACHE = 'supra-aa-a90-v10';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('supra-aa-') && k !== CACHE).map(k => caches.delete(k))))])); });
self.addEventListener('fetch', event => { const req = event.request; if (req.mode !== 'navigate' || new URL(req.url).origin !== self.location.origin) return; event.respondWith(fetch(req).catch(() => caches.match('./index.html'))); });
