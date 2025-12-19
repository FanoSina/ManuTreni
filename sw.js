const CACHE = "manutreni-v2";

self.addEventListener("install", e => {
    self.skipWaiting();
});

self.addEventListener("activate", e => {
    self.clients.claim();
});
