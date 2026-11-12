// Accès au dépôt GitHub privé qui contient toutes les données (API REST "contents")
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
  get conflict() { return this.status === 409 || this.status === 422; }
}

function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }

export function bytesToB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
}
export function b64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export class GitHub {
  constructor({ token, repo, branch = 'main' }) {
    this.token = token.trim();
    this.repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    this.branch = (branch || 'main').trim();
    this.shas = new Map();
  }

  headers(accept = 'application/vnd.github+json') {
    return { Authorization: `Bearer ${this.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
  }

  async req(url, opts = {}) {
    const r = await fetch(url.startsWith('http') ? url : API + url, { cache: 'no-store', ...opts, headers: { ...this.headers(opts.accept), ...(opts.headers || {}) } });
    if (!r.ok && r.status !== 404) {
      let msg = `GitHub ${r.status}`;
      try { const j = await r.json(); if (j.message) msg += ` : ${j.message}`; } catch {}
      if (r.status === 401) msg = 'Jeton GitHub invalide ou expiré (Réglages).';
      if (r.status === 403 && /rate limit/i.test(msg)) msg = 'Limite d’appels GitHub atteinte, réessaie dans quelques minutes.';
      throw new GitHubError(msg, r.status);
    }
    return r;
  }

  contentsUrl(path) { return `/repos/${this.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`; }

  /** Texte d'un fichier (null si absent). Mémorise le sha pour l'écriture suivante. */
  async readText(path) {
    const r = await this.req(this.contentsUrl(path));
    if (r.status === 404) { this.shas.delete(path); return null; }
    const j = await r.json();
    if (Array.isArray(j)) throw new GitHubError(`${path} est un dossier`, 400);
    this.shas.set(path, j.sha);
    if (j.encoding === 'base64' && j.content) return new TextDecoder().decode(b64ToBytes(j.content));
    const buf = await this.readRaw(path);
    return buf ? new TextDecoder().decode(buf) : null;
  }

  /** Contenu brut (ArrayBuffer) — jusqu'à 100 Mo. */
  async readRaw(path) {
    const r = await this.req(this.contentsUrl(path), { accept: 'application/vnd.github.raw' });
    if (r.status === 404) return null;
    return await r.arrayBuffer();
  }

  async write(path, content, message) {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const body = { message, content: bytesToB64(bytes), branch: this.branch };
    const sha = this.shas.get(path);
    if (sha) body.sha = sha;
    const r = await this.req(`/repos/${this.repo}/contents/${encodePath(path)}`, {
      method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    });
    if (r.status === 404) throw new GitHubError('Dépôt introuvable ou jeton sans accès en écriture.', 404);
    const j = await r.json();
    this.shas.set(path, j.content.sha);
    return j;
  }

  async remove(path, message) {
    let sha = this.shas.get(path);
    if (!sha) {
      const r = await this.req(this.contentsUrl(path));
      if (r.status === 404) return;
      sha = (await r.json()).sha;
    }
    await this.req(`/repos/${this.repo}/contents/${encodePath(path)}`, {
      method: 'DELETE', body: JSON.stringify({ message, sha, branch: this.branch }), headers: { 'Content-Type': 'application/json' },
    });
    this.shas.delete(path);
  }

  async repoInfo() {
    const r = await this.req(`/repos/${this.repo}`);
    if (r.status === 404) throw new GitHubError(`Dépôt « ${this.repo} » introuvable (ou jeton sans accès).`, 404);
    return r.json();
  }

  async lastCommit(path) {
    const r = await this.req(`/repos/${this.repo}/commits?path=${encodeURIComponent(path)}&per_page=1&sha=${encodeURIComponent(this.branch)}`);
    if (r.status === 404) return null;
    const j = await r.json();
    return j[0] || null;
  }

  async dispatch(workflowFile) {
    await this.req(`/repos/${this.repo}/actions/workflows/${workflowFile}/dispatches`, {
      method: 'POST', body: JSON.stringify({ ref: this.branch }), headers: { 'Content-Type': 'application/json' },
    });
  }
}
