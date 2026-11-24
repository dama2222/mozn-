// sw.js — MUZN Service Worker v11.5
const CACHE_STATIC = 'muzn-static-v11.5';
const CACHE_RUNTIME = 'muzn-runtime-v11.5';
const STATIC_ASSETS = [
  './', './index.html', './barcode.js', './manifest.json',
  './favicon.ico', './favicon-16.png', './favicon-32.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => c.addAll(STATIC_ASSETS).catch(()=>{}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith('muzn-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  // ❌ لا تخزّن Supabase أو الخطوط أو أي طلب خارجي حساس
  if(url.hostname.includes('supabase.co') || url.hostname.includes('googleapis.com')) return;
  if(req.headers.get('authorization')) return;

  // ✅ App shell: cache-first
  if(req.mode === 'navigate' || url.pathname.endsWith('.html')){
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE_STATIC).then(c=>c.put('./index.html', copy));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ✅ أصول ثابتة: cache-first
  e.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;
      return fetch(req).then(r => {
        if(r.ok && url.origin === self.location.origin){
          const copy = r.clone();
          caches.open(CACHE_RUNTIME).then(c=>c.put(req, copy));
        }
        return r;
      }).catch(() => cached);
    })
  );
});

// 🔔 Push
self.addEventListener('push', e => {
  const data = (() => { try { return e.data.json(); } catch { return {title:'MUZN'}; } })();
  e.waitUntil(self.registration.showNotification(data.title || 'MUZN', {
    body: data.body || '',
    icon: './apple-touch-icon.png',
    badge: './favicon-32.png',
    data: { url: data.url || './' },
    tag: data.tag || 'muzn-notif',
    vibrate: [200,100,200]
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || './'));
});

// 🔄 Background Sync — لرفع الطلبات المعلّقة
self.addEventListener('sync', e => {
  if(e.tag === 'muzn-sync-queue'){
    e.waitUntil(
      clients.matchAll({ type:'window' }).then(list => {
        list.forEach(c => c.postMessage({ type:'MUZN_SYNC_NOW' }));
      })
    );
  }
});
