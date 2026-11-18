import { $, esc, icon, toast, modal, fileSize, confirmDialog } from '../ui.js';
import { store, getAll, subjectOf, PATHS, uid, slug, SUBJECT_COLORS, COVERS, coverOf, shortName } from '../store.js';
import { statusBadge, subjectCard } from './home.js';

const ACCEPT = '.pdf,.pptx,.ppt,.docx,.doc,.odt,.odp,.txt,.md,.png,.jpg,.jpeg,.heic,.webp,.xlsx,.csv';
const MAX = 90 * 1024 * 1024;

export async function render(el, [subjectId]) {
  if (!store.ready) { el.innerHTML = `<div class="empty">Configure d’abord le stockage. <a href="#/reglages">Réglages</a></div>`; return; }
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const { subjects, courses } = await getAll();
  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : null;
  let q = '';
  const mine = subject ? courses.filter((c) => c.subjectId === subject.id) : courses;

  const draw = () => {
    const filt = (c) => !q || `${c.title} ${c.summary || ''} ${(c.keywords || []).join(' ')} ${c.fileName}`.toLowerCase().includes(q);
    const body = $('#body', el);
    if (subject || q) {
      const list = mine.filter(filt).sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
      body.innerHTML = list.length ? `<div class="clist">${list.map((c, i) => courseRow(c, i, subjects, !subject)).join('')}</div>`
        : `<div class="empty-state"><span class="ghost-word">0</span><div><strong>${q ? 'Aucun cours ne correspond' : 'Pas encore de cours ici'}</strong>${q ? 'Essaie un autre mot.' : 'Ajoute un PDF : Claude en fera une fiche, un quiz et des flashcards.'}</div></div>`;
    } else {
      const orphans = courses.filter((c) => !subjects.find((s) => s.id === c.subjectId));
      body.innerHTML = subjects.length ? `<div class="grid cards">${subjects.map((s) => subjectCard(s, courses)).join('')}</div>
        ${orphans.length ? `<section class="sec"><div class="sec-head"><h2>Sans matière</h2></div><div class="clist">${orphans.map((c, i) => courseRow(c, i, subjects)).join('')}</div></section>` : ''}`
        : `<div class="empty-state"><span class="ghost-word">S1</span><div><strong>Commence par une matière</strong>Par exemple « Résistance des matériaux », puis dépose tes PDF.<div style="margin-top:12px"><button class="btn primary" id="first-subject">${icon('plus')} Créer une matière</button></div></div></div>`;
      $('#first-subject', el)?.addEventListener('click', () => editSubject());
    }
  };

  const done = mine.filter((c) => c.status === 'done').length;
  el.innerHTML = subject ? `
  <nav class="crumbs"><a href="#/">Accueil</a><span>/</span><a href="#/cours">Cours</a><span>/</span><span>${esc(subject.name)}</span></nav>
  <header class="subj-head" style="--c:${subject.color}">
    <p class="subj-word" aria-hidden="true">${esc(shortName(subject))}</p>
    <div class="row" style="justify-content:space-between;align-items:end;gap:18px">
      <div style="display:grid;gap:10px"><h1>${esc(subject.name)}</h1>
        <dl class="facts"><div><dt>Cours</dt><dd>${mine.length}</dd></div><div><dt>Fiches prêtes</dt><dd>${done}</dd></div>${mine.length - done ? `<div><dt>Chez Claude</dt><dd>${mine.length - done}</dd></div>` : ''}${subject.prof ? `<div><dt>Enseignant·e</dt><dd>${esc(subject.prof)}</dd></div>` : ''}</dl></div>
      <div class="cta"><button class="btn ghost" id="edit-subject">${icon('edit')} Modifier</button><a class="btn" href="#/cartes/${encodeURIComponent(subject.id)}">${icon('cards')} Réviser</a><button class="btn primary" id="add">${icon('upload')} Ajouter</button></div>
    </div>
  </header>
  <figure class="subj-ban"><img src="${coverOf(subject)}" alt="" decoding="async"><span class="ai-dot"></span></figure>
  <div class="search" style="margin-bottom:22px;max-width:520px">${icon('search')}<input type="search" id="q" placeholder="Chercher dans ${esc(shortName(subject))}…"></div>
  <div id="body"></div>`
  : `
  <header class="page-head">
    <div><h1>Cours<span class="dot-end">.</span></h1><div class="sub">${subjects.length} matières · ${courses.length} cours · ${courses.filter((c) => c.status === 'done').length} fiches prêtes</div></div>
    <div class="cta"><button class="btn" id="new-subject">${icon('plus')} Matière</button><button class="btn primary" id="add">${icon('upload')} Ajouter des cours</button></div>
  </header>
  <div class="search" style="margin-bottom:28px;max-width:560px">${icon('search')}<input type="search" id="q" placeholder="Rechercher un cours, une notion…"></div>
  <div id="body"></div>`;

  $('#q', el).oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  $('#new-subject', el)?.addEventListener('click', () => editSubject());
  $('#edit-subject', el)?.addEventListener('click', () => editSubject(subject, courses));
  $('#add', el).onclick = () => addCourses(subjects, subject?.id);
  draw();
}

function courseRow(c, i, subjects, showSubject) {
  const s = subjectOf(subjects, c.subjectId);
  return `<a class="citem" style="--c:${s.color}" href="#/c/${encodeURIComponent(c.id)}">
    <span class="n">${String(i + 1).padStart(2, '0')}</span>
    <span><span class="t">${esc(c.title)}</span>${showSubject ? `<span class="small" style="display:block">${esc(s.name)}</span>` : ''}
      <span class="s">${esc(c.summary || (c.status === 'pending' ? 'Claude préparera la fiche, le quiz et les flashcards au prochain passage.' : ''))}</span></span>
    <span class="m">${statusBadge(c)}<span class="badge grey">${esc((c.ext || '').toUpperCase())}</span></span>
  </a>`;
}

export function editSubject(subject = null, courses = []) {
  let color = subject?.color || SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];
  let cover = subject?.cover || '';
  modal({
    title: subject ? 'Modifier la matière' : 'Nouvelle matière',
    body: `<label class="field"><span>Nom</span><input type="text" id="s-name" value="${esc(subject?.name || '')}" placeholder="Ex. Mécanique des solides"></label>
      <label class="field"><span>Nom court <small>(le grand mot en tête de page, ex. RDM)</small></span><input type="text" id="s-short" value="${esc(subject?.short || '')}" maxlength="14"></label>
      <label class="field"><span>UE / module <small>(facultatif)</small></span><input type="text" id="s-ue" value="${esc(subject?.ue || '')}"></label>
      <label class="field"><span>Enseignant·e <small>(facultatif)</small></span><input type="text" id="s-prof" value="${esc(subject?.prof || '')}"></label>
      <div class="field"><span style="font-weight:600;font-size:.88rem">Couleur</span><div class="row" id="s-colors" style="margin-top:6px">${SUBJECT_COLORS.map((c) => `<button class="icon-btn" data-c="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};outline:${c === color ? '3px solid var(--ink)' : 'none'};outline-offset:2px"></button>`).join('')}</div></div>
      <div class="field"><span style="font-weight:600;font-size:15px">Image</span><div class="cover-pick" id="s-cover"><button type="button" data-cv="" class="${cover ? '' : 'on'}" title="Automatique"><img src="${coverOf({ ...(subject || { id: 'x', name: '' }), cover: '' })}" alt="Automatique"></button>${COVERS.map((k) => `<button type="button" data-cv="${k}" class="${cover === k ? 'on' : ''}"><img loading="lazy" src="media/couvertures/${k}.webp" alt="${k}"></button>`).join('')}</div></div>`,
    onOpen: (m) => {
      $('#s-name', m).focus();
      $('#s-colors', m).onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; m.querySelectorAll('[data-c]').forEach((x) => (x.style.outline = x.dataset.c === color ? '3px solid var(--ink)' : 'none')); };
      $('#s-cover', m).onclick = (e) => { const b = e.target.closest('[data-cv]'); if (!b) return; cover = b.dataset.cv; m.querySelectorAll('[data-cv]').forEach((x) => x.classList.toggle('on', x === b)); };
    },
    actions: [
      ...(subject ? [{ label: icon('trash') + ' Supprimer', cls: 'ghost danger', onClick: async () => {
        if (courses.some((c) => c.subjectId === subject.id)) { toast('Déplace ou supprime d’abord les cours de cette matière.', 'error'); return false; }
        if (!(await confirmDialog('Supprimer la matière', `Supprimer « ${esc(subject.name)} » ?`))) return false;
        await store.update(PATHS.subjects, (d) => { d.subjects = d.subjects.filter((s) => s.id !== subject.id); }, `Suppression matière ${subject.name}`);
        location.hash = '#/cours';
      } }] : []),
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, onClick: async (m) => {
        const name = $('#s-name', m).value.trim();
        if (!name) { toast('Donne un nom à la matière', 'error'); return false; }
        const data = { name, short: $('#s-short', m).value.trim(), ue: $('#s-ue', m).value.trim(), prof: $('#s-prof', m).value.trim(), color, cover };
        await store.update(PATHS.subjects, (d) => {
          d.subjects ||= [];
          if (subject) Object.assign(d.subjects.find((s) => s.id === subject.id) || {}, data);
          else d.subjects.push({ id: slug(name) + '-' + Math.random().toString(36).slice(2, 5), ...data });
        }, subject ? `Matière ${name} modifiée` : `Nouvelle matière ${name}`);
        toast('Matière enregistrée', 'ok');
        dispatchEvent(new HashChangeEvent('hashchange'));
      } },
    ],
  });
}

export function addCourses(subjects, presetSubject) {
  if (!subjects.length) { toast('Crée d’abord une matière', 'error'); return editSubject(); }
  let files = [];
  const m = modal({
    title: 'Ajouter des cours', wide: true,
    body: `<label class="field"><span>Matière</span><select id="a-sub">${subjects.map((s) => `<option value="${esc(s.id)}" ${s.id === presetSubject ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <div class="dropzone" id="dz">${icon('upload')}<div><b>Dépose tes fichiers ici</b> ou touche pour choisir</div><div class="small">PDF, PowerPoint, Word, images, texte — plusieurs fichiers possibles</div></div>
      <input type="file" id="a-files" multiple accept="${ACCEPT}" hidden>
      <div id="a-list"></div>
      <label class="field" style="margin-top:14px"><span>Consigne pour Claude <small>(facultatif)</small></span><input type="text" id="a-note" placeholder="Ex. : insiste sur les méthodes de calcul, le contrôle est un QCM"></label>
      <div class="notice violet small" style="margin-top:14px">${icon('sparkle')}<div>Les fichiers sont envoyés dans ton dépôt privé. Claude prépare la fiche, le résumé, le quiz et les flashcards au prochain passage de la tâche planifiée.</div></div>
      <div id="a-prog" class="hidden"><div class="progress"><div style="width:0%"></div></div><div class="small muted" id="a-prog-t" style="margin-top:6px"></div></div>`,
    onOpen: (el) => {
      const dz = $('#dz', el), input = $('#a-files', el);
      const show = () => {
        $('#a-list', el).innerHTML = files.map((f, i) => `<div class="file-chip">${icon('file').replace('<svg', '<svg style="width:18px;height:18px"')}
          <input type="text" data-i="${i}" value="${esc(f.title)}" style="min-height:34px;padding:5px 8px">
          <span class="muted small" style="white-space:nowrap">${fileSize(f.file.size)}</span><button class="icon-btn" data-rm="${i}">${icon('x')}</button></div>`).join('');
      };
      const addFiles = (list) => {
        for (const f of list) {
          if (f.size > MAX) { toast(`${f.name} dépasse 90 Mo`, 'error'); continue; }
          files.push({ file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() });
        }
        show();
      };
      dz.onclick = () => input.click();
      input.onchange = () => { addFiles(input.files); input.value = ''; };
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles(e.dataTransfer.files); };
      $('#a-list', el).oninput = (e) => { const i = e.target.dataset.i; if (i != null) files[i].title = e.target.value; };
      $('#a-list', el).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { files.splice(+b.dataset.rm, 1); show(); } };
    },
    actions: [
      { label: 'Annuler' },
      { label: icon('upload') + ' Envoyer', primary: true, onClick: async (el) => {
        if (!files.length) { toast('Ajoute au moins un fichier', 'error'); return false; }
        const subjectId = $('#a-sub', el).value, note = $('#a-note', el).value.trim();
        $('#a-prog', el).classList.remove('hidden');
        const bar = $('#a-prog .progress > div', el), txt = $('#a-prog-t', el);
        const added = [];
        for (let i = 0; i < files.length; i++) {
          const { file, title } = files[i];
          txt.textContent = `Envoi de « ${file.name} » (${i + 1}/${files.length})…`;
          bar.style.width = `${(i / files.length) * 100}%`;
          const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
          const id = uid() + '-' + slug(title).slice(0, 24);
          const buf = await file.arrayBuffer();
          await store.putBlob(`courses/${id}/source.${ext}`, buf, `Nouveau cours : ${title}`);
          added.push({ id, subjectId, title: title || file.name, fileName: file.name, ext, size: file.size, mime: file.type, addedAt: new Date().toISOString(), status: 'pending', note });
        }
        txt.textContent = 'Mise à jour de l’index…';
        await store.update(PATHS.courses, (d) => { d.courses ||= []; d.courses.push(...added); }, `${added.length} cours ajouté(s)`);
        bar.style.width = '100%';
        toast(`${added.length} cours envoyé(s) — Claude s’en occupe au prochain passage`, 'ok');
        if (added.length === 1) location.hash = `#/c/${encodeURIComponent(added[0].id)}`;
        else dispatchEvent(new HashChangeEvent('hashchange'));
      } },
    ],
  });
  return m;
}
