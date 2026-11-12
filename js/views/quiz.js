import { $, esc, icon, mdInline, md, shuffle } from '../ui.js';
import { store, queueProgress, hash, getAll, subjectOf } from '../store.js';

/** Page d'un quiz généré à la demande (fichier quizzes/<id>.json écrit par Claude). */
export async function render(el, [id]) {
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const txt = await store.text(`quizzes/${id}.json`).catch(() => null);
  if (!txt) { el.innerHTML = `<div class="card empty">Quiz introuvable. <a href="#/revision">Retour</a></div>`; return; }
  const qz = JSON.parse(txt);
  const { subjects, courses } = await getAll();
  const names = (qz.courseIds || []).map((cid) => courses.find((c) => c.id === cid)?.title).filter(Boolean);
  el.innerHTML = `<div class="crumbs"><a href="#/revision">Révisions</a> /</div>
    <div class="page-head"><div><h1>${esc(qz.titre || 'Quiz')}</h1><div class="sub">${esc(names.join(' · '))}</div></div></div>
    <div id="qz"></div>
    ${qz.questionsOuvertes?.length ? `<section class="card" style="margin-top:22px;max-width:760px;margin-inline:auto"><h2>Questions ouvertes</h2>${qz.questionsOuvertes.map((q, i) => `<div class="qa"><div class="q">${i + 1}. ${mdInline(q.question)}</div><details><summary class="small">Voir une réponse attendue</summary><div class="md">${md(q.reponse)}</div></details></div>`).join('')}</section>` : ''}`;
  runQuiz($('#qz', el), qz.quiz || [], { title: qz.titre });
}

/** Lance un quiz QCM dans `container`. Chaque question : {question, choix[], reponse, explication, notion, courseId} */
export function runQuiz(container, questions, { title = 'Quiz', onDone } = {}) {
  const qs = questions.filter((q) => Array.isArray(q.choix) && q.choix.length > 1 && Number.isInteger(q.reponse)).map((q) => {
    const order = shuffle(q.choix.map((_, i) => i));
    return { ...q, choix: order.map((i) => q.choix[i]), reponse: order.indexOf(q.reponse) };
  });
  let i = 0, score = 0;
  const missed = [];
  const start = Date.now();

  const step = () => {
    if (i >= qs.length) return finish();
    const q = qs[i];
    container.innerHTML = `<div class="quiz">
      <div class="row small muted"><span>Question ${i + 1} / ${qs.length}</span><span class="spacer"></span><span>Score : ${score}</span></div>
      <div class="progress" style="margin-top:6px"><div style="width:${(i / qs.length) * 100}%"></div></div>
      ${q.notion ? `<div style="margin-top:14px"><span class="badge">${esc(q.notion)}</span></div>` : ''}
      <div class="q">${mdInline(q.question)}</div>
      <div id="choices">${q.choix.map((c, k) => `<button class="choice" data-k="${k}"><span class="letter">${'ABCDEF'[k]}</span><span>${mdInline(c)}</span></button>`).join('')}</div>
      <div id="after"></div></div>`;
    $('#choices', container).onclick = (e) => {
      const b = e.target.closest('.choice');
      if (!b || b.disabled) return;
      const k = +b.dataset.k, ok = k === q.reponse;
      container.querySelectorAll('.choice').forEach((x) => { x.disabled = true; const kk = +x.dataset.k; if (kk === q.reponse) x.classList.add('correct'); else if (kk === k) x.classList.add('wrong'); });
      if (ok) score++; else missed.push(q);
      const key = `${q.courseId || 'x'}#${hash(q.question)}`;
      queueProgress((p) => { p.questions ||= {}; const r = (p.questions[key] ||= { seen: 0, wrong: 0 }); r.seen++; if (!ok) r.wrong++; r.last = new Date().toISOString(); });
      $('#after', container).innerHTML = `${q.explication ? `<div class="explain">${ok ? '✅ ' : '❌ '}${mdInline(q.explication)}</div>` : ''}
        <div class="row"><span class="spacer"></span><button class="btn primary" id="next">${i + 1 < qs.length ? 'Question suivante' : 'Voir le résultat'} ${icon('chevR')}</button></div>`;
      $('#next', container).onclick = () => { i++; step(); };
      $('#next', container).focus();
    };
  };

  const finish = () => {
    const pct = qs.length ? Math.round((score / qs.length) * 100) : 0;
    const courseIds = [...new Set(qs.map((q) => q.courseId).filter(Boolean))];
    queueProgress((p) => { p.sessions ||= []; p.sessions.push({ type: 'quiz', date: new Date().toISOString(), n: qs.length, score, courseIds, title, secs: Math.round((Date.now() - start) / 1000) }); });
    const R = 64, C = 2 * Math.PI * R;
    container.innerHTML = `<div class="quiz card" style="text-align:center">
      <svg class="score-ring" viewBox="0 0 160 160"><circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--violet-l)" stroke-width="14"/>
        <circle cx="80" cy="80" r="${R}" fill="none" stroke="${pct >= 75 ? 'var(--ok)' : pct >= 50 ? 'var(--jaune)' : 'var(--danger)'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(C * pct) / 100} ${C}" transform="rotate(-90 80 80)"/>
        <text x="80" y="88" text-anchor="middle" font-size="30" font-weight="800" fill="currentColor">${pct}%</text></svg>
      <h2>${score} / ${qs.length} — ${pct >= 85 ? 'Excellent !' : pct >= 65 ? 'Bien joué' : pct >= 45 ? 'Encore un effort' : 'À retravailler'}</h2>
      ${missed.length ? `<div style="text-align:left;margin-top:16px"><h3>À revoir</h3>${missed.map((q) => `<div class="qa"><div class="q">${mdInline(q.question)}</div><div>✅ ${mdInline(q.choix[q.reponse])}</div>${q.explication ? `<div class="small muted" style="margin-top:4px">${mdInline(q.explication)}</div>` : ''}</div>`).join('')}</div>` : ''}
      <div class="row" style="justify-content:center;margin-top:12px">
        ${missed.length ? `<button class="btn primary" id="again-missed">Refaire les ${missed.length} erreur(s)</button>` : ''}
        <button class="btn" id="again">Recommencer</button></div></div>`;
    $('#again', container).onclick = () => runQuiz(container, questions, { title, onDone });
    $('#again-missed', container)?.addEventListener('click', () => runQuiz(container, missed.map((q) => ({ ...q })), { title, onDone }));
    onDone?.({ score, n: qs.length });
  };

  if (!qs.length) { container.innerHTML = `<div class="card empty">Aucune question disponible.</div>`; return; }
  step();
}
