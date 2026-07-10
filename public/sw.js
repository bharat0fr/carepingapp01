const CACHE = 'care-ping-v1';
const STATIC_ASSETS = ['/', '/index.html'];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network, clone BEFORE consuming
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const resClone = res.clone(); // clone BEFORE returning/consuming
            caches.open(CACHE).then((c) => c.put(event.request, resClone));
          }
          return res;
        })
        .catch(() => {
          // For navigation requests, return cached index.html as SPA fallback
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Care Ping', body: event.data ? event.data.text() : 'Someone pinged you!' };
  }

  const title = data.title || 'Care Ping 💙';
  const options = {
    body: data.body || 'Someone pinged you!',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    tag: data.room_code ? `ping-${data.room_code}` : 'ping',
    renotify: true,
    data: {
      room_code: data.room_code || null,
      tab: data.tab || 'feed',
    },
    actions: [
      { action: 'view', title: 'View Ping' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification clicked — deep-link to correct room
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetRoom = event.notification.data?.room_code;
  const targetTab = event.notification.data?.tab || 'feed';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(self.location.origin)) {
            // Tell the open tab to switch to the right room
            client.postMessage({ type: 'SWITCH_ROOM', room_code: targetRoom, tab: targetTab });
            return client.focus();
          }
        }
        // App is closed — open fresh with query params
        const url = targetRoom
          ? `/?room=${encodeURIComponent(targetRoom)}&tab=${targetTab}`
          : '/';
        return clients.openWindow(url);
      })
  );
});

// Push subscription changed (browser rotated it)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then((newSub) => {
        // Broadcast to any open clients so they can re-save to Supabase
        return self.clients.matchAll({ type: 'window' }).then((list) => {
          for (const client of list) {
            client.postMessage({
              type: 'PUSH_SUBSCRIPTION_CHANGED',
              subscription: newSub.toJSON(),
            });
          }
        });
      })
      .catch(() => {
        // Couldn't resubscribe — client needs to re-request permission
        self.clients.matchAll({ type: 'window' }).then((list) => {
          for (const client of list) {
            client.postMessage({ type: 'PUSH_SUBSCRIPTION_LOST' });
          }
        });
      })
  );
});
