// 販売レジを完全オフラインでも開けるようにするための Service Worker。
// build-pages.js / build-test.js が github-pages/ と github-pages/test/ にそのまま置く。
//  - 画面（register.html など）: 端末に保存したものをすぐ出す。新しい版は裏で取ってきて、次に開いたときに替わる
//  - 商品写真・文字（フォント）・アイコン: 一度読んだら端末に保存して、それを使う
//  - 在庫データの通信（script.google.com）: さわらない（レジ側で端末に保存している）
const VERSION = 'v2';
const PAGE_CACHE = 'pages-' + VERSION;
const IMG_CACHE = 'img-v1';
const PAGES = ['register.html', 'manifest-register.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGE_CACHE)
    .then(c => Promise.all(PAGES.map(p => fetch(p, { cache: 'reload' }).then(r => r.ok && c.put(p, r)).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('pages-') && k !== PAGE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const STATIC_HOSTS = ['lh3.googleusercontent.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 写真・フォント：保存があればそれを使う。なければ取ってきて保存
  if (STATIC_HOSTS.includes(url.hostname) || (url.origin === self.location.origin && /\/icons\/|\.png$/.test(url.pathname))) {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // 画面：保存した版をすぐ出し、裏で新しい版に入れ替えておく（電波が弱くても待たない）
  // （在庫確認ページ・管理画面はふつうに読みこむ。販売レジだけを端末から出す）
  if (url.origin === self.location.origin && /\/(register\.html|manifest-register\.webmanifest)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(PAGE_CACHE);
      const key = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      const hit = await c.match(key, { ignoreSearch: true }) || await c.match(req, { ignoreSearch: true });
      const update = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) c.put(key, res.clone());
        return res;
      });
      if (hit) {
        e.waitUntil(update.catch(() => {}));
        return hit;
      }
      return update;
    })());
  }
});
