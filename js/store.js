// Couche de données : dépôt GitHub (synchro Mac/iPad) ou essai local, avec cache hors-ligne
import { GitHub, GitHubError } from './github.js';
import { idb } from './db.js';

export const settings = {
  get(k, d = '') { try { const v = localStorage.getItem('ensam.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem('ensam.' + k, JSON.stringify(v)); },
};

/* Stockage local (essai, un seul appareil) — même interface que GitHub */
class LocalBackend {
  constructor() { this.repo = 'local'; this.shas = new Map(); }
  async readText(p) { const v = await idb.get('local:' + p); return v == null ? null : (typeof v === 'string' ? v : new TextDecoder().decode(v)); }
  async readRaw(p) { const v = await idb.get('local:' + p); return v == null ? null : (typeof v === 'string' ? new TextEncoder().encode(v).buffer : v); }
  async write(p, content) { await idb.set('local:' + p, content); }
  async remove(p) { await idb.del('local:' + p); }
  async repoInfo() { return { private: true, full_name: 'local' }; }
  async lastCommit() { return null; }
  async dispatch() { throw new Error('Disponible seulement avec GitHub'); }
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(path) { listeners.forEach((fn) => { try { fn(path); } catch (e) { console.error(e); } }); }

export const PATHS = {
  subjects: 'meta/subjects.json',
  courses: 'meta/courses.json',
  agenda: 'meta/agenda.json',
  progress: 'meta/progress.json',
  requests: 'meta/requests.json',
  edtConfig: 'config/edt.json',
  profile: 'config/profil.json',
  ics: 'edt.ics',
};
export const DEFAULTS = {
  [PATHS.subjects]: { subjects: [] },
  [PATHS.courses]: { courses: [] },
  [PATHS.agenda]: { events: [] },
  [PATHS.progress]: { cards: {}, questions: {}, sessions: [] },
  [PATHS.requests]: { requests: [] },
};

export const store = {
  backend: null,
  mode: 'none', // 'github' | 'local' | 'none'
  mem: {},
  online: navigator.onLine,

  init() {
    const mode = settings.get('mode', 'none');
    this.mem = {};
    if (mode === 'github') {
      const token = settings.get('ghToken'), repo = settings.get('ghRepo');
      if (token && repo) { this.backend = new GitHub({ token, repo, branch: settings.get('ghBranch', 'main') }); this.mode = 'github'; return; }
    }
    if (mode === 'local') { this.backend = new LocalBackend(); this.mode = 'local'; return; }
    this.backend = null; this.mode = 'none';
  },
  get ready() { return !!this.backend; },
  get repo() { return this.backend?.repo; },

  ckey(p) { return `cache:${this.mode}:${this.backend?.repo}:${p}`; },

  /** JSON avec repli sur le cache hors-ligne. `fresh=false` renvoie la copie mémoire si elle existe. */
  async json(path, { fresh = false } = {}) {
    if (!fresh && this.mem[path]) return this.mem[path];
    const fallback = structuredClone(DEFAULTS[path] ?? {});
    if (!this.backend) return fallback;
    let val;
    try {
      const txt = await this.backend.readText(path);
      val = txt ? JSON.parse(txt) : fallback;
      idb.set(this.ckey(path), val);
      this.online = true;
    } catch (e) {
      if (e instanceof GitHubError && e.status !== 0 && navigator.onLine) throw e;
      const cached = await idb.get(this.ckey(path));
      if (cached === undefined) throw e;
      val = cached; this.online = false;
    }
    this.mem[path] = val;
    return val;
  },

  /** Lecture–modification–écriture avec nouvelle tentative si un autre appareil (ou Claude) a écrit entre-temps. */
  async update(path, fn, message) {
    if (!this.backend) throw new Error('Configure d’abord le stockage dans Réglages.');
    let lastErr;
    for (let i = 0; i < 4; i++) {
      const txt = await this.backend.readText(path);
      const cur = txt ? JSON.parse(txt) : structuredClone(DEFAULTS[path] ?? {});
      const next = (await fn(cur)) ?? cur;
      try {
        await this.backend.write(path, JSON.stringify(next, null, 2) + '\n', message || `Mise à jour ${path}`);
        this.mem[path] = next;
        idb.set(this.ckey(path), next);
        emit(path);
        return next;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof GitHubError && e.conflict)) throw e;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr;
  },

  async text(path) {
    if (!this.backend) return null;
    try {
      const t = await this.backend.readText(path);
      if (t != null) idb.set(this.ckey(path), t);
      return t;
    } catch (e) {
      const c = await idb.get(this.ckey(path));
      if (c !== undefined) return c;
      throw e;
    }
  },

  async putText(path, text, message) { await this.backend.write(path, text, message); idb.set(this.ckey(path), text); emit(path); },

  /** Fichiers sources : immuables, donc cache d'abord. */
  async blob(path) {
    const c = await idb.get(this.ckey(path));
    if (c) return c;
    const buf = await this.backend.readRaw(path);
    if (buf) idb.set(this.ckey(path), buf);
    return buf;
  },

  async putBlob(path, buf, message) { await this.backend.write(path, new Uint8Array(buf), message); idb.set(this.ckey(path), buf); },

  async remove(path, message) {
    try { await this.backend.remove(path, message || `Suppression ${path}`); } catch (e) { if (e.status !== 404) throw e; }
    idb.del(this.ckey(path));
  },

  invalidate() { this.mem = {}; },
};

/* ---------- helpers métier ---------- */
export function uid(prefix = '') {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return prefix + ymd + '-' + Math.random().toString(36).slice(2, 7);
}
export function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cours';
}
export function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export const SUBJECT_COLORS = ['#80276C', '#FFA300', '#1b7f8c', '#c0392b', '#2e6bb5', '#5b8c2a', '#8e5a2e', '#6a4bb3', '#d4577f', '#3a3a3a'];

export async function getAll() {
  const [subjects, courses, agenda] = await Promise.all([store.json(PATHS.subjects), store.json(PATHS.courses), store.json(PATHS.agenda)]);
  return { subjects: subjects.subjects || [], courses: courses.courses || [], events: agenda.events || [] };
}
export function subjectOf(subjects, id) { return subjects.find((s) => s.id === id) || { id: '', name: 'Sans matière', color: '#999' }; }

/* Progression : écrite par lots pour ne pas créer un commit par flashcard */
let progressQueue = [];
let progressTimer = null;
export function queueProgress(mutator) {
  progressQueue.push(mutator);
  const p = store.mem[PATHS.progress];
  if (p) { mutator(p); emit(PATHS.progress); }
  clearTimeout(progressTimer);
  progressTimer = setTimeout(flushProgress, 8000);
}
export async function flushProgress() {
  clearTimeout(progressTimer);
  if (!progressQueue.length || !store.ready) return;
  const batch = progressQueue; progressQueue = [];
  try {
    await store.update(PATHS.progress, (cur) => { cur.cards ||= {}; cur.questions ||= {}; cur.sessions ||= []; batch.forEach((m) => m(cur)); cur.sessions = cur.sessions.slice(-300); }, 'Progression des révisions');
  } catch (e) {
    progressQueue = batch.concat(progressQueue);
    console.warn('progression non enregistrée', e);
  }
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushProgress(); });
addEventListener('pagehide', () => flushProgress());
