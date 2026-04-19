// Service Worker for offline PWA support
const CACHE_NAME = 'vanco-tdm-v4';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './js/app.js',
    './js/i18n.js',
    './js/pk-calculations.js',
    './js/bayesian-fitting.js',
    './js/validation.js',
    './js/chart.js',
    './js/history.js',
    './manifest.json'
];

// Install: cache core assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

function shouldCache(request, url) {
    if (request.method !== 'GET') return false;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.hostname.includes('google') || url.hostname.includes('clarity')) return false;
    return true;
}

// Fetch: network-first for CDN resources, cache-first for local assets
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and non-http(s) schemes (chrome-extension, etc.)
    if (request.method !== 'GET' || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
        return;
    }

    // Network-first for CDN resources (Chart.js, fonts, analytics)
    if (url.origin !== location.origin) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok && shouldCache(request, url)) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Cache-first for local assets
    event.respondWith(
        caches.match(request)
            .then(cached => cached || fetch(request).then(response => {
                if (response.ok && shouldCache(request, url)) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
                }
                return response;
            }))
    );
});
