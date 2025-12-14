/**
 * Service Worker for WEP Venue Maps
 * Provides offline support and aggressive caching for fast loading
 */

const CACHE_VERSION = 'v4';
const STATIC_CACHE = `wep-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `wep-images-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/Fiber.html',
  '/ESPN.html',
  '/camera_positions.html',
  '/test-category.html',
  '/style.css',
  '/script.js',
  '/header.js',
  '/nav.js',
  '/search.js',
  '/data.json',
  '/print.css',
  '/manifest.json'
];

// Install event - cache static assets immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== IMAGE_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - aggressive caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip external requests
  if (url.origin !== location.origin) return;

  // Handle images - cache first, very aggressive
  if (isImageRequest(request)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  // Handle static assets - cache first with background update
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstWithUpdate(request, STATIC_CACHE));
    return;
  }

  // Default - network first, cache fallback
  event.respondWith(networkFirstWithCache(request));
});

// Check if request is for an image
function isImageRequest(request) {
  const url = new URL(request.url);
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname);
}

// Check if pathname is a static asset
function isStaticAsset(pathname) {
  return STATIC_ASSETS.includes(pathname) ||
         /\.(css|js|json|html)$/i.test(pathname);
}

// Cache-first strategy for images (fastest for repeat visits)
async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Return cached immediately, update in background
    updateImageCache(request, cache);
    return cachedResponse;
  }

  // Not cached, fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return placeholder for failed images
    return new Response('', { status: 404 });
  }
}

// Update image cache in background (stale-while-revalidate)
async function updateImageCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (error) {
    // Silent fail - we have cached version
  }
}

// Cache-first with background update for static assets
async function cacheFirstWithUpdate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  // Always try to update in background
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // Return cached if available, otherwise wait for network
  return cachedResponse || fetchPromise;
}

// Network-first with cache fallback
async function networkFirstWithCache(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Return offline fallback for HTML
    if (request.headers.get('Accept')?.includes('text/html')) {
      return cache.match('/index.html');
    }
    throw error;
  }
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }

  // Precache all images on demand
  if (event.data.action === 'precacheImages') {
    const images = event.data.images || [];
    caches.open(IMAGE_CACHE).then((cache) => {
      images.forEach((url) => {
        fetch(url).then((response) => {
          if (response.ok) {
            cache.put(url, response);
          }
        }).catch(() => {});
      });
    });
  }
});
