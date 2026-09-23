/* =====================================================================
   MUZN Operations — Service Worker v3.2
   ===================================================================== */
const CACHE_NAME = 'muzn-v3-2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

const OPTIONAL_ASSETS = [
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png',
  './barcode.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      try {
        await cache.addAll(CORE_ASSETS);
        console.log('[SW] Core assets cached');
      } catch (err) {
        console.warn('[SW] Core cache failed:', err);
      }
      for (const asset of OPTIONAL_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Skipped optional:', asset);
        }
      }
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ✅ استقبال رسالة تحديث من الصفحة
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'CHECK_UPDATE'){
    self.registration.update();
  }
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  
  // ✅ تجاهل إضافات المتصفح والبروتوكولات غير المدعومة
  const url = e.request.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  if (url.indexOf('chrome-extension') >= 0) return;
  if (url.indexOf('moz-extension') >= 0) return;
  if (url.indexOf('safari-extension') >= 0) return;
  if (url.indexOf('supabase') >= 0) return;
  if (url.indexOf('googleapis') >= 0) return;
  if (url.indexOf('cdn.jsdelivr') >= 0) return;
  if (url.indexOf('unpkg.com') >= 0) return;

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      // ✅ فقط خزّن الاستجابات الصحيحة
      if (resp.ok && resp.type === 'basic' && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'MUZN';
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    dir: 'rtl',
    lang: 'ar'
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.indexOf(url) >= 0 && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
