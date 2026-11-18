import { esc, icon, fmt, daysUntil, countdownLabel, countdownCls, ymd, drawCotes, cotedTitle } from '../ui.js';
import { store, settings, getAll, subjectOf, PATHS, coverOf, shortName } from '../store.js';
import { loadEdt, eventsOfDay, upcomingExams } from '../edt.js';
import { dueCards } from './flashcards.js';

export async function render(el) {
  if (!store.ready) return onboarding(el);
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const [{ subjects, courses, events }, edt, progress] = await Promise.all([getAll(), loadEdt(), store.json(PATHS.progress)]);
  const now = new Date();
  const prenom = settings.get('prenom', '') || 'Yann';
  const hello = now.getHours() < 5 || now.getHours() >= 18 ? 'Bonsoir' : 'Bonjour';

  // cours du jour (ou du prochain jour avec cours)
  let todays = eventsOfDay(edt.events, now).filter((e) => !e.allDay);
  let dayLabel = 'Aujourd’hui', dayOffset = 0;
  if (!todays.length || todays.every((e) => e.end < now)) {
    for (let i = 1; i < 8; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const evs = eventsOfDay(edt.events, d).filter((e) => !e.allDay);
      if (evs.length) { todays = evs; dayOffset = i; dayLabel = i === 1 ? 'Demain' : fmt.day(d); break; }
    }
  }
  const left = dayOffset ? todays.length : todays.filter((e) => e.end > now).length;

  const deadlines = events.filter((e) => !e.done && daysUntil(e.date) >= 0).map((e) => ({ ...e, n: daysUntil(e.date) }));
  const known = new Set(deadlines.map((e) => e.edtUid).filter(Boolean));
  upcomingExams(edt.events, 60).forEach((x) => { if (!known.has(x.uid + ymd(x.start))) deadlines.push({ title: x.title, type: 'controle', date: ymd(x.start), time: fmt.time(x.start), n: daysUntil(ymd(x.start)), fromEdt: true }); });
  deadlines.sort((a, b) => a.n - b.n);
  const week = deadlines.filter((d) => d.n <= 7).length;

  const due = dueCards(courses, progress, await cardsIndex(courses)).length;
  const pending = courses.filter((c) => c.status === 'pending').length;
  const ready = courses.filter((c) => c.status === 'done').length;

  const plural = (n, a, b) => `${n} ${n > 1 ? b : a}`;
  const line1 = edt.empty ? 'Ton emploi du temps n’est pas encore branché.' : left ? `${plural(left, 'cours', 'cours')} ${dayOffset ? (dayOffset === 1 ? 'demain' : 'à venir') : 'encore aujourd’hui'}` : 'Plus de cours aujourd’hui';
  const line2 = week ? ` et ${plural(week, 'échéance', 'échéances')} dans les 7 jours.` : ', rien d’urgent cette semaine.';

  el.innerHTML = `
  <section class="hello">
    <div class="hello-text">
      <p class="eyebrow">${esc(cap(fmt.day(now)))}</p>
      ${cotedTitle([hello, prenom])}
      <p class="lead-short">${esc(line1)}<em>${esc(line2)}</em></p>
      <div class="cta"><a class="btn primary" href="#/cartes">${icon('cards')} Réviser ${due ? `${due} cartes` : 'maintenant'}</a><a class="btn" href="#/edt">Emploi du temps</a></div>
    </div>
    <div class="hello-media"><img src="media/couvertures/accueil.webp" alt="" decoding="async"><span class="ai-dot"></span></div>
  </section>

  <div class="figs">
    <a class="fig" href="#/cours"><span class="val">${courses.length}</span><span class="lab">cours dans l’appli</span></a>
    <a class="fig" href="#/cours"><span class="val">${ready}</span><span class="lab">fiches prêtes${pending ? `, ${pending} en préparation par Claude` : ''}</span></a>
    <a class="fig" href="#/agenda"><span class="val">${deadlines.filter((d) => d.n <= 14).length}</span><span class="lab">échéances sous 15 jours</span></a>
    <a class="fig" href="#/cartes"><span class="val">${due}</span><span class="lab">flashcards à revoir</span></a>
  </div>

  <section class="sec two">
    <div>
      <div class="sec-head"><h2>${esc(cap(dayLabel))}</h2><a class="btn sm ghost" href="#/edt">Semaine</a></div>
      ${edt.empty ? `<div class="empty-state"><span class="ghost-word">EDT</span><div><strong>Pas encore d’emploi du temps</strong>Ajoute le lien ICS dans les <a href="#/reglages">réglages</a>.</div></div>` :
        todays.length ? `<div class="list">${todays.map((e) => {
          const isNow = e.start <= now && e.end > now;
          return `<div class="class-item ${isNow ? 'now' : ''}">
            <div class="time">${fmt.time(e.start)}<br><span class="muted">${fmt.time(e.end)}</span></div>
            <div class="bar" style="background:${e.cls.color}"></div>
            <div><div class="title">${esc(e.title)}</div><div class="small">${esc(e.location || '')}${e.cls.label ? ` · ${e.cls.label}` : ''}${isNow ? ' · <b style="color:var(--gold-ink)">en ce moment</b>' : ''}</div></div>
          </div>`;
        }).join('')}</div>` : `<p class="muted">Rien de prévu cette semaine.</p>`}
    </div>
    <div>
      <div class="sec-head"><h2>À venir</h2><a class="btn sm ghost" href="#/agenda">Agenda</a></div>
      ${deadlines.length ? `<div class="list">${deadlines.slice(0, 6).map((d) => `
        <div class="list-item"><div class="countdown ${countdownCls(d.n)}">${countdownLabel(d.n)}</div>
        <div class="grow"><div class="title">${esc(d.title)}</div><div class="small">${esc(fmt.short(d.date + 'T12:00'))}${d.time ? ' · ' + esc(d.time) : ''}${d.subjectId ? ' · ' + esc(subjectOf(subjects, d.subjectId).name) : ''}${d.fromEdt ? ' · détecté dans l’EDT' : ''}</div></div></div>`).join('')}</div>`
        : `<p class="muted">Aucune échéance enregistrée. <a href="#/agenda">En ajouter une</a></p>`}
    </div>
  </section>

  <section class="sec">
    <div class="sec-head"><div><h2>Mes matières</h2><p>${subjects.length} matières, ${courses.length} cours</p></div><a class="btn sm ghost" href="#/cours">Tout voir</a></div>
    <div class="grid cards">${subjects.map((s) => subjectCard(s, courses)).join('')}</div>
  </section>`;
  drawCotes(el.querySelector('.h4-name'));
  const onResize = () => drawCotes(el.querySelector('.h4-name'), false);
  addEventListener('resize', onResize);
  return { destroy: () => removeEventListener('resize', onResize) };
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function subjectCard(s, courses) {
  const cs = courses.filter((c) => c.subjectId === s.id);
  const done = cs.filter((c) => c.status === 'done').length;
  return `<a class="pcard" style="--c:${s.color}" href="#/cours/${encodeURIComponent(s.id)}">
    <span class="pc-pic"><img src="${coverOf(s)}" alt="" loading="lazy" decoding="async"><span class="ai-dot"></span></span>
    <span class="pc-body"><span class="pc-where">${esc(s.ue || shortName(s))}</span><span class="pc-title">${esc(s.name)}</span>
    <span class="pc-sub">${cs.length} cours · ${done} fiche${done > 1 ? 's' : ''} prête${done > 1 ? 's' : ''}</span>
    <span class="pc-bar"><span style="width:${cs.length ? (done / cs.length) * 100 : 0}%"></span></span></span></a>`;
}

export function statusBadge(c) {
  if (c.status === 'done') return `<span class="badge ok">Fiche prête</span>`;
  if (c.status === 'error') return `<span class="badge danger">Erreur</span>`;
  return `<span class="badge y">En attente de Claude</span>`;
}

const studyCache = new Map();
export async function cardsIndex(courses) {
  const out = {};
  await Promise.all(courses.filter((c) => c.status === 'done').map(async (c) => {
    const key = c.id + (c.processedAt || '');
    if (!studyCache.has(key)) {
      studyCache.set(key, store.text(`courses/${c.id}/study.json`).then((t) => (t ? JSON.parse(t) : null)).catch(() => null));
    }
    out[c.id] = await studyCache.get(key);
  }));
  return out;
}

function onboarding(el) {
  el.innerHTML = `
  <section class="hello">
    <div class="hello-text">
      <p class="eyebrow">Arts et Métiers · PGE</p>
      ${cotedTitle(['Mon', 'ENSAM'])}
      <p class="lead-short">Tes cours, tes fiches et tes quiz <em>au même endroit, sur Mac, iPad et iPhone.</em></p>
      <div class="cta"><a class="btn primary" href="#/reglages">${icon('gear')} Brancher mon dépôt</a></div>
    </div>
    <div class="hello-media"><img src="media/couvertures/accueil.webp" alt=""><span class="ai-dot"></span></div>
  </section>
  <section class="sec two">
    <div><div class="sec-head"><h2>Mise en route</h2></div>
      <ol class="steps">
        <li>Sur GitHub, un dépôt <b>privé</b> <span class="kbd">ensam-data</span>.</li>
        <li>Un jeton « fine-grained » limité à ce dépôt : <b>Contents</b> et <b>Actions</b> en lecture/écriture.</li>
        <li>Dans <a href="#/reglages">Réglages</a>, colle le dépôt et le jeton.</li>
        <li>Ajoute le lien ICS de ton emploi du temps.</li>
      </ol></div>
    <div><div class="sec-head"><h2>Juste pour voir</h2></div>
      <p class="muted" style="margin-bottom:16px">Réglages → « Essai local » → « Charger des données d’exemple » pour tout découvrir sans rien configurer.</p>
      <a class="btn" href="#/reglages">Essai local</a></div>
  </section>`;
  drawCotes(el.querySelector('.h4-name'));
}
