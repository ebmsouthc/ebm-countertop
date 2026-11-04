/* Service worker: makes the app installable and shows a clear page when there is no connection.
 * Only the app's own files are cached. Requests to the back end are never cached or replayed. */
'use strict';
var CACHE = 'ebm-g4-v3';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'admin.js', 'xlsx.js', 'api.js', 'camera.js', 'config.js', 'offline.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;     // back-end calls go straight to the network
  if (req.mode === 'navigate') {
    // a fresh page when online; the offline page when not
    e.respondWith(fetch(req).catch(function () { return caches.match('offline.html'); }));
    return;
  }
  // app files: network first (updates arrive at once), cached copy when offline
  e.respondWith(fetch(req).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () { return caches.match(req); }));
});
