// This service worker helps with offline handling and network optimizations
// Particularly for the Stripe subscription API calls

const CACHE_NAME = 'fishcad-cache-v1';
const API_CACHE_NAME = 'fishcad-api-cache-v1';

// Set of URLs to cache for offline use
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html'
];

// API paths that should NEVER be cached
const NEVER_CACHE_PATHS = [
  '/api/pricing/user-subscription/',
  '/api/pricing/optimize-subscription/',
  '/api/pricing/create-checkout-session',
  '/api/pricing/verify-subscription',
  '/api/pricing/cancel-subscription'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker caching core assets');
        return cache.addAll(URLS_TO_CACHE);
      })
  );

  // Activate immediately
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => {
          return cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME;
        }).map((cacheName) => {
          console.log('Service Worker: Deleting old cache', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  
  // Take control of all clients immediately
  self.clients.claim();
});

// Helper function to check if a request should be cached
const shouldCache = (url) => {
  const parsedURL = new URL(url);
  
  // Check if this is an API call that should never be cached
  for (const path of NEVER_CACHE_PATHS) {
    if (parsedURL.pathname.includes(path)) {
      return false;
    }
  }
  
  // Don't cache URLs with cache busting parameters
  if (parsedURL.search.includes('_t=')) {
    return false;
  }
  
  return true;
};

// Handle fetch events - network first strategy for API requests
self.addEventListener('fetch', (event) => {
  // Get the request URL
  const requestURL = new URL(event.request.url);
  
  // For API/Stripe requests - use network first strategy with very short timeout
  if (requestURL.pathname.includes('/api/pricing/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Don't cache these API responses - they should always be fresh
          return response;
        })
        .catch(() => {
          // If network fails, respond with offline message for API requests
          return new Response(
            JSON.stringify({ 
              error: 'You are currently offline. Please check your internet connection.' 
            }),
            { 
              status: 503, 
              headers: { 'Content-Type': 'application/json' } 
            }
          );
        })
    );
    return;
  }
  
  // For other requests - cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached response if available
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Otherwise make network request
        return fetch(event.request)
          .then((response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // If request should be cached, store in cache
            if (shouldCache(event.request.url)) {
              // Clone the response as it can only be used once
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            
            return response;
          })
          .catch(() => {
            // If network and cache both fail, show offline page
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            
            // Otherwise return default offline response
            return new Response(
              'Network error occurred',
              { status: 503, statusText: 'Service Unavailable' }
            );
          });
      })
  );
}); 