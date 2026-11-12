import { esc, icon, fmt, daysUntil, countdownLabel, countdownCls, ymd } from '../ui.js';
import { store, settings, getAll, subjectOf, PATHS } from '../store.js';
import { loadEdt, eventsOfDay, upcomingExams } from '../edt.js';
import { dueCards } from './flashcards.js';

export async function render(el) {
  if (!store.ready) return onboarding(el);
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  const [{ subjects, courses, events }, edt, progress] = await Promise.all([getAll(), loadEdt(), store.json(PATHS.progress)]);
  const now = new Date();
  const hour = now.getHours();
  const prenom = settings.get('prenom', '');
  const hello = (hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour') + (prenom ? ` ${prenom}` : '');

  // cours du jour (ou du prochain jour avec cours)
  let day = new Date(), todays = eventsOfDay(edt.events, day).filter((e) => !e.allDay);
  let dayLabel = 'Aujourd’hui';
  if (!todays.length || todays.every((e) => e.end < now)) {
    for (let i = 1; i < 8; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const evs = eventsOfDay(edt.events, d).filter((e) => !e.allDay);
      if (evs.length) { day = d; todays = evs; dayLabel = i === 1 ? 'Demain' : fmt.day(d); break; }
    }
  }

  // échéances : agenda + évaluations détectées dans l'EDT
  const deadlines = events.filter((e) => !e.done && daysUntil(e.date) >= 0).map((e) => ({ ...e, n: daysUntil(e.date) }));
  const known = new Set(deadlines.map((e) => e.edtUid).filter(Boolean));
  upcomingExams(edt.events, 60).forEach((x) => { if (!known.has(x.uid + ymd(x.start))) deadlines.push({ title: x.title, type: 'controle', date: ymd(x.start), time: fmt.time(x.start), n: daysUntil(ymd(x.start)), fromEdt: true }); });
  deadlines.sort((a, b) => a.n - b.n);

  const due = dueCards(courses, progress, await cardsIndex(courses)).length;
  const pending = courses.filter((c) => c.status === 'pending').length;
  const recent = [...courses].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 4);

  el.innerHTML = `
  <div class="hero">
    <h1>${esc(hello)} 👋</h1>
    <p>${esc(fmt.day(now))}</p>
    <div class="stats">
      <div class="stat"><b>${courses.length}</b><span>cours</span></div>
      <div class="stat"><b>${deadlines.filter((d) => d.n <= 14).length}</b><span>échéances sous 15 j</span></div>
      <div class="stat"><b>${due}</b><span>cartes à revoir</span></div>
      ${pending ? `<div class="stat"><b>${pending}</b><span>en attente de Claude</span></div>` : ''}
    </div>
  </div>
  <div class="grid cols-2">
    <section class="card">
      <h2>${icon('calendar')} ${esc(dayLabel)}</h2>
      ${edt.empty ? `<div class="empty small">Emploi du temps pas encore configuré. <a href="#/reglages">Ajouter le lien ICS</a></div>` :
        todays.length ? todays.map((e) => {
          const isNow = e.start <= now && e.end > now;
          return `<div class="class-item ${isNow ? 'now' : ''}">
            <div class="time">${fmt.time(e.start)}<br><span class="muted small">${fmt.time(e.end)}</span></div>
            <div class="bar" style="background:${e.cls.color}"></div>
            <div class="grow"><div class="title">${esc(e.title)}</div><div class="muted small">${e.location ? icon('pin', '') .replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"') + ' ' + esc(e.location) : ''}${e.cls.label ? ` · ${e.cls.label}` : ''}</div></div>
          </div>`;
        }).join('') : `<div class="empty small">Rien de prévu cette semaine 🎉</div>`}
      <div class="row" style="margin-top:10px"><a class="btn sm" href="#/edt">Voir la semaine</a></div>
    </section>
    <section class="card">
      <h2>${icon('flag')} À venir</h2>
      ${deadlines.length ? `<div class="list">${deadlines.slice(0, 6).map((d) => `
        <div class="list-item"><div class="countdown ${countdownCls(d.n)}">${countdownLabel(d.n)}</div>
        <div class="grow"><div class="title ellipsis">${esc(d.title)}</div><div class="muted small">${esc(fmt.short(d.date + 'T12:00'))}${d.time ? ' · ' + esc(d.time) : ''}${d.subjectId ? ' · ' + esc(subjectOf(subjects, d.subjectId).name) : ''}${d.fromEdt ? ' · détecté dans l’EDT' : ''}</div></div></div>`).join('')}</div>`
        : `<div class="empty small">Aucune échéance enregistrée.</div>`}
      <div class="row" style="margin-top:10px"><a class="btn sm" href="#/agenda">Ouvrir l’agenda</a></div>
    </section>
    <section class="card">
      <h2>${icon('brain')} Réviser maintenant</h2>
      <p class="muted">${due ? `<b>${due}</b> flashcard(s) à revoir aujourd’hui.` : 'Aucune flashcard en retard. Tu peux lancer un quiz.'}</p>
      <div class="row"><a class="btn primary" href="#/cartes">${icon('cards')} Flashcards</a><a class="btn accent" href="#/revision">${icon('play')} Quiz</a></div>
    </section>
    <section class="card">
      <h2>${icon('book')} Derniers cours</h2>
      ${recent.length ? `<div class="list">${recent.map((c) => {
        const s = subjectOf(subjects, c.subjectId);
        return `<a class="list-item" href="#/c/${encodeURIComponent(c.id)}" style="text-decoration:none;color:inherit"><span class="dot" style="background:${s.color}"></span>
        <div class="grow"><div class="title ellipsis">${esc(c.title)}</div><div class="muted small">${esc(s.name)}</div></div>${statusBadge(c)}</a>`;
      }).join('')}</div>` : `<div class="empty small">Pas encore de cours. <a href="#/cours">Ajouter ton premier PDF</a></div>`}
    </section>
  </div>`;
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
  <div class="hero"><h1>Bienvenue dans Mon ENSAM</h1><p>Ton espace de cours, de révisions et d’organisation, aux couleurs de l’école.</p></div>
  <div class="grid cols-2">
    <section class="card">
      <h2>Mise en route (10 min, une seule fois)</h2>
      <ol class="steps">
        <li>Sur GitHub, crée un dépôt <b>privé</b> nommé <span class="kbd">ensam-data</span> (vide).</li>
        <li>Crée un jeton « fine-grained » limité à ce dépôt, avec les permissions <b>Contents</b>, <b>Actions</b> et <b>Workflows</b> en lecture/écriture.</li>
        <li>Dans <a href="#/reglages">Réglages</a>, colle le dépôt et le jeton, puis clique « Préparer le dépôt ».</li>
        <li>Ajoute le lien ICS de ton emploi du temps.</li>
        <li>Demande à Claude de créer la tâche planifiée qui traite tes cours.</li>
      </ol>
      <a class="btn primary" href="#/reglages">${icon('gear')} Ouvrir les réglages</a>
    </section>
    <section class="card">
      <h2>Juste pour voir ?</h2>
      <p class="muted">Charge des données d’exemple en mode « essai local » pour découvrir les fiches, les quiz, l’EDT et l’agenda sans rien configurer.</p>
      <a class="btn accent" href="#/reglages">Essai local → « Charger des données d’exemple »</a>
    </section>
  </div>`;
}
