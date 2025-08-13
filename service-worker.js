const CACHE = 'control-bar-pwa-v11-2025-08-13';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './supabaseClient.js'
];

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') { e.respondWith(fetch(e.request)); return; }
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(()=>caches.match('./index.html')))
  );
});
