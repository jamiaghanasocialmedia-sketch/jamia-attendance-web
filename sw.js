// Minimal service worker: lets the app shell open without a connection (data itself is cached by Firestore).
const CACHE = "jamia-shell-v36";
const SHELL = ["./", "index.html", "app.js", "core.js", "pdf.js", "particulars.js", "exams.js", "sigdata.js", "bg.jpg", "ui.js", "firebase-config.js", "ui.js", "icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
