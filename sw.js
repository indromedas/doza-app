/* Офлайн-кэш калькулятора дозировок.
   При каждом обновлении калькулятора увеличивайте VERSION — старый кэш удалится. */
const VERSION = 'doza-v12';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'fonts/fonts.css', 'fonts/GolosText-cyrillic-0.woff2', 'fonts/GolosText-latin-1.woff2',
  'fonts/JetBrainsMono-cyrillic-2.woff2', 'fonts/JetBrainsMono-latin-3.woff2'];
const EXT = /^https:\/\/telegram\.org\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(p, ms) {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Страница: сначала сеть (чтобы приходили обновления), без сети — сохранённая копия
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(
      withTimeout(fetch(req), 4000)
        .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return r; })
        .catch(() => caches.match('index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Файлы приложения: из кэша, иначе из сети
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const copy = n.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return n; })));
    return;
  }

  // Шрифты и скрипт Telegram: отдать из кэша и обновить в фоне
  if (EXT.test(req.url)) {
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(n => { c.put(req, n.clone()); return n; }).catch(() => hit);
      return hit || net;
    })));
  }
});
