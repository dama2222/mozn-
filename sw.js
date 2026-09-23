// sw.js - Version 2
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  console.log('[SW] 🔔 Push received');
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'MUZN', body: event.data ? event.data.text() : 'لديك إشعار' };
  }
  
  console.log('[SW] Push data:', data);

  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: data.icon || 'https://dama2222.github.io/mozn-/icon-192.png',
    badge: 'https://dama2222.github.io/mozn-/icon-192.png',
    vibrate: [300, 100, 300, 100, 300],
    tag: data.tag || 'muzn-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/' },
    dir: 'rtl',
    lang: 'ar'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'MUZN Operations', options)
      .then(() => console.log('[SW] ✅ Notification shown'))
      .catch(err => console.error('[SW] ❌ showNotification failed:', err))
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked');
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
