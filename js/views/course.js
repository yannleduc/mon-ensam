import { $, esc, icon, toast, modal, md, mdInline, fmt, fileSize, confirmDialog } from '../ui.js';
import { store, getAll, subjectOf, PATHS, uid } from '../store.js';
import { statusBadge } from './home.js';
import { runQuiz } from './quiz.js';
import { runCards } from './flashcards.js';

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', txt: 'text/plain', md: 'text/markdown', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv' };

export async function render(el, [id, tabParam]) {
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const { subjects, courses } = await getAll();
  const c = courses.find((x) => x.id === id);
  if (!c) { el.innerHTML = `<div class="card empty">Cours introuvable. <a href="#/cours">Retour</a></div>`; return; }
  const s = subjectOf(subjects, c.subjectId);
  const base = `courses/${c.id}`;
  let fiche = null, study = null;
  if (c.status === 'done') {
    [fiche, study] = await Promise.all([
      store.text(`${base}/fiche.md`).catch(() => null),
      store.text(`${base}/study.json`).then((t) => (t ? JSON.parse(t) : null)).catch(() => null),
    ]);
  }
  const tabs = [
    ['fiche', 'Fiche', 'file'], ['doc', 'Document', 'book'],
    ['quiz', `Quiz${study?.quiz?.length ? ` (${study.quiz.length})` : ''}`, 'brain'],
    ['cartes', `Flashcards${study?.flashcards?.length ? ` (${study.flashcards.length})` : ''}`, 'cards'],
    ['claude', 'Demander à Claude', 'chat'],
  ];
  let tab = tabParam || (c.status === 'done' ? 'fiche' : 'doc');

  el.innerHTML = `
  <div class="crumbs"><a href="#/cours">Cours</a> / <a href="#/cours/${encodeURIComponent(s.id)}">${esc(s.name)}</a></div>
  <div class="course-head">
    <div class="grow"><h1 style="margin-bottom:6px">${esc(c.title)}</h1>
      <div class="row small muted">${statusBadge(c)} <span>${esc(c.fileName)} · ${fileSize(c.size || 0)}</span> <span>ajouté ${fmt.rel(c.addedAt)}</span>${c.processedAt ? `<span>· fiche du ${new Date(c.processedAt).toLocaleDateString('fr-FR')}</span>` : ''}</div>
      ${c.summary ? `<p style="margin:10px 0 0;max-width:820px">${esc(c.summary)}</p>` : ''}
      ${c.keywords?.length ? `<div class="row" style="margin-top:8px">${c.keywords.map((k) => `<span class="badge">${esc(k)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="row">
      <button class="btn" id="regen">${icon('refresh')} ${c.status === 'done' ? 'Regénérer' : 'Consigne'}</button>
      <button class="btn" id="edit">${icon('edit')}</button>
      <button class="btn" id="dl" title="Télécharger l’original">${icon('download')}</button>
      <button class="btn danger" id="del" title="Supprimer">${icon('trash')}</button>
    </div>
  </div>
  ${c.status === 'pending' ? `<div class="notice">${icon('clock')}<div><b>En attente de Claude.</b> La fiche, le quiz et les flashcards seront prêts après le prochain passage de la tâche planifiée. Pour aller plus vite, dis simplement à Claude « traite mes cours ».${c.note ? `<div class="small muted">Consigne : ${esc(c.note)}</div>` : ''}</div></div>` : ''}
  ${c.status === 'error' ? `<div class="notice">${icon('info')}<div><b>Le traitement a échoué.</b> ${esc(c.error || '')}<br><button class="btn sm" id="retry" style="margin-top:6px">Relancer</button></div></div>` : ''}
  <div class="tabs" id="tabs">${tabs.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div>
  <div id="pane"></div>`;

  const pane = $('#pane', el);
  let cleanup = null;
  const show = async (t) => {
    tab = t;
    cleanup?.(); cleanup = null;
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    history.replaceState(null, '', `#/c/${encodeURIComponent(c.id)}/${t}`);
    pane.innerHTML = '';
    if (t === 'fiche') {
      pane.innerHTML = fiche ? `<article class="card md">${md(fiche)}</article>${study ? extras(study) : ''}` : waiting(c);
    } else if (t === 'doc') {
      cleanup = await showDocument(pane, c, base);
    } else if (t === 'quiz') {
      if (!study?.quiz?.length) { pane.innerHTML = waiting(c); return; }
      pane.innerHTML = `<div id="qz"></div>${study.questionsOuvertes?.length ? `<section class="card" style="margin-top:22px;max-width:760px;margin-inline:auto"><h2>Questions ouvertes</h2>${study.questionsOuvertes.map((q, i) => `
        <div class="qa"><div class="q">${i + 1}. ${mdInline(q.question)}</div><details><summary class="small">Voir une réponse attendue</summary><div class="md" style="margin-top:8px">${md(q.reponse)}</div></details></div>`).join('')}</section>` : ''}`;
      runQuiz($('#qz', pane), study.quiz.map((q) => ({ ...q, courseId: c.id })), { title: c.title });
    } else if (t === 'cartes') {
      if (!study?.flashcards?.length) { pane.innerHTML = waiting(c); return; }
      runCards(pane, study.flashcards.map((f) => ({ ...f, courseId: c.id })), { all: true });
    } else if (t === 'claude') {
      await askClaude(pane, c, s, fiche);
    }
  };
  $('#tabs', el).onclick = (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.t); };
  show(tabs.some(([k]) => k === tab) ? tab : 'fiche');

  $('#dl', el).onclick = async () => {
    const buf = await store.blob(`${base}/source.${c.ext}`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: MIME[c.ext] || 'application/octet-stream' }));
    a.download = c.fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  $('#retry', el)?.addEventListener('click', () => setPending(c, c.note));
  $('#regen', el).onclick = () => modal({
    title: c.status === 'done' ? 'Regénérer la fiche' : 'Consigne pour Claude',
    body: `<p class="muted small">Claude refera la fiche, le quiz et les flashcards au prochain passage, en tenant compte de ta consigne.</p>
      <label class="field"><span>Consigne</span><textarea id="r-note" placeholder="Ex. : plus d’exercices types, détaille la méthode des moments">${esc(c.note || '')}</textarea></label>`,
    actions: [{ label: 'Annuler' }, { label: 'Envoyer', primary: true, onClick: (m) => setPending(c, $('#r-note', m).value.trim()) }],
  });
  $('#edit', el).onclick = () => modal({
    title: 'Modifier le cours',
    body: `<label class="field"><span>Titre</span><input type="text" id="e-title" value="${esc(c.title)}"></label>
      <label class="field"><span>Matière</span><select id="e-sub">${subjects.map((x) => `<option value="${esc(x.id)}" ${x.id === c.subjectId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`,
    actions: [{ label: 'Annuler' }, { label: 'Enregistrer', primary: true, onClick: async (m) => {
      const title = $('#e-title', m).value.trim() || c.title, subjectId = $('#e-sub', m).value;
      await store.update(PATHS.courses, (d) => { const x = d.courses.find((y) => y.id === c.id); if (x) Object.assign(x, { title, subjectId }); }, `Cours modifié : ${title}`);
      dispatchEvent(new HashChangeEvent('hashchange'));
    } }],
  });
  $('#del', el).onclick = async () => {
    if (!(await confirmDialog('Supprimer ce cours', `« ${esc(c.title)} », sa fiche, son quiz et ses flashcards seront supprimés du dépôt.`, 'Supprimer'))) return;
    try {
      await store.update(PATHS.courses, (d) => { d.courses = d.courses.filter((x) => x.id !== c.id); }, `Suppression du cours ${c.title}`);
      for (const f of [`source.${c.ext}`, 'fiche.md', 'study.json']) await store.remove(`${base}/${f}`, `Suppression ${c.title}`).catch(() => {});
      toast('Cours supprimé', 'ok');
      location.hash = `#/cours/${encodeURIComponent(c.subjectId)}`;
    } catch (e) { toast(e.message, 'error'); }
  };
  return { destroy: () => cleanup?.() };
}

async function setPending(c, note) {
  await store.update(PATHS.courses, (d) => { const x = d.courses.find((y) => y.id === c.id); if (x) { x.status = 'pending'; x.note = note; delete x.error; } }, `Retraitement demandé : ${c.title}`);
  toast('Demande envoyée à Claude', 'ok');
  dispatchEvent(new HashChangeEvent('hashchange'));
}

function waiting(c) {
  return `<div class="card empty">${icon('clock')}<p>${c.status === 'done' ? 'Contenu absent de la fiche.' : 'Claude n’a pas encore traité ce cours.'}</p><a class="btn" href="#/c/${encodeURIComponent(c.id)}/doc">Voir le document</a></div>`;
}

function extras(s) {
  const parts = [];
  if (s.formules?.length) parts.push(`<section class="card md"><h2>Formulaire</h2><table><thead><tr><th>Nom</th><th>Formule</th><th>À retenir</th></tr></thead><tbody>${s.formules.map((f) => `<tr><td>${mdInline(f.nom)}</td><td>${mdInline('$' + f.latex.replace(/^\$+|\$+$/g, '') + '$')}</td><td>${mdInline(f.explication || '')}</td></tr>`).join('')}</tbody></table></section>`);
  if (s.notions?.length) parts.push(`<section class="card md"><h2>Lexique</h2><dl>${s.notions.map((n) => `<dt><b>${mdInline(n.terme)}</b></dt><dd style="margin:2px 0 10px 0">${mdInline(n.definition)}</dd>`).join('')}</dl></section>`);
  return parts.length ? `<div class="grid cols-2" style="margin-top:16px">${parts.join('')}</div>` : '';
}

async function showDocument(pane, c, base) {
  pane.innerHTML = `<div class="empty"><span class="spinner"></span> Chargement du document…</div>`;
  let buf;
  try { buf = await store.blob(`${base}/source.${c.ext}`); } catch (e) { pane.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return null; }
  if (!buf) { pane.innerHTML = `<div class="card empty">Fichier introuvable dans le dépôt.</div>`; return null; }
  const blob = new Blob([buf], { type: MIME[c.ext] || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const openBtn = `<a class="btn sm" href="${url}" target="_blank" rel="noopener">${icon('external')} Ouvrir à part</a>`;
  if (['png', 'jpg', 'jpeg', 'webp'].includes(c.ext)) {
    pane.innerHTML = `<div class="row" style="margin-bottom:10px">${openBtn}</div><div class="pdf-pages"><img src="${url}" style="max-width:100%;border-radius:6px"></div>`;
  } else if (['txt', 'md', 'csv'].includes(c.ext)) {
    const t = new TextDecoder().decode(buf);
    pane.innerHTML = c.ext === 'md' ? `<article class="card md">${md(t)}</article>` : `<pre class="card" style="white-space:pre-wrap">${esc(t)}</pre>`;
  } else if (c.ext === 'pdf') {
    pane.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="muted small" id="pg"></span><span class="spacer"></span>${openBtn}</div><div class="pdf-pages" id="pages"></div>`;
    return await renderPdf($('#pages', pane), buf, $('#pg', pane), () => URL.revokeObjectURL(url));
  } else {
    pane.innerHTML = `<div class="card empty">${icon('file')}<p>Aperçu non disponible pour les fichiers .${esc(c.ext)} dans l’appli.</p>${openBtn}</div>`;
  }
  return () => URL.revokeObjectURL(url);
}

async function renderPdf(container, buf, label, onDone) {
  const pdfjs = await import('../../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  label.textContent = `${doc.numPages} page(s)`;
  const width = Math.min(container.clientWidth - 28, 1000);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const io = new IntersectionObserver((entries) => {
    entries.forEach(async (en) => {
      if (!en.isIntersecting || en.target.dataset.done) return;
      en.target.dataset.done = '1';
      const page = await doc.getPage(+en.target.dataset.p);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (width / vp1.width) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = `${vp.width / dpr}px`;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      en.target.replaceWith(canvas);
    });
  }, { rootMargin: '600px' });
  for (let i = 1; i <= doc.numPages; i++) {
    const ph = document.createElement('div');
    ph.className = 'ph'; ph.dataset.p = i;
    container.appendChild(ph);
    io.observe(ph);
  }
  return () => { io.disconnect(); doc.destroy(); onDone?.(); };
}

async function askClaude(pane, c, s, fiche) {
  const reqs = (await store.json(PATHS.requests, { fresh: true })).requests || [];
  const mine = reqs.filter((r) => r.type === 'question' && r.params?.courseId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  pane.innerHTML = `
  <div class="grid cols-2">
    <section class="card">
      <h2>${icon('chat')} Poser une question</h2>
      <textarea id="ask-q" placeholder="Ex. : je ne comprends pas pourquoi on néglige l’effort tranchant ici, tu peux m’expliquer avec un exemple ?"></textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="ask-now">${icon('external')} Tout de suite dans Claude</button>
        <button class="btn" id="ask-later">${icon('clock')} Réponse rangée ici</button>
      </div>
      <p class="small muted" style="margin-top:12px"><b>Tout de suite</b> ouvre une conversation Claude avec la fiche du cours déjà collée. <b>Réponse rangée ici</b> envoie la question à la tâche planifiée : Claude répond avec le PDF complet sous les yeux et la réponse reste attachée au cours.</p>
    </section>
    <section class="card">
      <h2>Réponses de Claude</h2>
      ${mine.length ? mine.map((r) => `<div class="qa"><div class="q">${esc(r.params.question)}</div>
        ${r.status === 'done' ? `<div class="md">${md(r.result || '')}</div>` : `<span class="badge y">En attente</span>`}
        <div class="small muted" style="margin-top:6px">${fmt.rel(r.createdAt)}</div></div>`).join('') : '<div class="empty small">Pas encore de question sur ce cours.</div>'}
    </section>
  </div>`;
  $('#ask-now', pane).onclick = () => {
    const q = $('#ask-q', pane).value.trim();
    const build = (n) => {
      const ctx = (fiche || c.summary || '').slice(0, n);
      return `Je suis élève ingénieur en 1re année à Arts et Métiers (PGE). Matière : ${s.name}. Cours : « ${c.title} ».\n\n${ctx ? `Voici ma fiche de révision de ce cours${ctx.length === n ? ' (extrait)' : ''} :\n"""\n${ctx}\n"""\n\n` : ''}${q || 'Aide-moi à réviser ce cours : pose-moi des questions une par une et corrige mes réponses.'}`;
    };
    // le lien ne peut pas tout contenir : la version complète part aussi dans le presse-papiers
    navigator.clipboard?.writeText(build(40000)).then(() => toast('Fiche complète copiée : colle-la dans Claude si besoin')).catch(() => {});
    window.open('https://claude.ai/new?q=' + encodeURIComponent(build(2500)), '_blank', 'noopener');
  };
  $('#ask-later', pane).onclick = async () => {
    const q = $('#ask-q', pane).value.trim();
    if (!q) return toast('Écris ta question', 'error');
    await store.update(PATHS.requests, (d) => { d.requests ||= []; d.requests.push({ id: uid('q-'), type: 'question', status: 'pending', createdAt: new Date().toISOString(), params: { courseId: c.id, question: q } }); }, 'Question pour Claude');
    toast('Question envoyée — réponse au prochain passage de Claude', 'ok');
    askClaude(pane, c, s, fiche);
  };
}
