// ============================================================
//  寶寶日記 Service Worker — 離線快取 + 推播通知
//  版本號：每次更新 App 請修改 CACHE_VERSION
// ============================================================
const CACHE_VERSION = 'baby-diary-v1.0.0';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const DYNAMIC_CACHE = CACHE_VERSION + '-dynamic';

// 一定要快取的檔案（安裝時就快取）
const STATIC_FILES = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap'
];

// ── 安裝 Service Worker ──────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing…', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching static files');
      return cache.addAll(STATIC_FILES.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => {
      console.log('[SW] Static cache complete');
      return self.skipWaiting(); // 立即激活新版
    }).catch(err => {
      console.warn('[SW] Cache error (non-fatal):', err);
      return self.skipWaiting();
    })
  );
});

// ── 激活：清除舊版快取 ──────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating…', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim()) // 接管所有頁面
  );
});

// ── 攔截請求：快取優先，失敗則離線備援 ────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  
  // 跳過非 GET、非 http/https 請求
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;
  
  // Google Fonts：網路優先，失敗用快取
  if (req.url.includes('fonts.googleapis.com') || req.url.includes('fonts.gstatic.com')) {
    event.respondWith(networkFirstStrategy(req, DYNAMIC_CACHE));
    return;
  }
  
  // API 請求：網路優先
  if (req.url.includes('api.anthropic.com')) {
    event.respondWith(fetch(req).catch(() => new Response('{"error":"offline"}', {
      headers: {'Content-Type': 'application/json'}
    })));
    return;
  }
  
  // 主程式：快取優先（離線可用）
  event.respondWith(cacheFirstStrategy(req, STATIC_CACHE));
});

// 策略一：快取優先，沒有再去網路
async function cacheFirstStrategy(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const response = await fetch(req);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(req, response.clone());
    }
    return response;
  } catch (err) {
    // 完全離線時，返回主頁
    const fallback = await caches.match('/index.html');
    return fallback || new Response('離線中，請連網後再試。', {status: 503});
  }
}

// 策略二：網路優先，失敗用快取
async function networkFirstStrategy(req, cacheName) {
  try {
    const response = await fetch(req);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(req, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(req);
    return cached || new Response('', {status: 503});
  }
}

// ── 推播通知處理 ────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch(e) { data = {title:'寶寶日記', body: event.data.text()}; }
  
  const options = {
    body: data.body || '寶寶有新的紀錄需要注意！',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'baby-diary',
    requireInteraction: data.important || false,
    data: { url: data.url || '/' },
    actions: data.actions || [
      { action: 'open', title: '開啟 App' },
      { action: 'dismiss', title: '關閉' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || '寶寶日記 🍼', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── 背景同步（上傳離線時記錄的資料）──────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-diary') {
    console.log('[SW] Background sync: diary data');
    // 這裡可以實作資料上傳至雲端
  }
});

console.log('[SW] Service Worker loaded:', CACHE_VERSION);
