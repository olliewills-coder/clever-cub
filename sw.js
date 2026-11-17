// Clever Cub offline cache. Bump VERSION whenever index.html changes so the iPad picks up the new copy.
const VERSION = 'clevercub-187ece1ee1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Andika:wght@400;700&display=swap';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    // Keep the reading font for offline use (falls back to the iPad's own font if this fails)
    try {
      const res = await fetch(FONT_CSS);
      if (res.ok) {
        await cache.put(FONT_CSS, res.clone());
        const css = await res.text();
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(() => {})));
      }
    } catch (e) {}
    // Recorded voice pack, if one has been added: keep every clip for offline use
    try {
      const res = await fetch('./voice/manifest.json', {cache: 'no-cache'});
      if (res.ok) {
        await cache.put('./voice/manifest.json', res.clone());
        const files = [...new Set(Object.values((await res.json()).clips || {}))];
        for (let i = 0; i < files.length; i += 40)
          await Promise.all(files.slice(i, i + 40).map(f => cache.add('./voice/' + f).catch(() => {})));
      }
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const putCopy = res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; };

  if (url.origin === self.location.origin) {
    // The page and the voice list: try the network first so updates arrive, fall back to the saved copy offline
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('manifest.json')) {
      event.respondWith(fetch(req).then(putCopy).catch(() =>
        caches.match(req, {ignoreSearch: true}).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
      return;
    }
    event.respondWith(caches.match(req).then(r => r || fetch(req).then(putCopy)));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.match(req).then(r => r || fetch(req).then(putCopy)));
  }
});
