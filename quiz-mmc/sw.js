// Quiz MMC : fonctionne hors-ligne. Réseau d'abord (mises à jour immédiates), cache si pas de connexion.
const VERSION = 'quiz-mmc-v3';
const SHELL = ['./', 'index.html', 'fiche.html', 'Fiche_revision_MMC.pdf', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png',
  'vendor/katex/katex.min.css', 'vendor/katex/katex.min.js', 'vendor/katex/contrib/auto-render.min.js',
  'vendor/katex/fonts/KaTeX_AMS-Regular.woff2', 'vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2', 'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2', 'vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2', 'vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2', 'vendor/katex/fonts/KaTeX_Main-Bold.woff2', 'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2', 'vendor/katex/fonts/KaTeX_Main-Italic.woff2', 'vendor/katex/fonts/KaTeX_Main-Regular.woff2', 'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2', 'vendor/katex/fonts/KaTeX_Math-Italic.woff2', 'vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2', 'vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2', 'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2', 'vendor/katex/fonts/KaTeX_Script-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size1-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size2-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size3-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size4-Regular.woff2', 'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('quiz-mmc') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) {
    // polices Google : cache d'abord
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const c = res.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); return res; })));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
