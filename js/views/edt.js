import { $, esc, icon, toast, modal, fmt, startOfDay, DAY, ymd } from '../ui.js';
import { store, settings, PATHS, uid, getAll } from '../store.js';
import { loadEdt, eventsBetween, resetEdtCache } from '../edt.js';

export async function render(el, [weekParam]) {
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const edt = await loadEdt();
  let monday = mondayOf(weekParam ? new Date(weekParam) : new Date());
  // le week-end, on montre directement la semaine suivante
  if (!weekParam && [0, 6].includes(new Date().getDay())) monday = new Date(+monday + 7 * DAY);
  let view = settings.get('edtView', innerWidth < 760 ? 'list' : 'week');

  const draw = () => {
    const end = new Date(+monday + 7 * DAY);
    const evs = eventsBetween(edt.events, monday, end);
    const hasWeekend = evs.some((e) => [0, 6].includes(e.start.getDay()));
    const nDays = hasWeekend ? 7 : 5;
    el.innerHTML = `
    <div class="page-head">
      <div><h1>Emploi du temps</h1><div class="sub">Semaine du ${esc(fmt.dm(monday))} au ${esc(fmt.dm(new Date(+monday + (nDays - 1) * DAY)))}${edt.updatedAt ? ` · mis à jour ${esc(fmt.rel(edt.updatedAt))}` : ''}</div></div>
      <div class="row">
        <div class="seg"><button data-v="week" class="${view === 'week' ? 'active' : ''}">Semaine</button><button data-v="list" class="${view === 'list' ? 'active' : ''}">Liste</button></div>
        <button class="btn sm" id="prev" aria-label="Semaine précédente">${icon('chevL')}</button>
        <button class="btn sm" id="today">Aujourd’hui</button>
        <button class="btn sm" id="next" aria-label="Semaine suivante">${icon('chevR')}</button>
        ${store.mode === 'github' ? `<button class="btn sm ghost" id="refresh" title="Retélécharger l’EDT">${icon('refresh')}</button>` : ''}
      </div>
    </div>
    ${edt.error ? `<div class="notice">${icon('info')}<div>${esc(edt.error)}</div></div>` : ''}
    ${edt.empty ? `<div class="card empty">${icon('calendar')}<p>Pas encore d’emploi du temps.</p><a class="btn primary" href="#/reglages">Ajouter le lien ICS</a></div>` : `<div id="cal"></div>`}`;
    el.querySelector('.seg').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { view = b.dataset.v; settings.set('edtView', view); draw(); } };
    $('#prev', el).onclick = () => { monday = new Date(+monday - 7 * DAY); draw(); };
    $('#next', el).onclick = () => { monday = new Date(+monday + 7 * DAY); draw(); };
    $('#today', el).onclick = () => { monday = mondayOf(new Date()); draw(); };
    $('#refresh', el)?.addEventListener('click', async () => {
      try { await store.backend.dispatch('edt.yml'); toast('Mise à jour lancée sur GitHub, recharge dans 1 à 2 minutes.'); }
      catch { resetEdtCache(); const fresh = await loadEdt({ force: true }); Object.assign(edt, fresh); draw(); toast('EDT rechargé depuis le dépôt'); }
    });
    if (edt.empty) return;
    const cal = $('#cal', el);
    if (view === 'week') weekGrid(cal, monday, nDays, evs);
    else listView(cal, monday, evs);
    cal.onclick = (e) => { const t = e.target.closest('[data-ev]'); if (t) details(evs[+t.dataset.ev]); };
  };
  draw();

  let tick = setInterval(() => { if (view === 'week') { const nl = el.querySelector('.nowline'); if (nl) draw(); } }, 5 * 60000);
  return { destroy: () => clearInterval(tick) };
}

function mondayOf(d) { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return new Date(+x - wd * DAY); }

function weekGrid(cal, monday, nDays, evs) {
  const HOUR = innerWidth < 700 ? 46 : 56;
  const timed = evs.filter((e) => !e.allDay);
  let h0 = 8, h1 = 18;
  timed.forEach((e) => { h0 = Math.min(h0, e.start.getHours()); h1 = Math.max(h1, e.end.getHours() + (e.end.getMinutes() ? 1 : 0)); });
  const today = ymd(new Date());
  const days = [...Array(nDays)].map((_, i) => new Date(+monday + i * DAY));
  const height = (h1 - h0) * HOUR;
  let html = `<div class="week" style="--days:${nDays};--hour:${HOUR}px"><div class="corner"></div>`;
  days.forEach((d) => { html += `<div class="dh ${ymd(d) === today ? 'today' : ''}">${d.toLocaleDateString('fr-FR', { weekday: 'short' })}<small>${d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'short' })}</small></div>`; });
  html += `<div class="hours" style="height:${height}px">${[...Array(h1 - h0 + 1)].map((_, i) => `<div style="top:${i * HOUR}px">${h0 + i}h</div>`).join('')}</div>`;
  days.forEach((d) => {
    const dayEvs = timed.filter((e) => ymd(e.start) === ymd(d));
    // répartition des cours qui se chevauchent en colonnes
    const cols = [];
    const placed = dayEvs.map((e) => {
      let c = cols.findIndex((end) => end <= e.start);
      if (c === -1) { c = cols.length; cols.push(e.end); } else cols[c] = e.end;
      return { e, c };
    });
    const n = Math.max(1, cols.length);
    html += `<div class="col ${ymd(d) === today ? 'today' : ''}" style="height:${height}px">`;
    placed.forEach(({ e, c }) => {
      const top = ((e.start.getHours() + e.start.getMinutes() / 60) - h0) * HOUR;
      const h = Math.max(22, ((e.end - e.start) / 3600000) * HOUR - 2);
      const idx = evs.indexOf(e);
      html += `<div class="ev" data-ev="${idx}" style="top:${top}px;height:${h}px;left:calc(${(c / n) * 100}% + 2px);width:calc(${100 / n}% - 4px);--evc:${e.cls.color};--evbg:color-mix(in srgb, ${e.cls.color} 16%, var(--surface))">
        <b>${esc(e.title)}</b>${fmt.time(e.start)}–${fmt.time(e.end)}${e.location && h > 50 ? `<br>${esc(e.location)}` : ''}</div>`;
    });
    if (ymd(d) === today) {
      const now = new Date(), y = ((now.getHours() + now.getMinutes() / 60) - h0) * HOUR;
      if (y > 0 && y < height) html += `<div class="nowline" style="top:${y}px"></div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  const allDay = evs.filter((e) => e.allDay);
  if (allDay.length) html += `<div class="card" style="margin-top:12px"><b>Toute la journée :</b> ${allDay.map((e) => `<a href="javascript:void 0" data-ev="${evs.indexOf(e)}">${esc(fmt.short(e.start))} · ${esc(e.title)}</a>`).join(' · ')}</div>`;
  cal.innerHTML = html;
}

function listView(cal, monday, evs) {
  if (!evs.length) { cal.innerHTML = `<div class="card empty">Aucun cours cette semaine.</div>`; return; }
  const groups = {};
  evs.forEach((e, i) => { (groups[ymd(e.start)] ||= []).push(i); });
  const now = new Date();
  cal.innerHTML = Object.entries(groups).map(([day, idx]) => `<div class="day-group"><h3>${esc(fmt.day(day + 'T12:00'))}</h3><div class="card" style="padding:6px 14px">
    ${idx.map((i) => { const e = evs[i]; return `<div class="class-item ${e.start <= now && e.end > now ? 'now' : ''}" data-ev="${i}" style="cursor:pointer">
      <div class="time">${e.allDay ? 'Journée' : `${fmt.time(e.start)}<br><span class="muted small">${fmt.time(e.end)}</span>`}</div>
      <div class="bar" style="background:${e.cls.color}"></div>
      <div class="grow"><div class="title">${esc(e.title)}</div><div class="muted small">${esc(e.location)}${e.cls.label ? ` · ${e.cls.label}` : ''}</div></div></div>`; }).join('')}
  </div></div>`).join('');
}

function details(e) {
  if (!e) return;
  modal({
    title: e.title,
    body: `<p><b>${esc(fmt.day(e.start))}</b>${e.allDay ? '' : ` · ${fmt.time(e.start)} – ${fmt.time(e.end)}`}</p>
      ${e.location ? `<p>${icon('pin').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px"')} ${esc(e.location)}</p>` : ''}
      ${e.cls.label ? `<p><span class="badge" style="background:color-mix(in srgb, ${e.cls.color} 18%, transparent);color:${e.cls.color}">${esc(e.cls.label)}</span></p>` : ''}
      ${e.description ? `<pre style="white-space:pre-wrap;font:inherit;font-size:.9rem" class="muted">${esc(e.description)}</pre>` : ''}`,
    actions: [
      { label: icon('flag') + ' Ajouter à l’agenda', onClick: async () => {
        const { subjects } = await getAll();
        const guess = subjects.find((s) => e.title.toLowerCase().includes(s.name.toLowerCase().slice(0, 8)));
        await store.update(PATHS.agenda, (d) => {
          d.events ||= [];
          const key = e.uid + ymd(e.start);
          if (d.events.some((x) => x.edtUid === key)) return;
          d.events.push({ id: uid('ev-'), title: e.title, type: e.cls.kind === 'exam' ? 'controle' : 'autre', date: ymd(e.start), time: e.allDay ? '' : fmt.time(e.start), subjectId: guess?.id || '', notes: e.location || '', done: false, source: 'edt', edtUid: key });
        }, `Agenda : ${e.title}`);
        toast('Ajouté à l’agenda', 'ok');
      } },
      { label: 'Fermer', primary: true },
    ],
  });
}
