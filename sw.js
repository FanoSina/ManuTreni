const CACHE = "manutreni-v1";
const FILES = [
    "./",
"./index.html",
"./styles.css",
"./app.js",
"./manifest.json"
];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
    self.skipWaiting();
});

self.addEventListener("fetch", e => {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
