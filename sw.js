// Cambia versione quando aggiorni file, così non rimani con roba vecchia.
const CACHE_VERSION = "manutreni-v7";
const ASSETS = [
    "./",
"./index.html",
"./styles.css",
"./app.js",
"./manifest.json",
"./icon-192.png",
"./icon-512.png"
];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Network-first per HTML/JS/CSS, cache fallback
self.addEventListener("fetch", (e) => {
    const req = e.request;
    const url = new URL(req.url);

    // Solo stesso origin
    if (url.origin !== location.origin) return;

    e.respondWith(
        fetch(req)
        .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./")))
    );
});
