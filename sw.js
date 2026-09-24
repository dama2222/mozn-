/* =====================================================================
   MUZN Operations — Service Worker v3.3
   ===================================================================== */
const CACHE_NAME = 'muzn-v3-3';

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
   INSTALL — تخزين الملفات الأساسية
   ===================================================================== */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // الملفات الأساسية (إجباري)
      try {
        await cache.addAll(CORE_ASSETS);
        console.log('[SW] ✅ Core assets cached');
      } catch (err) {
        console.warn('[SW] ⚠️ Core cache failed:', err);
      }
      // الملفات الاختيارية (قد تفشل - لا مشكلة)
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

/* =====================================================================
   ACTIVATE — حذف الكاش القديم
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
      .then(() => self.clients.claim())
  );
});

/* =====================================================================
   FETCH — Cache-First مع Network Fallback
   ===================================================================== */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  
  // تجاهل الطلبات الخارجية (Supabase, CDN, Google Fonts)
  if (url.includes('supabase') ||
      url.includes('googleapis') ||
      url.includes('jsdelivr') ||
      url.includes('unpkg')) return;
  
  // تجاهل البروتوكولات غير المدعومة
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  if (url.includes('chrome-extension')) return;
  if (url.includes('moz-extension')) return;
  if (url.includes('safari-extension')) return;
  
  event.respondWith(
    caches.match(event.request).then(cached => {
      // إذا وُجد في الكاش، أرجعه فوراً
      if (cached) return cached;
      
      // وإلا اجلبه من الشبكة وخزّنه
      return fetch(event.request).then(response => {
        // فقط خزّن الاستجابات الصحيحة
        if (response.ok && response.type === 'basic' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone))
            .catch(() => {});
        }
        return response;
      }).catch(() => {
        // إذا فشلت الشبكة، أعد صفحة index.html كحل احتياطي
        return caches.match('./index.html');
      });
    })
  );
});

/* =====================================================================
   PUSH — استقبال الإشعارات
   ===================================================================== */
self.addEventListener('push', e => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (err) {
    console.warn('[SW] push data is not JSON:', err);
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
   NOTIFICATION CLICK — عند الضغط على الإشعار
   ===================================================================== */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // إذا كان التطبيق مفتوحاً، ركّز عليه
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      // وإلا افتح نافذة جديدة
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
