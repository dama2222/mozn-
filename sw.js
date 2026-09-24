/* =====================================================================
   MUZN Operations — Service Worker v3.4
   ===================================================================== */
const CACHE_NAME = 'muzn-v3-4';

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

/* =====================================================================
   INSTALL — تخزين الملفات + تنشيط فوري
   ===================================================================== */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      try {
        await cache.addAll(CORE_ASSETS);
        console.log('[SW] ✅ Core assets cached');
      } catch (err) {
        console.warn('[SW] ⚠️ Core cache failed:', err);
      }
      for (const asset of OPTIONAL_ASSETS) {
        try { await cache.add(asset); } catch (err) {}
      }
      // 🆕 إجبار التنشيط الفوري بدون انتظار
      await self.skipWaiting();
    })
  );
});

/* =====================================================================
   ACTIVATE — حذف الكاش القديم + السيطرة الفورية
   ===================================================================== */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] 🗑️ Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => {
        console.log('[SW] ✅ Activated:', CACHE_NAME);
        // 🆕 السيطرة على كل التبويبات فوراً
        return self.clients.claim();
      })
  );
});

/* =====================================================================
   MESSAGE — استقبال أوامر من الصفحة
   ===================================================================== */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'CHECK_UPDATE') {
    self.registration.update();
  }
});

/* =====================================================================
   FETCH — Cache-First مع Fallback
   ===================================================================== */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  
  // تجاهل الطلبات الخارجية
  if (url.includes('supabase') ||
      url.includes('googleapis') ||
      url.includes('jsdelivr') ||
      url.includes('unpkg')) return;
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  if (url.includes('chrome-extension')) return;
  if (url.includes('moz-extension')) return;
  if (url.includes('safari-extension')) return;
  
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      
      return fetch(event.request).then(response => {
        if (response.ok && response.type === 'basic' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone))
            .catch(() => {});
        }
        return response;
      }).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});

/* =====================================================================
   PUSH — استقبال الإشعارات (مع معالجة الأخطاء)
   ===================================================================== */
self.addEventListener('push', e => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (err) {
    console.warn('[SW] push data is not JSON');
    data = { title: 'MUZN', body: e.data ? e.data.text() : '' };
  }
  
  const title = data.title || 'MUZN';
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    dir: 'rtl',
    lang: 'ar',
    tag: data.kind || 'general',
    renotify: false
  };
  
  e.waitUntil(self.registration.showNotification(title, options));
});

/* =====================================================================
   NOTIFICATION CLICK
   ===================================================================== */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
