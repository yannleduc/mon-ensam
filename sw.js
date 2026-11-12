// Service worker : l'appli s'ouvre même hors-ligne. Les données passent par l'API GitHub (jamais mises en cache ici).
const VERSION = 'mon-ensam-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/github.js', 'js/db.js', 'js/edt.js', 'js/demo.js',
  'js/views/home.js', 'js/views/courses.js', 'js/views/course.js', 'js/views/quiz.js', 'js/views/flashcards.js',
  'js/views/revise.js', 'js/views/edt.js', 'js/views/agenda.js', 'js/views/settings.js',
  'vendor/marked.esm.js', 'vendor/purify.es.mjs', 'vendor/ical.min.js', 'vendor/katex/katex.mjs', 'vendor/katex/katex.min.css',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/data-template/')) return;
  // réseau d'abord (mises à jour immédiates), cache si hors-ligne
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
