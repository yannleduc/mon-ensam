import { $, esc, icon, mdInline, shuffle, ymd, DAY } from '../ui.js';
import { store, getAll, subjectOf, PATHS, queueProgress, hash } from '../store.js';
import { cardsIndex } from './home.js';

const INTERVALS = [0, 1, 2, 4, 8, 16, 35]; // jours, par boîte de Leitner
export const cardKey = (c) => `${c.courseId}#${hash(c.recto)}`;

export function dueCards(courses, progress, studies, { subjectId, maxNew = 20 } = {}) {
  const today = ymd(new Date());
  const due = [], fresh = [];
  for (const c of courses) {
    if (subjectId && c.subjectId !== subjectId) continue;
    for (const f of studies[c.id]?.flashcards || []) {
      const card = { ...f, courseId: c.id, subjectId: c.subjectId, courseTitle: c.title };
      const st = progress.cards?.[cardKey(card)];
      if (!st) fresh.push(card);
      else if (st.due <= today) due.push(card);
    }
  }
  return [...shuffle(due), ...shuffle(fresh).slice(0, maxNew)];
}

/** Page « séance de flashcards » sur toutes les matières (ou une seule via #/cartes/<matière>). */
export async function render(el, [subjectId]) {
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const [{ subjects, courses }, progress] = await Promise.all([getAll(), store.json(PATHS.progress)]);
  const studies = await cardsIndex(courses);
  const cards = dueCards(courses, progress, studies, { subjectId });
  const s = subjectId ? subjectOf(subjects, subjectId) : null;
  el.innerHTML = `<div class="crumbs"><a href="#/revision">Révisions</a> /</div>
    <div class="page-head"><div><h1>Flashcards${s ? ' · ' + esc(s.name) : ''}</h1><div class="sub">${cards.length} carte(s) à revoir aujourd’hui — répétition espacée</div></div></div>
    <div id="fc"></div>`;
  runCards($('#fc', el), cards.slice(0, 60), { subjects });
}

export function runCards(container, cards, { all = false, subjects = [] } = {}) {
  let queue = all ? shuffle(cards) : [...cards];
  let done = 0, known = 0;
  const total = queue.length;
  const show = () => {
    if (!queue.length) {
      container.innerHTML = `<div class="card empty" style="max-width:620px;margin:0 auto">${icon('check')}<h2>Séance terminée</h2><p>${total ? `${known} / ${total} cartes sues du premier coup.` : 'Aucune carte à revoir pour le moment.'}</p>
        <div class="row" style="justify-content:center">${all && total ? '<button class="btn" id="again">Recommencer</button>' : ''}<a class="btn primary" href="#/revision">Retour aux révisions</a></div></div>`;
      $('#again', container)?.addEventListener('click', () => runCards(container, cards, { all, subjects }));
      if (total) queueProgress((p) => { p.sessions ||= []; p.sessions.push({ type: 'cartes', date: new Date().toISOString(), n: total, score: known }); });
      return;
    }
    const c = queue[0];
    const sub = subjects.length ? subjectOf(subjects, c.subjectId) : null;
    container.innerHTML = `
      <div style="max-width:620px;margin:0 auto">
        <div class="row small muted"><span>${done} / ${total}</span><span class="spacer"></span>${c.courseTitle ? `<span class="ellipsis">${sub ? `<span class="dot" style="background:${sub.color}"></span> ` : ''}${esc(c.courseTitle)}</span>` : ''}</div>
        <div class="progress" style="margin:6px 0 16px"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
      </div>
      <div class="flashcard" id="card" tabindex="0"><div class="inner">
        <div class="face front"><small>Question</small><div>${mdInline(c.recto)}</div></div>
        <div class="face back"><small>Réponse</small><div>${mdInline(c.verso)}</div></div>
      </div></div>
      <p class="small muted" style="text-align:center">Touche la carte pour la retourner</p>
      <div class="row" style="justify-content:center;margin-top:8px" id="grade">
        <button class="btn" data-g="0" style="min-width:150px">${icon('refresh')} À revoir</button>
        <button class="btn primary" data-g="1" style="min-width:150px">${icon('check')} Je savais</button>
      </div>`;
    const card = $('#card', container);
    card.onclick = () => card.classList.toggle('flipped');
    $('#grade', container).onclick = (e) => { const b = e.target.closest('[data-g]'); if (b) grade(+b.dataset.g); };
  };
  const grade = (ok) => {
    if (!queue.length || !$('#card', container)) return;
    const c = queue.shift();
    const key = cardKey(c);
    queueProgress((p) => {
      p.cards ||= {};
      const st = p.cards[key] || { box: 0 };
      if (c._retry) { /* déjà notée dans cette séance */ }
      else if (ok) st.box = Math.min(st.box + 1, INTERVALS.length - 1);
      else st.box = 1;
      st.due = ymd(new Date(Date.now() + (ok ? INTERVALS[st.box] : 1) * DAY));
      st.last = new Date().toISOString();
      p.cards[key] = st;
    });
    if (!c._retry) { done++; if (ok) known++; }
    if (!ok) queue.splice(Math.min(queue.length, 4), 0, { ...c, _retry: true });
    show();
  };
  const onKey = (e) => {
    if (!container.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.target.matches('input,textarea')) return;
    if (e.key === ' ') { e.preventDefault(); $('#card', container)?.classList.toggle('flipped'); }
    if (e.key === 'ArrowRight' || e.key === '2') grade(1);
    if (e.key === 'ArrowLeft' || e.key === '1') grade(0);
  };
  document.addEventListener('keydown', onKey);
  show();
}
