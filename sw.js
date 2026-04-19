// Service Worker for offline PWA support
const CACHE_NAME = 'vanco-tdm-v2';
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

// Fetch: network-first for CDN resources, cache-first for local assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Network-first for CDN resources (Chart.js, fonts, analytics)
    if (url.origin !== location.origin) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache CDN resources on success
                    if (response.ok && !url.hostname.includes('google') && !url.hostname.includes('clarity')) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for local assets
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }))
    );
});
