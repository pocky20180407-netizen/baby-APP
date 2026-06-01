// ╔══════════════════════════════════════════════════════════╗
// ║  寶貝日記 Service Worker  —  v1.0.0                      ║
// ║  離線快取 + 背景同步 + 推播通知                           ║
// ╚══════════════════════════════════════════════════════════╝

const CACHE_NAME = 'babydiary-v1.0.0';
const STATIC_CACHE = 'babydiary-static-v1';
const DYNAMIC_CACHE = 'babydiary-dynamic-v1';

// 核心檔案（必須快取，離線也能用）
const CORE_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Leaflet (地圖)
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Noto+Sans+TC:wght@400;500;700;900&display=swap'
];

// ─── 安裝事件：快取核心資源 ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] 正在快取核心資源...');
        // 逐一加入，失敗不中斷（第三方 CDN 可能有 CORS）
        return Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] 無法快取:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] 核心資源快取完成 ✅');
        return self.skipWaiting();
      })
  );
});

// ─── 啟動事件：清除舊快取 ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map(name => {
            console.log('[SW] 刪除舊快取:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Service Worker 已啟動 ✅');
      return self.clients.claim();
    })
  );
});

// ─── Fetch 攔截：Cache First → Network Fallback ──────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 跳過非 GET 請求（POST/PUT/DELETE 不快取）
  if (event.request.method !== 'GET') return;

  // 跳過 Chrome 擴充套件
  if (url.protocol === 'chrome-extension:') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // 快取命中：直接返回（同時背景更新）
      if (cachedResponse) {
        // Stale-While-Revalidate：背景更新動態快取
        if (!isStaticAsset(url)) {
          fetchAndCache(event.request, DYNAMIC_CACHE).catch(() => {});
        }
        return cachedResponse;
      }

      // 快取未命中：從網路取得
      return fetchAndCache(event.request, DYNAMIC_CACHE)
        .catch(() => {
          // 完全離線：返回 App Shell (index.html)
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html');
          }
          // 圖片離線佔位符
          if (event.request.headers.get('accept').includes('image')) {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#FFD6BA" width="100" height="100" rx="50"/><text x="50" y="60" text-anchor="middle" font-size="40">🍼</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        });
    })
  );
});

// ─── 推播通知 ────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '寶貝日記 🍼', body: '寶寶需要您的關注！', icon: '/icon-192.png' };
  try { Object.assign(data, event.data.json()); } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'babydiary-notification',
      renotify: true,
      data: { url: data.url || '/index.html' },
      actions: [
        { action: 'open', title: '立即查看 👀' },
        { action: 'dismiss', title: '稍後再說' }
      ]
    })
  );
});

// 通知點擊
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ─── 背景同步（提醒備份）───────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'babydiary-backup') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log('[SW] 背景同步觸發：資料備份中...');
  // 實作：可在此串接雲端備份 API
}

// ─── 工具函數 ─────────────────────────────────────────────────
function isStaticAsset(url) {
  return CORE_ASSETS.some(asset => url.href.includes(asset));
}

async function fetchAndCache(request, cacheName) {
  const response = await fetch(request);
  // 只快取成功的回應
  if (response && response.status === 200 && response.type !== 'opaque') {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

console.log('[SW] 寶貝日記 Service Worker 載入 ✅');
