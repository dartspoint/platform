/* DartsPoint stores only public assets here: no accounts, chats or API results. */
const CACHE = "dartspoint-offline-i18n-v1";
const CORE = ["/offline.html", "/offline-i18n.html", "/favicon.svg", "/brand/logo.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("dartspoint-offline-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.includes("auth")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => await caches.match("/offline-i18n.html") || Response.error()));
    return;
  }
  // Never cache RSC payloads, route HTML, login pages or private application data.
  const asset = /\.(?:js|css|woff2?|ttf|svg|png|webp|ico)$/.test(url.pathname);
  if (!asset || request.headers.has("RSC")) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && !response.redirected && response.type !== "opaque") {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => await caches.match(request) || Response.error()));
});
