const CACHE_NAME = "manutreni-v3";
const ASSETS = [
    "./",
"./index.html",
"./styles.css",
"./app.js",
"./manifest.webmanifest",
"./icon-192.png",
"./icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((resp) => {
                const copy = resp.clone();
                caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
                return resp;
            }).catch(() => cached);
        })
    );
});
