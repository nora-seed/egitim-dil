const CACHE = "diller-v2";
const PRECACHE = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "data/manifest.json",
  "data/ru-vocab.json",
  "data/fr-vocab.json",
  "data/data.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).then(() => self.skipWaiting()))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  try {
    if (e.request.method !== "GET") return;

    // veri dosyaları: önce cache, sonra ağ (offline öncelikli, stale olabilir)
    if (url.pathname.includes("/data/")) {
      e.respondWith(
        caches.open(CACHE).then((c) =>
          c.match(e.request).then(
            (hit) =>
              hit ||
              fetch(e.request).then((res) => {
                if (res.ok) c.put(e.request, res.clone());
                return res;
              })
          )
        )
      );
      return;
    }
    // kabuk (html/css/js): stale-while-revalidate
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((hit) => {
          const net = fetch(e.request)
            .then((res) => {
              if (res.ok) c.put(e.request, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || net;
        })
      )
    );
  } catch (err) {
    return;
  }
});
