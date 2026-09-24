/* =====================================================================
   MUZN Service Worker v3.5
   ===================================================================== */
const CACHE_VERSION = 'muzn-v11';
const CACHE_STATIC = CACHE_VERSION + '-static';
const CACHE_RUNTIME = CACHE_VERSION + '-runtime';

// الملفات الأساسية للتخزين
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './barcode.js',
  './favicon-32.png',
  './favicon-16.png',
  './favicon.ico',
  './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap'
];

// =====================================================================
// Install — تثبيت Service Worker
// =====================================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] بعض الملفات فشلت:', err);
      });
    }).then(() => self.skipWaiting())  // ✅ تفعيل فوري
  );
});

// =====================================================================
// Activate — تفعيل + حذف الكاش القديم
// =====================================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key.startsWith('muzn-') && key !== CACHE_STATIC && key !== CACHE_RUNTIME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())  // ✅ التحكم الفوري بالصفحات
  );
});

// =====================================================================
// Fetch — استراتيجية التخزين
// =====================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل طلبات Supabase — يجب أن تذهب دائماً للشبكة
  if (url.hostname.includes('supabase.co')) {
    return; // Network only
  }

  // تجاهل طلبات POST/PUT/DELETE — ليست قابلة للتخزين
  if (request.method !== 'GET') {
    return;
  }

  // تجاهل طلبات Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // استراتيجية: Network First مع fallback للكاش
  event.respondWith(
    fetch(request)
      .then((response) => {
        // ✅ خزّن النسخة الجديدة في الكاش
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_RUNTIME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // ✅ الشبكة فشلت — استخدم الكاش
        return caches.match(request).then((cached) => {
          if (cached) {
            console.log('[SW] Offline — serving from cache:', request.url);
            return cached;
          }
          // إذا كان طلب HTML، أرجع index.html
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
          // fallback نهائي
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        });
      })
  );
});

// =====================================================================
// Push — استقبال الإشعارات
// =====================================================================
self.addEventListener('push', (event) => {
  console.log('[SW] 🔔 Push received');
  
  let data = {
    title: 'MUZN',
    body: 'لديك إشعار جديد',
    url: '/',
    kind: 'general',
    ref_id: null
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = Object.assign(data, payload);
    }
  } catch (e) {
    console.warn('[SW] Push data parse failed:', e);
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || '',
    icon: './apple-touch-icon.png',
    badge: './favicon-32.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.kind ? (data.kind + '-' + (data.ref_id || Date.now())) : 'muzn-notification',
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: {
      url: data.url || '/',
      kind: data.kind,
      ref_id: data.ref_id,
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: '📂 فتح' },
      { action: 'dismiss', title: '✖ تجاهل' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// =====================================================================
// Notification Click — عند الضغط على الإشعار
// =====================================================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 👆 Notification clicked:', event.action);
  event.notification.close();

  // إذا اختار "تجاهل"
  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // ✅ ابحث عن نافذة مفتوحة للتطبيق
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(fullUrl);
          return client.focus();
        }
      }
      // ✅ لم تُوجد — افتح نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});

// =====================================================================
// Message — استقبال رسائل من الصفحة الرئيسية
// =====================================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] ⏭️ Skip waiting requested');
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    self.registration.update();
  }
});

// =====================================================================
// Sync — Background Sync (اختياري للمستقبل)
// =====================================================================
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 Background sync:', event.tag);
  // يمكن استخدامه لاحقاً للمزامنة في الخلفية
});

console.log('[SW] ✅ Loaded v' + CACHE_VERSION);
