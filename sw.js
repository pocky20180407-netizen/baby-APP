// 寶寶成長日記 Service Worker
// 版本號：每次更新 App 時請遞增此數字
const CACHE_VERSION = 'baby-diary-v1';
const CACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ── 安裝：預先快取所有核心檔案 ────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting(); // 立即啟用新版本
});

// ── 啟動：清除舊快取 ──────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim(); // 立即控制所有頁面
});

// ── 攔截請求：Cache-First 策略（優先離線快取）───────────────
self.addEventListener('fetch', event => {
  // 只處理 GET 請求，跳過 API 呼叫 (anthropic)
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('api.anthropic.com')) return;
  if (event.request.url.includes('chrome-extension')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // 背景更新快取（stale-while-revalidate）
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      // 沒有快取 → 嘗試網路
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        // 存入快取
        const toCache = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // 完全離線時：回傳主頁
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── 背景同步（可選：離線時排隊的儲存動作）────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-records') {
    console.log('[SW] Background sync triggered');
  }
});

// ── 推播通知（可選：未來功能）────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '寶寶成長日記';
  const body  = data.body  || '記得記錄今天的寶寶動態！';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
