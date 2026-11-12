import { $, esc, icon, toast, modal, fileSize, confirmDialog } from '../ui.js';
import { store, getAll, subjectOf, PATHS, uid, slug, SUBJECT_COLORS } from '../store.js';
import { statusBadge } from './home.js';

const ACCEPT = '.pdf,.pptx,.ppt,.docx,.doc,.odt,.odp,.txt,.md,.png,.jpg,.jpeg,.heic,.webp,.xlsx,.csv';
const MAX = 90 * 1024 * 1024;

export async function render(el, [subjectId]) {
  if (!store.ready) { el.innerHTML = `<div class="card empty">Configure d’abord le stockage. <a href="#/reglages">Réglages</a></div>`; return; }
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const { subjects, courses } = await getAll();
  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : null;
  let q = '';

  const draw = () => {
    const filt = (c) => !q || `${c.title} ${c.summary || ''} ${(c.keywords || []).join(' ')} ${c.fileName}`.toLowerCase().includes(q);
    const list = courses.filter((c) => (!subject || c.subjectId === subject.id) && filt(c)).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    const body = $('#body', el);
    if (subject || q) {
      body.innerHTML = list.length ? `<div class="grid cards">${list.map((c) => courseCard(c, subjects)).join('')}</div>`
        : `<div class="card empty">${icon('file')}<p>${q ? 'Aucun cours ne correspond.' : 'Aucun cours dans cette matière pour l’instant.'}</p></div>`;
    } else {
      body.innerHTML = subjects.length ? `<div class="grid cards">${subjects.map((s) => {
        const cs = courses.filter((c) => c.subjectId === s.id);
        const done = cs.filter((c) => c.status === 'done').length;
        return `<a class="card card-link subject-card" style="--c:${s.color}" href="#/cours/${encodeURIComponent(s.id)}">
          <h2 style="margin-bottom:4px">${esc(s.name)}</h2>
          <div class="count">${cs.length} cours · ${done} fiche(s) prête(s)</div>
          ${s.ue ? `<div class="small muted" style="margin-top:6px">${esc(s.ue)}</div>` : ''}
        </a>`;
      }).join('')}</div>
      ${courses.filter((c) => !subjects.find((s) => s.id === c.subjectId)).length ? `<h2 style="margin-top:24px">Sans matière</h2><div class="grid cards">${courses.filter((c) => !subjects.find((s) => s.id === c.subjectId)).map((c) => courseCard(c, subjects)).join('')}</div>` : ''}`
        : `<div class="card empty">${icon('book')}<p>Commence par créer une matière (ex. « Mécanique des solides », « Analyse de la valeur »), puis dépose tes PDF.</p><button class="btn primary" id="first-subject">${icon('plus')} Créer une matière</button></div>`;
      $('#first-subject', el)?.addEventListener('click', () => editSubject());
    }
  };

  el.innerHTML = `
  <div class="page-head">
    <div>${subject ? `<div class="crumbs"><a href="#/cours">Cours</a> /</div>` : ''}
      <h1>${subject ? `<span class="dot" style="background:${subject.color};width:14px;height:14px"></span> ${esc(subject.name)}` : 'Mes cours'}</h1>
      <div class="sub">${subject ? `${courses.filter((c) => c.subjectId === subject.id).length} cours` : `${subjects.length} matière(s) · ${courses.length} cours`}</div></div>
    <div class="row">
      ${subject ? `<button class="btn ghost" id="edit-subject">${icon('edit')} Modifier</button>` : `<button class="btn" id="new-subject">${icon('plus')} Matière</button>`}
      <button class="btn primary" id="add">${icon('upload')} Ajouter des cours</button>
    </div>
  </div>
  <div style="margin-bottom:16px;position:relative"><input type="search" id="q" placeholder="Rechercher un cours, une notion…" style="padding-left:38px"><span style="position:absolute;left:11px;top:10px;color:var(--muted)">${icon('search').replace('<svg', '<svg style="width:18px;height:18px"')}</span></div>
  <div id="body"></div>`;

  $('#q', el).oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  $('#new-subject', el)?.addEventListener('click', () => editSubject());
  $('#edit-subject', el)?.addEventListener('click', () => editSubject(subject, courses));
  $('#add', el).onclick = () => addCourses(subjects, subject?.id);
  draw();
}

function courseCard(c, subjects) {
  const s = subjectOf(subjects, c.subjectId);
  return `<a class="card card-link course-card" href="#/c/${encodeURIComponent(c.id)}" style="border-left:5px solid ${s.color}">
    <div class="small muted">${esc(s.name)}</div>
    <h3 style="margin:0">${esc(c.title)}</h3>
    <div class="summary">${esc(c.summary || (c.status === 'pending' ? 'Claude préparera la fiche, le quiz et les flashcards au prochain passage.' : ''))}</div>
    <div class="meta">${statusBadge(c)}<span class="badge grey">${esc((c.ext || '').toUpperCase())}</span></div>
  </a>`;
}

export function editSubject(subject = null, courses = []) {
  let color = subject?.color || SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];
  modal({
    title: subject ? 'Modifier la matière' : 'Nouvelle matière',
    body: `<label class="field"><span>Nom</span><input type="text" id="s-name" value="${esc(subject?.name || '')}" placeholder="Ex. Mécanique des solides"></label>
      <label class="field"><span>UE / module <small>(facultatif)</small></span><input type="text" id="s-ue" value="${esc(subject?.ue || '')}"></label>
      <label class="field"><span>Enseignant·e <small>(facultatif)</small></span><input type="text" id="s-prof" value="${esc(subject?.prof || '')}"></label>
      <div class="field"><span style="font-weight:600;font-size:.88rem">Couleur</span><div class="row" id="s-colors" style="margin-top:6px">${SUBJECT_COLORS.map((c) => `<button class="icon-btn" data-c="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};outline:${c === color ? '3px solid var(--text)' : 'none'}"></button>`).join('')}</div></div>`,
    onOpen: (m) => {
      $('#s-name', m).focus();
      $('#s-colors', m).onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; m.querySelectorAll('[data-c]').forEach((x) => (x.style.outline = x.dataset.c === color ? '3px solid var(--text)' : 'none')); };
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
        const data = { name, ue: $('#s-ue', m).value.trim(), prof: $('#s-prof', m).value.trim(), color };
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
      <div class="notice violet small">${icon('sparkle')}<div>Les fichiers sont envoyés dans ton dépôt privé. Claude prépare la fiche, le résumé, le quiz et les flashcards au prochain passage de la tâche planifiée.</div></div>
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
