import { marked } from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/purify.es.mjs';
import katex from '../vendor/katex/katex.mjs';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- icônes (tracés maison, style trait) ---------- */
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>',
  brain: '<path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 1V5a2 2 0 00-3-1z"/><path d="M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 10-2 6"/><path d="M20 5v6h-6"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 012 2v12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  cloud: '<path d="M7 18a5 5 0 01-.6-10A6 6 0 0118 9a4.5 4.5 0 01-.5 9z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
};
export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/* ---------- toasts & modales ---------- */
export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6500 : 3500);
}

export function modal({ title, body = '', actions = [], wide = false, onOpen }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></header>
    <div class="body">${body}</div>
    <footer></footer></div>`;
  const footer = $('footer', back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || (a.primary ? 'primary' : ''));
    b.innerHTML = a.label;
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const r = await a.onClick(back); if (r !== false) close(); }
      catch (e) { toast(e.message || String(e), 'error'); }
      finally { b.disabled = false; }
    };
    footer.appendChild(b);
  });
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(back);
  onOpen?.(back);
  return { el: back, close };
}

export function confirmDialog(title, text, label = 'Confirmer', danger = true) {
  return new Promise((resolve) => {
    const m = modal({
      title, body: `<p>${text}</p>`,
      actions: [{ label: 'Annuler', onClick: () => resolve(false) }, { label, cls: danger ? 'primary danger-bg' : 'primary', onClick: () => resolve(true) }],
    });
    m.el.addEventListener('click', (e) => { if (e.target === m.el) resolve(false); });
  });
}

/* ---------- Markdown + formules LaTeX ---------- */
marked.setOptions({ gfm: true, breaks: false });
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?![\w$])/g;

function protectMath(src) {
  const parts = [];
  const out = src.replace(MATH, (m, d1, d2, i1, i2) => {
    const display = d1 != null || d2 != null;
    const tex = d1 ?? d2 ?? i1 ?? i2;
    let html;
    try { html = katex.renderToString(tex.trim(), { displayMode: display, throwOnError: false, strict: 'ignore' }); }
    catch { html = esc(m); }
    parts.push(html);
    return `KXM${parts.length - 1}XK`;
  });
  return { out, parts };
}
function restore(html, parts) { return html.replace(/KXM(\d+)XK/g, (_, i) => parts[+i]); }

export function md(src) {
  if (!src) return '';
  const { out, parts } = protectMath(String(src));
  const html = DOMPurify.sanitize(marked.parse(out));
  return restore(html, parts);
}
export function mdInline(src) {
  if (!src) return '';
  const { out, parts } = protectMath(String(src));
  return restore(DOMPurify.sanitize(marked.parseInline(out)), parts);
}

/* ---------- dates ---------- */
export const DAY = 86400000;
export function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
export function parseYmd(s, time) { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); if (time) { const [h, mi] = time.split(':').map(Number); dt.setHours(h, mi); } return dt; }
export function daysUntil(dateStr) { return Math.round((parseYmd(dateStr) - startOfDay()) / DAY); }
export const fmt = {
  day: (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  short: (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
  dm: (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
  time: (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  rel: (d) => {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return `le ${new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
  },
};
export function countdownLabel(n) { return n === 0 ? 'Auj.' : n === 1 ? 'Demain' : n < 0 ? `J+${-n}` : `J-${n}`; }
export function countdownCls(n) { return n <= 2 ? 'urgent' : n <= 7 ? 'soon' : ''; }

export function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
export function fileSize(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' Ko'; }
