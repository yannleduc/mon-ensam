import { $, icon, toast, esc } from './ui.js';
import { store, settings, onChange, flushProgress } from './store.js';

const ROUTES = [
  { id: 'home', path: '', label: 'Accueil', icon: 'home', load: () => import('./views/home.js') },
  { id: 'cours', path: 'cours', label: 'Cours', icon: 'book', load: () => import('./views/courses.js') },
  { id: 'revision', path: 'revision', label: 'Révisions', icon: 'brain', load: () => import('./views/revise.js') },
  { id: 'edt', path: 'edt', label: 'Emploi du temps', short: 'EDT', icon: 'calendar', load: () => import('./views/edt.js') },
  { id: 'agenda', path: 'agenda', label: 'Agenda', icon: 'flag', load: () => import('./views/agenda.js') },
  { id: 'reglages', path: 'reglages', label: 'Réglages', icon: 'gear', load: () => import('./views/settings.js') },
];
const EXTRA = {
  c: { nav: 'cours', load: () => import('./views/course.js') },
  quiz: { nav: 'revision', load: () => import('./views/quiz.js') },
  cartes: { nav: 'revision', load: () => import('./views/flashcards.js') },
};

function applyTheme() {
  const t = settings.get('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function buildNav() {
  $('#nav').innerHTML = ROUTES.map((r) => `<a href="#/${r.path}" data-nav="${r.id}">${icon(r.icon)}<span>${r.label}</span></a>`).join('');
  $('#tabbar').innerHTML = ROUTES.map((r) => `<a href="#/${r.path}" data-nav="${r.id}">${icon(r.icon)}<span>${r.short || r.label}</span></a>`).join('');
}

function updateSyncStatus() {
  const el = $('#sync-status');
  if (store.mode === 'github') el.innerHTML = `${icon('cloud', 'small')} ${esc(store.repo)}${store.online ? '' : ' · hors-ligne'}`;
  else if (store.mode === 'local') el.textContent = 'Essai local (pas de synchro)';
  else el.textContent = 'Non configuré';
  el.querySelector('svg')?.setAttribute('style', 'width:14px;height:14px;vertical-align:-2px');
}

let current = null;
let renderToken = 0;
export async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [head, ...rest] = hash.split('/');
  const params = rest.map(decodeURIComponent);
  let def, navId;
  if (EXTRA[head]) { def = EXTRA[head]; navId = def.nav; }
  else { def = ROUTES.find((r) => r.path === head) || ROUTES[0]; navId = def.id; }
  if (!store.ready && !['reglages'].includes(navId) && head !== '') { /* accueil gère l'onboarding */ }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navId));
  const view = $('#view');
  const token = ++renderToken;
  current?.destroy?.();
  try {
    const mod = await def.load();
    if (token !== renderToken) return;
    view.innerHTML = '';
    current = (await mod.render(view, params)) || null;
    view.focus({ preventScroll: true });
    if (!location.hash.includes('#keep')) window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><h2>Oups</h2><p>${esc(e.message || e)}</p><p><a href="#/reglages">Vérifier les réglages</a></p></div>`;
  }
  updateSyncStatus();
}

export function rerender() { route(); }

function init() {
  applyTheme();
  store.init();
  buildNav();
  updateSyncStatus();
  window.addEventListener('hashchange', route);
  window.addEventListener('ensam:settings', () => { applyTheme(); store.init(); updateSyncStatus(); });
  window.addEventListener('online', () => { store.online = true; updateSyncStatus(); });
  window.addEventListener('offline', () => { store.online = false; updateSyncStatus(); });
  onChange(() => updateSyncStatus());
  route();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nouvelle version disponible — elle s’appliquera au prochain lancement.');
        });
      });
    }).catch(() => {});
  }
  // Rafraîchit les données quand on revient sur l'appli (ex. Claude a traité un cours entre-temps)
  let lastHidden = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { lastHidden = Date.now(); flushProgress(); }
    else if (Date.now() - lastHidden > 60000 && store.ready) { store.invalidate(); route(); }
  });
}

init();
