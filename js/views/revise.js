import { $, esc, icon, toast, shuffle, fmt } from '../ui.js';
import { store, getAll, subjectOf, PATHS, uid, hash } from '../store.js';
import { cardsIndex } from './home.js';
import { dueCards, cardKey } from './flashcards.js';
import { runQuiz } from './quiz.js';

export async function render(el) {
  if (!store.ready) { el.innerHTML = `<div class="card empty">Configure d’abord le stockage. <a href="#/reglages">Réglages</a></div>`; return; }
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const [{ subjects, courses }, progress, reqDoc] = await Promise.all([getAll(), store.json(PATHS.progress), store.json(PATHS.requests)]);
  const studies = await cardsIndex(courses);
  const ready = courses.filter((c) => studies[c.id]);
  const due = dueCards(courses, progress, studies);
  const boxes = [0, 0, 0, 0, 0, 0, 0];
  Object.values(progress.cards || {}).forEach((s) => boxes[s.box || 0]++);
  const maxBox = Math.max(1, ...boxes);
  const quizReqs = (reqDoc.requests || []).filter((r) => r.type === 'quiz').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // taux de réussite par matière
  const perSub = {};
  for (const [key, r] of Object.entries(progress.questions || {})) {
    const c = courses.find((x) => x.id === key.split('#')[0]);
    if (!c) continue;
    const o = (perSub[c.subjectId] ||= { seen: 0, wrong: 0 });
    o.seen += r.seen; o.wrong += r.wrong;
  }
  const sessions = (progress.sessions || []).slice(-8).reverse();

  el.innerHTML = `
  <div class="page-head"><div><h1>Révisions</h1><div class="sub">${ready.length} cours prêts · ${Object.keys(progress.cards || {}).length} flashcards suivies</div></div></div>
  <div class="grid cols-2">
    <section class="card">
      <h2>${icon('cards')} Flashcards du jour</h2>
      <p><b style="font-size:1.6rem;color:var(--violet)">${due.length}</b> carte(s) à revoir</p>
      <div class="leitner" title="Répartition par boîte">${boxes.map((n, i) => `<div style="height:${(n / maxBox) * 100}%"><span>${n}</span></div>`).join('')}</div>
      <div class="row small muted" style="justify-content:space-between;margin:4px 0 14px"><span>nouvelles</span><span>maîtrisées</span></div>
      <div class="row"><a class="btn primary" href="#/cartes">${icon('play')} Toutes les matières</a>
        ${subjects.filter((s) => due.some((c) => c.subjectId === s.id)).map((s) => `<a class="btn sm" href="#/cartes/${encodeURIComponent(s.id)}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</a>`).join('')}</div>
    </section>

    <section class="card">
      <h2>${icon('brain')} Quiz sur mesure</h2>
      ${ready.length ? `
      <div id="pick" style="max-height:240px;overflow:auto;margin-bottom:12px">${subjects.map((s) => {
        const cs = ready.filter((c) => c.subjectId === s.id);
        if (!cs.length) return '';
        return `<label class="check"><input type="checkbox" data-sub="${esc(s.id)}"><span><b>${esc(s.name)}</b></span></label>
          <div style="padding-left:26px">${cs.map((c) => `<label class="check small"><input type="checkbox" data-course="${esc(c.id)}" data-parent="${esc(s.id)}"><span>${esc(c.title)}</span></label>`).join('')}</div>`;
      }).join('')}</div>
      <div class="row">
        <select id="n" style="width:auto"><option value="10">10 questions</option><option value="20" selected>20 questions</option><option value="40">40 questions</option><option value="999">Toutes</option></select>
        <label class="check small"><input type="checkbox" id="weak" checked><span>Priorité à mes erreurs</span></label>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn accent" id="go">${icon('play')} Lancer</button><button class="btn" id="ask">${icon('sparkle')} Nouveau quiz par Claude</button></div>`
      : `<div class="empty small">Les quiz apparaîtront quand Claude aura traité tes premiers cours.</div>`}
    </section>

    <section class="card">
      <h2>${icon('sparkle')} Quiz préparés par Claude</h2>
      ${quizReqs.length ? `<div class="list">${quizReqs.slice(0, 10).map((r) => `<div class="list-item"><div class="grow"><div class="title ellipsis">${esc(r.params?.titre || 'Quiz personnalisé')}</div><div class="small muted">${fmt.rel(r.createdAt)} · ${(r.params?.courseIds || []).length} cours</div></div>
        ${r.status === 'done' && r.result ? `<a class="btn sm primary" href="#/quiz/${encodeURIComponent(r.id)}">Faire</a>` : r.status === 'error' ? '<span class="badge danger">Erreur</span>' : '<span class="badge y">En attente</span>'}</div>`).join('')}</div>`
      : `<p class="muted small">Demande un quiz inédit sur plusieurs cours (bouton « Nouveau quiz par Claude ») : il sera prêt après le prochain passage de la tâche planifiée.</p>`}
    </section>

    <section class="card">
      <h2>${icon('flag')} Où j’en suis</h2>
      ${Object.keys(perSub).length ? `<div class="list">${Object.entries(perSub).map(([sid, o]) => {
        const s = subjectOf(subjects, sid), pct = Math.round(((o.seen - o.wrong) / o.seen) * 100);
        return `<div class="list-item"><span class="dot" style="background:${s.color}"></span><div class="grow"><div class="title">${esc(s.name)}</div><div class="progress" style="margin-top:4px"><div style="width:${pct}%"></div></div></div><b>${pct}%</b></div>`;
      }).join('')}</div>` : '<p class="muted small">Tes taux de réussite par matière s’afficheront après tes premiers quiz.</p>'}
      ${sessions.length ? `<h3 style="margin-top:16px">Dernières séances</h3>${sessions.map((x) => `<div class="small" style="padding:3px 0">${x.type === 'quiz' ? '🧠' : '🃏'} ${esc(fmt.rel(x.date))} — ${x.score}/${x.n}${x.title ? ' · ' + esc(x.title) : ''}</div>`).join('')}` : ''}
    </section>
  </div>
  <div id="run" style="margin-top:22px"></div>`;

  const pick = $('#pick', el);
  if (!pick) return;
  pick.onchange = (e) => {
    const t = e.target;
    if (t.dataset.sub) pick.querySelectorAll(`[data-parent="${CSS.escape(t.dataset.sub)}"]`).forEach((x) => (x.checked = t.checked));
  };
  const selected = () => [...pick.querySelectorAll('[data-course]:checked')].map((x) => x.dataset.course);

  $('#go', el).onclick = () => {
    let ids = selected();
    if (!ids.length) ids = ready.map((c) => c.id);
    let pool = ids.flatMap((id) => (studies[id]?.quiz || []).map((q) => ({ ...q, courseId: id })));
    if ($('#weak', el).checked) {
      const score = (q) => { const r = progress.questions?.[`${q.courseId}#${hash(q.question)}`]; return r ? (r.wrong + 1) / (r.seen + 1) + Math.random() * 0.3 : 0.6 + Math.random() * 0.3; };
      pool = pool.map((q) => [score(q), q]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    } else pool = shuffle(pool);
    const n = +$('#n', el).value;
    const run = $('#run', el);
    run.innerHTML = `<div class="row" style="max-width:760px;margin:0 auto 10px"><h2 style="margin:0">Quiz en cours</h2><span class="spacer"></span><button class="btn sm ghost" id="stop">${icon('x')} Arrêter</button></div><div id="qz"></div>`;
    $('#stop', run).onclick = () => (run.innerHTML = '');
    runQuiz($('#qz', run), shuffle(pool.slice(0, n)), { title: `Quiz ${ids.length} cours` });
    run.scrollIntoView({ behavior: 'smooth' });
  };

  $('#ask', el).onclick = async () => {
    const ids = selected();
    if (!ids.length) return toast('Coche au moins un cours', 'error');
    const weakNotions = Object.entries(progress.questions || {}).filter(([k, r]) => ids.includes(k.split('#')[0]) && r.wrong > 0).length;
    const { modal } = await import('../ui.js');
    modal({
      title: 'Nouveau quiz par Claude',
      body: `<p class="muted small">${ids.length} cours sélectionné(s). Claude écrit des questions inédites (pas celles déjà vues)${weakNotions ? ' et insiste sur tes points faibles' : ''}.</p>
        <label class="field"><span>Titre</span><input type="text" id="t" value="Révision ${new Date().toLocaleDateString('fr-FR')}"></label>
        <label class="field"><span>Nombre de questions</span><select id="nq"><option>10</option><option selected>20</option><option>30</option></select></label>
        <label class="field"><span>Consigne <small>(facultatif)</small></span><input type="text" id="f" placeholder="Ex. : type contrôle, beaucoup d’applications numériques"></label>`,
      actions: [{ label: 'Annuler' }, { label: 'Demander', primary: true, onClick: async (m) => {
        await store.update(PATHS.requests, (d) => {
          d.requests ||= [];
          d.requests.push({ id: uid('quiz-'), type: 'quiz', status: 'pending', createdAt: new Date().toISOString(),
            params: { courseIds: ids, titre: $('#t', m).value.trim() || 'Quiz personnalisé', nombre: +$('#nq', m).value, consigne: $('#f', m).value.trim() } });
        }, 'Demande de quiz');
        toast('Demande envoyée — quiz prêt au prochain passage de Claude', 'ok');
        dispatchEvent(new HashChangeEvent('hashchange'));
      } }],
    });
  };
}
