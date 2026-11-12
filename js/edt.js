// Lecture du fichier ICS de l'emploi du temps (mis à jour par GitHub Actions dans le dépôt de données)
import ICAL from '../vendor/ical.min.js';
import { store, PATHS, settings } from './store.js';
import { idb } from './db.js';
import { DAY, startOfDay } from './ui.js';

const EXAM_RE = /\b(examens?|exam|contr[oô]les?|partiel|ds|cc\d*|soutenance|oral|[ée]valuation|qcm|test|interro(gation)?|rattrapage|jury)\b/i;

export function classify(ev) {
  const s = `${ev.title} ${ev.description || ''}`;
  if (EXAM_RE.test(ev.title)) return { kind: 'exam', label: 'Évaluation', color: '#c0392b' };
  if (/\bTP\b|travaux pratiques/i.test(s)) return { kind: 'tp', label: 'TP', color: '#1b7f8c' };
  if (/\bTD\b|travaux dirig/i.test(s)) return { kind: 'td', label: 'TD', color: '#FFA300' };
  if (/\bCM\b|cours magistral|amphi/i.test(s)) return { kind: 'cm', label: 'CM', color: '#80276C' };
  if (/projet|pjt|bureau d.?[ée]tudes|\bBE\b/i.test(s)) return { kind: 'projet', label: 'Projet', color: '#2e6bb5' };
  return { kind: 'autre', label: '', color: '#6a4bb3' };
}

let parsed = null; // { events, fetchedAt }

export function parseICS(text) {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch {}
  }
  const vevents = comp.getAllSubcomponents('vevent');
  const exceptions = vevents.filter((v) => v.hasProperty('recurrence-id'));
  const rangeStart = ICAL.Time.fromJSDate(new Date(Date.now() - 120 * DAY), true);
  const rangeEnd = ICAL.Time.fromJSDate(new Date(Date.now() + 300 * DAY), true);
  const out = [];
  const push = (ev, start, end) => {
    const e = {
      uid: ev.uid, title: (ev.summary || 'Sans titre').trim(), location: (ev.location || '').trim(),
      description: (ev.description || '').trim(), start: start.toJSDate(), end: end.toJSDate(),
      allDay: start.isDate,
    };
    e.cls = classify(e);
    out.push(e);
  };
  for (const v of vevents) {
    if (v.hasProperty('recurrence-id')) continue;
    const ev = new ICAL.Event(v, { exceptions: exceptions.filter((x) => x.getFirstPropertyValue('uid') === v.getFirstPropertyValue('uid')) });
    if (v.getFirstPropertyValue('status') === 'CANCELLED') continue;
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let next, guard = 0;
      while ((next = it.next()) && next.compare(rangeEnd) < 0 && guard++ < 2000) {
        if (next.compare(rangeStart) < 0) continue;
        const d = ev.getOccurrenceDetails(next);
        push(d.item, d.startDate, d.endDate);
      }
    } else if (ev.startDate) {
      push(ev, ev.startDate, ev.endDate || ev.startDate);
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** Charge l'EDT : dépôt GitHub (fichier mis à jour par l'Action), sinon import manuel local. */
export async function loadEdt({ force = false } = {}) {
  if (parsed && !force) return parsed;
  let text = null, updatedAt = null;
  if (store.ready) {
    try {
      text = await store.text(PATHS.ics);
      if (store.mode === 'github' && force) {
        const c = await store.backend.lastCommit(PATHS.ics).catch(() => null);
        if (c) updatedAt = c.commit.committer.date;
      }
    } catch (e) { console.warn(e); }
  }
  if (!text) text = await idb.get('edt:manual');
  if (!text) { parsed = { events: [], updatedAt: null, empty: true }; return parsed; }
  try {
    parsed = { events: parseICS(text), updatedAt: updatedAt || settings.get('edtUpdatedAt', null), empty: false };
    if (updatedAt) settings.set('edtUpdatedAt', updatedAt);
  } catch (e) {
    parsed = { events: [], updatedAt: null, empty: true, error: 'Fichier ICS illisible : ' + e.message };
  }
  return parsed;
}
export function resetEdtCache() { parsed = null; }

export function eventsBetween(events, from, to) { return events.filter((e) => e.end > from && e.start < to); }
export function eventsOfDay(events, d) { const s = startOfDay(d); return eventsBetween(events, s, new Date(+s + DAY)); }
export function upcomingExams(events, days = 120) {
  const now = new Date();
  return events.filter((e) => e.cls.kind === 'exam' && e.end > now && e.start < new Date(Date.now() + days * DAY));
}
