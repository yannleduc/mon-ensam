import { $, esc, icon, toast, modal, fmt, ymd, daysUntil, countdownLabel, countdownCls, parseYmd, confirmDialog, DAY } from '../ui.js';
import { store, getAll, subjectOf, PATHS, uid } from '../store.js';
import { loadEdt, upcomingExams } from '../edt.js';

const TYPES = { controle: 'Contrôle / examen', rendu: 'Rendu', oral: 'Oral / soutenance', autre: 'Autre' };

export async function render(el) {
  if (!store.ready) { el.innerHTML = `<div class="card empty">Configure d’abord le stockage. <a href="#/reglages">Réglages</a></div>`; return; }
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  let { subjects, events } = await getAll();
  const edt = await loadEdt();
  let filter = 'avenir', selDay = null;
  let month = new Date(); month.setDate(1);

  const merged = () => {
    const known = new Set(events.map((e) => e.edtUid).filter(Boolean));
    const fromEdt = upcomingExams(edt.events, 150).filter((x) => !known.has(x.uid + ymd(x.start)))
      .map((x) => ({ id: 'edt:' + x.uid + ymd(x.start), title: x.title, type: 'controle', date: ymd(x.start), time: fmt.time(x.start), notes: x.location, fromEdt: true, raw: x }));
    return [...events, ...fromEdt];
  };

  const draw = () => {
    const all = merged();
    let list = all.filter((e) => {
      const n = daysUntil(e.date);
      if (selDay) return e.date === selDay;
      if (filter === 'avenir') return n >= 0 && !e.done;
      if (filter === 'faits') return e.done || n < 0;
      return true;
    }).sort((a, b) => (filter === 'faits' ? -1 : 1) * ((a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))));

    const groups = [];
    const label = (n) => (n < 0 ? 'Passé' : n <= 6 - ((new Date().getDay() + 6) % 7) ? 'Cette semaine' : n <= 13 ? 'Semaine prochaine' : n <= 31 ? 'Ce mois-ci' : 'Plus tard');
    list.forEach((e) => { const g = selDay ? fmt.day(e.date + 'T12:00') : label(daysUntil(e.date)); let grp = groups.find((x) => x.g === g); if (!grp) groups.push((grp = { g, items: [] })); grp.items.push(e); });

    el.innerHTML = `
    <div class="page-head">
      <div><h1>Agenda</h1><div class="sub">Contrôles, rendus et tout ce qui arrive</div></div>
      <div class="row">
        <button class="btn" id="extract">${icon('sparkle')} Extraire d’un texte</button>
        <button class="btn" id="export" title="Exporter vers Calendrier">${icon('download')} .ics</button>
        <button class="btn primary" id="add">${icon('plus')} Échéance</button>
      </div>
    </div>
    <div class="agenda-layout">
      <div>
        <div class="row" style="margin-bottom:14px">
          <div class="seg" id="filters">${[['avenir', 'À venir'], ['faits', 'Passés / faits'], ['tout', 'Tout']].map(([k, l]) => `<button data-f="${k}" class="${filter === k && !selDay ? 'active' : ''}">${l}</button>`).join('')}</div>
          ${selDay ? `<button class="btn sm ghost" id="clear-day">${icon('x')} ${esc(fmt.dm(selDay + 'T12:00'))}</button>` : ''}
        </div>
        ${groups.length ? groups.map((g) => `<h3 style="margin:16px 0 8px">${esc(g.g)}</h3>${g.items.map(item).join('')}`).join('')
          : `<div class="card empty">${icon('flag')}<p>${filter === 'avenir' && !selDay ? 'Rien à l’horizon. Ajoute tes contrôles et rendus dès que tu les connais.' : 'Rien ici.'}</p></div>`}
      </div>
      <aside class="card">${monthGrid(all)}</aside>
    </div>`;

    $('#filters', el).onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; selDay = null; draw(); } };
    $('#clear-day', el)?.addEventListener('click', () => { selDay = null; draw(); });
    $('#add', el).onclick = () => edit(null);
    $('#export', el).onclick = () => exportIcs(events, subjects);
    $('#extract', el).onclick = extract;
    el.querySelector('.month').onclick = (e) => {
      const d = e.target.closest('[data-d]'); const nav = e.target.closest('[data-m]');
      if (nav) { month = new Date(month.getFullYear(), month.getMonth() + +nav.dataset.m, 1); draw(); }
      else if (d) { selDay = d.dataset.d === selDay ? null : d.dataset.d; draw(); }
    };
    el.querySelectorAll('.ag-item').forEach((row) => {
      const ev = all.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-done]')?.addEventListener('change', async (e) => {
        await save((d) => { const x = d.events.find((y) => y.id === ev.id); if (x) x.done = e.target.checked; }, `${e.target.checked ? 'Fait' : 'À faire'} : ${ev.title}`);
      });
      row.querySelector('[data-edit]')?.addEventListener('click', () => edit(ev));
      row.querySelector('[data-adopt]')?.addEventListener('click', () => edit({ ...ev, id: null, edtUid: ev.raw.uid + ymd(ev.raw.start), source: 'edt' }));
    });
  };

  const item = (e) => {
    const n = daysUntil(e.date);
    const s = e.subjectId ? subjectOf(subjects, e.subjectId) : null;
    return `<div class="ag-item type-${e.type || 'autre'} ${e.done ? 'done' : ''}" data-id="${esc(e.id)}">
      ${e.fromEdt ? '' : `<input type="checkbox" data-done ${e.done ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--violet)" aria-label="Fait">`}
      <div class="countdown ${e.done ? '' : countdownCls(n)}">${countdownLabel(n)}</div>
      <div class="grow">
        <div class="title">${esc(e.title)}</div>
        <div class="small muted">${esc(fmt.short(e.date + 'T12:00'))}${e.time ? ' · ' + esc(e.time) : ''} · ${esc(TYPES[e.type] || 'Autre')}${s ? ` · <span class="dot" style="background:${s.color};width:8px;height:8px"></span> ${esc(s.name)}` : ''}${e.fromEdt ? ' · <span class="badge grey">détecté dans l’EDT</span>' : ''}${e.source === 'claude' ? ' · <span class="badge y">trouvé par Claude, à vérifier</span>' : ''}</div>
        ${e.notes ? `<div class="small" style="margin-top:3px">${esc(e.notes)}</div>` : ''}
      </div>
      ${e.fromEdt ? `<button class="btn sm" data-adopt>${icon('plus')} Suivre</button>` : `<button class="icon-btn" data-edit aria-label="Modifier">${icon('edit')}</button>`}
    </div>`;
  };

  const monthGrid = (all) => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7;
    const start = new Date(+first - offset * DAY);
    const byDay = {};
    all.forEach((e) => { if (!e.done) (byDay[e.date] ||= 0, byDay[e.date]++); });
    const today = ymd(new Date());
    let h = `<div class="row" style="margin-bottom:8px"><button class="icon-btn" data-m="-1">${icon('chevL')}</button><b class="spacer" style="text-align:center;text-transform:capitalize">${month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b><button class="icon-btn" data-m="1">${icon('chevR')}</button></div><div class="month">`;
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d) => (h += `<div class="wd">${d}</div>`));
    for (let i = 0; i < 42; i++) {
      const d = new Date(+start + i * DAY + 3600000), k = ymd(d);
      h += `<div class="d ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === selDay ? 'sel' : ''}" data-d="${k}">${d.getDate()}${byDay[k] ? `<span class="dots">${'<i></i>'.repeat(Math.min(3, byDay[k]))}</span>` : ''}</div>`;
    }
    return h + '</div>';
  };

  const save = async (fn, msg) => {
    try { const d = await store.update(PATHS.agenda, (doc) => { doc.events ||= []; fn(doc); }, msg); events = d.events; draw(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const edit = (ev) => {
    const isNew = !ev?.id;
    modal({
      title: isNew ? 'Nouvelle échéance' : 'Modifier l’échéance',
      body: `<label class="field"><span>Intitulé</span><input type="text" id="e-t" value="${esc(ev?.title || '')}" placeholder="Ex. Rendu CdCF pied prothétique"></label>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <label class="field"><span>Date</span><input type="date" id="e-d" value="${esc(ev?.date || selDay || ymd(new Date(Date.now() + 7 * DAY)))}"></label>
          <label class="field"><span>Heure <small>(facultatif)</small></span><input type="time" id="e-h" value="${esc(ev?.time || '')}"></label>
          <label class="field"><span>Type</span><select id="e-ty">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${ev?.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Matière</span><select id="e-s"><option value="">—</option>${subjects.map((s) => `<option value="${esc(s.id)}" ${ev?.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Notes</span><textarea id="e-n" style="min-height:70px" placeholder="Salle, consignes, documents autorisés…">${esc(ev?.notes || '')}</textarea></label>`,
      actions: [
        ...(!isNew ? [{ label: icon('trash'), cls: 'ghost danger', onClick: async () => {
          if (!(await confirmDialog('Supprimer', `Supprimer « ${esc(ev.title)} » ?`))) return false;
          await save((d) => { d.events = d.events.filter((x) => x.id !== ev.id); }, `Agenda : suppression ${ev.title}`);
        } }] : []),
        { label: 'Annuler' },
        { label: 'Enregistrer', primary: true, onClick: async (m) => {
          const data = { title: $('#e-t', m).value.trim(), date: $('#e-d', m).value, time: $('#e-h', m).value, type: $('#e-ty', m).value, subjectId: $('#e-s', m).value, notes: $('#e-n', m).value.trim() };
          if (!data.title || !data.date) { toast('Intitulé et date obligatoires', 'error'); return false; }
          await save((d) => {
            if (isNew) d.events.push({ id: uid('ev-'), done: false, source: ev?.source || 'manuel', ...(ev?.edtUid ? { edtUid: ev.edtUid } : {}), ...data });
            else { const x = d.events.find((y) => y.id === ev.id); if (x) { Object.assign(x, data); if (x.source === 'claude') x.source = 'verifie'; } }
          }, `Agenda : ${data.title}`);
          toast('Enregistré', 'ok');
        } },
      ],
    });
  };

  const extract = () => modal({
    title: 'Extraire des échéances avec Claude', wide: true,
    body: `<p class="muted small">Colle un mail d’un prof, un planning de projet, une page de syllabus… Claude repère les dates (contrôles, rendus, soutenances) et les ajoute à ton agenda au prochain passage, marquées « à vérifier ».</p>
      <textarea id="x-t" style="min-height:200px" placeholder="Colle le texte ici"></textarea>`,
    actions: [{ label: 'Annuler' }, { label: 'Envoyer à Claude', primary: true, onClick: async (m) => {
      const text = $('#x-t', m).value.trim();
      if (text.length < 15) { toast('Colle un texte un peu plus long', 'error'); return false; }
      await store.update(PATHS.requests, (d) => { d.requests ||= []; d.requests.push({ id: uid('ech-'), type: 'echeances', status: 'pending', createdAt: new Date().toISOString(), params: { texte: text.slice(0, 20000), annee: new Date().getFullYear() } }); }, 'Extraction d’échéances');
      toast('Envoyé — les échéances apparaîtront après le prochain passage de Claude', 'ok');
    } }],
  });

  draw();
}

function exportIcs(events, subjects) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escI = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mon ENSAM//FR', 'X-WR-CALNAME:Échéances ENSAM'];
  events.filter((e) => !e.done).forEach((e) => {
    const d = parseYmd(e.date, e.time || null);
    const sub = e.subjectId ? subjectOf(subjects, e.subjectId).name + ' — ' : '';
    lines.push('BEGIN:VEVENT', `UID:${e.id}@mon-ensam`, `DTSTAMP:${stamp}`);
    if (e.time) {
      const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
      lines.push(`DTSTART:${f(d)}`, `DTEND:${f(new Date(+d + 3600000))}`);
    } else {
      const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${f(d)}`, `DTEND;VALUE=DATE:${f(new Date(+d + DAY))}`);
    }
    lines.push(`SUMMARY:${escI(sub + e.title)}`, `DESCRIPTION:${escI((TYPES[e.type] || '') + (e.notes ? '\n' + e.notes : ''))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', `DESCRIPTION:${escI(e.title)}`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = 'echeances-ensam.ics'; a.click();
  toast('Fichier .ics créé : ouvre-le pour l’ajouter à Calendrier', 'ok');
}
