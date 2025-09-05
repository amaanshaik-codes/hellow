// Service Worker for cache control and real-time updates
const CACHE_NAME = 'hellow-realtime-v1';
const STATIC_CACHE_PATHS = ['/manifest.json'];

self.addEventListener('install', event => {
  console.log('📡 [SW] Installing service worker...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_CACHE_PATHS))
  );
});

self.addEventListener('activate', event => {
  console.log('📡 [SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('📡 [SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Never intercept Supabase requests - let them pass through directly
  if (url.hostname.includes('supabase.co')) {
    console.log('📡 [SW] Bypassing SW for Supabase:', url.pathname);
    return; // Don't call event.respondWith, let browser handle natively
  }
  
  // Never intercept WebSocket upgrades
  if (request.headers.get('upgrade') === 'websocket') {
    console.log('📡 [SW] Bypassing SW for WebSocket');
    return;
  }
  
  // For other resources, use network-first strategy
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});
