const CACHE = 'control-bar-pwa-v1';
const ASSETS = ['./','./index.html','./manifest.json','./supabaseClient.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(()=>caches.match('./index.html')))
  );
});
