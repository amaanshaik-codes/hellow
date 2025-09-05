// Service Worker for cache control and real-time updates
const CACHE_NAME = 'hellow-realtime-v1';
const REALTIME_PATHS = [
  '/api/messages',
  '/api/supabase',
  '/_next/static/chunks/components_ChatEnhanced'
];

self.addEventListener('install', event => {
  console.log('📡 [SW] Installing service worker...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['/manifest.json']))
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
  
  // Don't cache real-time components and API calls
  if (REALTIME_PATHS.some(path => url.pathname.includes(path))) {
    console.log('📡 [SW] Bypassing cache for real-time:', url.pathname);
    event.respondWith(
      fetch(request, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      })
    );
    return;
  }
  
  // For other resources, use network-first strategy
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});
