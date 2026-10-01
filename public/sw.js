/* App shell only. Never cache auth, API responses, query strings or household data. */
const CACHE = "ouchi-shell-v1";
const assets = ["/icons/192", "/icons/512", "/manifest.webmanifest"];
async function cacheShell(response) {
  const cache = await caches.open(CACHE);
  response ??= await fetch("/", { cache: "reload" });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Shell unavailable");
  const html = await response.clone().text();
  const chunks = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/g)].map(match => match[1]);
  await cache.addAll([...new Set([...assets, ...chunks])]);
  await cache.put("/", response);
}
self.addEventListener("install", event => { event.waitUntil(cacheShell()); });
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("ouchi-shell-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search) return;
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        event.waitUntil(cacheShell(response.clone()).catch(() => {}));
        return response;
      } catch { return (await caches.match("/")) ?? Response.error(); }
    })());
    return;
  }
  if (!url.pathname.startsWith("/_next/static/") && !assets.includes(url.pathname)) return;
  event.respondWith((async () => {
    const stored = await caches.match(request);
    if (stored) return stored;
    const response = await fetch(request);
    if (response.ok) { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); }
    return response;
  })());
});
