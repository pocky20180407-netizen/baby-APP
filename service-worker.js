// =====================================================
// 寶貝日記 Service Worker — 離線功能
// =====================================================
const CACHE_NAME = 'baby-diary-v1';
const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 安裝：快取所有核心檔案
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching core files');
      return cache.addAll(CORE_FILES);
    }).then(() => {
      console.log('[SW] Install complete');
      return self.skipWaiting();
    })
  );
});

// 啟動：清除舊版快取
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// 攔截請求：快取優先，失敗時用快取
self.addEventListener('fetch', event => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') return;
  // 不快取外部 API
  if (event.request.url.includes('api.anthropic.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        console.log('[SW] Serving from cache:', event.request.url);
        return cached;
      }
      return fetch(event.request).then(response => {
        // 只快取成功的同源請求
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // 網路失敗，回傳主頁（離線模式）
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// 推播通知處理
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title   || '寶貝日記';
  const options = {
    body:    data.body    || '有新的提醒！',
    icon:    data.icon    || './icon-192.png',
    badge:   './icon-192.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || './' },
    actions: [
      { action: 'open',    title: '查看' },
      { action: 'dismiss', title: '關閉' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知點擊
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

// 背景同步（未來擴充用）
self.addEventListener('sync', event => {
  if (event.tag === 'sync-records') {
    console.log('[SW] Background sync triggered');
  }
});
