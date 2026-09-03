/**
 * Service Worker for WEP Venue Maps
 * Offline support plus caching tuned so content never goes stale:
 *   - HTML and data.json: network-first (3 s timeout), cache fallback
 *   - CSS / JS: cache-first with background refresh
 *   - Images (including thumbs/): cache-first, long-lived
 */

const CACHE_VERSION = 'v9';
const STATIC_CACHE = `wep-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `wep-images-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/Fiber.html',
  '/ESPN.html',
  '/camera_positions.html',
  '/style.css',
  '/script.js',
  '/header.js',
  '/nav.js',
  '/search.js',
  '/image-zoom.js',
  '/data.json',
  '/print.css',
  '/manifest.json'
];

// Install event - cache static assets immediately.
// Add one at a time so a single missing page (e.g. a renamed category)
// doesn't abort the whole install.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.all(
        STATIC_ASSETS.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== IMAGE_CACHE) {
            return caches.delete(cacheName);
          }
          return null;
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return;

  // Admin editor files change often and stale JS breaks the editor/tour
  if (url.pathname.startsWith('/admin')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  if (isImageRequest(request)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  // HTML pages and data.json must be fresh: network first, short timeout
  if (isFreshnessCritical(request, url.pathname)) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // CSS / JS / manifest - cache first with background update
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstWithUpdate(request, STATIC_CACHE));
    return;
  }

  event.respondWith(networkFirstWithCache(request));
});

function isImageRequest(request) {
  const url = new URL(request.url);
  return /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(url.pathname);
}

function isFreshnessCritical(request, pathname) {
  if (request.mode === 'navigate') return true;
  if (pathname === '/' || pathname.endsWith('/')) return true;
  if (/\.html$/i.test(pathname)) return true;
  if (/\/data\.json$/i.test(pathname)) return true;
  if (/\/sw\.js$/i.test(pathname)) return true;
  return false;
}

function isStaticAsset(pathname) {
  return STATIC_ASSETS.includes(pathname) ||
         /\.(css|js|json|webmanifest)$/i.test(pathname);
}

// Fetch with a timeout; rejects if the network is slower than the limit
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network timeout')), ms);
    fetch(request).then((response) => {
      clearTimeout(timer);
      resolve(response);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Cache-first strategy for images (fastest for repeat visits)
async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('', { status: 404 });
  }
}

// Cache-first with background update for static assets
async function cacheFirstWithUpdate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  if (cachedResponse) return cachedResponse;
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;
  return new Response('', { status: 504, statusText: 'Offline' });
}

// Network-first (with timeout) and cache fallback
async function networkFirstWithCache(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    if (request.mode === 'navigate' ||
        (request.headers.get('Accept') || '').includes('text/html')) {
      const fallback = await cache.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.action === 'skipWaiting') {
    self.skipWaiting();
  }

  // Precache images on demand (the page sends thumbnail URLs only)
  if (data.action === 'precacheImages') {
    const images = Array.isArray(data.images) ? data.images : [];
    caches.open(IMAGE_CACHE).then((cache) => {
      images.forEach((url) => {
        cache.match(url).then((hit) => {
          if (hit) return;
          fetch(url).then((response) => {
            if (response.ok) {
              cache.put(url, response);
            }
          }).catch(() => {});
        });
      });
    });
  }
});
