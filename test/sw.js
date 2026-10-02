// 販売レジをオフラインでも開けるようにするための Service Worker。
// build-pages.js / build-test.js が github-pages/ と github-pages/test/ にそのまま置く。
//  - 画面（register.html など）: ネット優先。つながらなければ前回保存したものを出す
//  - 商品写真・文字（フォント）: 一度読んだら端末に保存して、それを使う
//  - 在庫データの通信（script.google.com）: さわらない（レジ側で端末に保存している）
const VERSION = 'v1';
const PAGE_CACHE = 'pages-' + VERSION;
const IMG_CACHE = 'img-v1';
const PAGES = ['register.html', 'manifest-register.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGE_CACHE).then(c => c.addAll(PAGES)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('pages-') && k !== PAGE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, ng) => setTimeout(() => ng(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'lh3.googleusercontent.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(PAGE_CACHE);
      try {
        const res = await withTimeout(fetch(req), 5000);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
      }
    })());
  }
});
