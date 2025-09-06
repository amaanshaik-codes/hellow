// Service Worker for cache control, offline support, and real-time updates
const CACHE_NAME = 'hellow-realtime-v2';
const STATIC_CACHE_PATHS = [
  '/manifest.json',
  '/',
  '/app/globals.css'
];

self.addEventListener('install', event => {
  console.log('📡 [SW] Installing enhanced service worker...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_CACHE_PATHS))
  );
});

self.addEventListener('activate', event => {
  console.log('📡 [SW] Activating enhanced service worker...');
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

// Background sync for queued messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-messages') {
    console.log('📡 [SW] Background sync triggered for messages');
    event.waitUntil(syncQueuedMessages());
  }
});

async function syncQueuedMessages() {
  try {
    // Open IndexedDB to get queued messages
    const request = indexedDB.open('pragmatic-fast-messaging-db', 1);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const transaction = db.transaction(['queuedMessages'], 'readonly');
    const store = transaction.objectStore('queuedMessages');
    const messages = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    
    console.log(`📡 [SW] Found ${messages.length} queued messages to sync`);
    
    for (const messageData of messages) {
      try {
        // Attempt to send queued message
        const response = await fetch('/api/fast-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'send',
            text: messageData.message.text,
            messageId: messageData.message.id,
            replyTo: messageData.message.replyTo
          })
        });

        if (response.ok) {
          // Remove from queue on success
          const deleteTransaction = db.transaction(['queuedMessages'], 'readwrite');
          const deleteStore = deleteTransaction.objectStore('queuedMessages');
          deleteStore.delete(messageData.id);
          console.log(`📡 [SW] Successfully synced message: ${messageData.id}`);
        }
      } catch (error) {
        console.log(`📡 [SW] Background sync failed for message: ${messageData.id}`, error);
      }
    }
  } catch (error) {
    console.error('📡 [SW] Background sync error:', error);
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('📡 [SW] Push notification received');
  
  let notificationData = {};
  try {
    notificationData = event.data ? event.data.json() : {};
  } catch (e) {
    notificationData = { body: event.data ? event.data.text() : 'New message received' };
  }

  const options = {
    body: notificationData.body || 'New message received',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      messageId: notificationData.messageId,
      sender: notificationData.sender
    },
    actions: [
      {
        action: 'reply',
        title: 'Reply',
        icon: '/icon-192.png'
      },
      {
        action: 'view',
        title: 'View',
        icon: '/icon-192.png'
      }
    ],
    requireInteraction: true,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification('Hellow Chat', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('📡 [SW] Notification clicked');
  event.notification.close();

  if (event.action === 'reply') {
    // Open app for reply
    event.waitUntil(
      clients.openWindow('/?action=reply&messageId=' + event.notification.data.messageId)
    );
  } else if (event.action === 'view' || !event.action) {
    // Open app normally
    event.waitUntil(
      clients.openWindow('/')
    );
  }
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
  // Bypass the service worker for API and SSE endpoints to avoid interfering with EventSource
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) {
    return; // Let browser handle these requests directly
  }

  // Network-first strategy with offline fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, responseClone));
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(request);
      })
  );
});
