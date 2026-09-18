// ============================================
// Service worker: (1) minimal caching so the browser considers the app
// installable, and (2) Firebase Cloud Messaging background push handling.
// ============================================

// Bumping this name makes the activate step below delete every older cache,
// including the stale cache-first one that used to pin users to old code.
const CACHE_NAME = 'ffl-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function saveCopy(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
}

// Same-origin GET files only — never touches Supabase (rest/storage) calls,
// those always go straight to the network live.
//   • /assets/* are content-hashed build files (a changed file gets a new
//     name), so cache-first is both safe and fast.
//   • Everything else — index.html, manifest, icons, and every module in dev —
//     is network-first, so a new deploy reaches users on their next visit. The
//     cache is only the offline fallback that keeps the app installable.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => { saveCopy(request, res); return res; }))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => { saveCopy(request, res); return res; })
      .catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : undefined)))
  );
});

// ============================================
// Firebase Cloud Messaging — background push
// ============================================
// 👇 نفس القيم اللي هتحطها في src/lib/firebase.js (Firebase Web config —
// دي قيم عمومية زي Supabase anon key، مش سر لازم تتخبى)
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'PASTE_FIREBASE_API_KEY_HERE',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.appspot.com',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'فانتازي فچالة ليج';
  const body = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const hadWindow = clientsArr.find((c) => 'focus' in c);
      if (hadWindow) return hadWindow.focus();
      return self.clients.openWindow('/');
    })
  );
});
