import { $, esc, icon, toast, confirmDialog } from '../ui.js';
import { store, settings, PATHS, DEFAULTS } from '../store.js';
import { GitHub } from '../github.js';
import { idb } from '../db.js';
import { resetEdtCache, parseICS } from '../edt.js';
import { seedDemo } from '../demo.js';

const TEMPLATE_FILES = [
  ['PROCESSING.md', 'data-template/PROCESSING.md'],
  ['README.md', 'data-template/README.md'],
  ['tools/ensam.py', 'data-template/tools/ensam.py'],
  ['.github/workflows/edt.yml', 'data-template/workflows/edt.yml'],
];

export async function render(el) {
  const mode = settings.get('mode', 'none');
  el.innerHTML = `
  <div class="page-head"><div><h1>Réglages</h1><div class="sub">Stockage, emploi du temps, profil et apparence</div></div></div>
  <div class="grid cols-2">
    <section class="card">
      <h2>${icon('cloud')} Stockage et synchro</h2>
      <p class="muted small">Tes cours, fiches et ton agenda vivent dans un dépôt GitHub <b>privé</b>. C’est ce qui permet la synchro Mac ↔ iPad et le traitement automatique par Claude.</p>
      <div class="seg" id="mode-seg" style="margin-bottom:14px">
        <button data-m="github">Dépôt GitHub</button><button data-m="local">Essai local</button>
      </div>
      <div id="gh-fields">
        <label class="field"><span>Dépôt de données <small>(ex. yann/ensam-data)</small></span><input type="text" id="gh-repo" placeholder="utilisateur/ensam-data" value="${esc(settings.get('ghRepo'))}" autocapitalize="off" autocorrect="off"></label>
        <label class="field"><span>Jeton d’accès GitHub <small>(fine-grained, limité à ce dépôt)</small></span><input type="password" id="gh-token" placeholder="github_pat_…" value="${esc(settings.get('ghToken'))}" autocomplete="off"></label>
        <label class="field"><span>Branche</span><input type="text" id="gh-branch" value="${esc(settings.get('ghBranch', 'main'))}"></label>
      </div>
      <div id="local-fields" class="notice violet hidden">${icon('info')}<div class="small">Tout reste dans ce navigateur : pas de synchro et pas de traitement par Claude. Pratique pour découvrir l’appli. <button class="btn sm" id="demo">Charger des données d’exemple</button></div></div>
      <div class="row"><button class="btn primary" id="save-store">${icon('check')} Enregistrer</button><button class="btn" id="test">Tester</button><button class="btn" id="init">Préparer le dépôt</button></div>
      <div id="store-msg" class="small" style="margin-top:10px"></div>
    </section>

    <section class="card">
      <h2>${icon('calendar')} Emploi du temps</h2>
      <p class="muted small">Colle le lien ICS de ton emploi du temps. Une GitHub Action le télécharge toutes les 2 heures dans ton dépôt (gratuit) : l’appli l’affiche ensuite partout, même hors-ligne.</p>
      <label class="field"><span>Lien ICS</span><input type="url" id="ics" placeholder="https://…/calendar.ics" autocapitalize="off"></label>
      <div class="row"><button class="btn primary" id="save-ics">Enregistrer et mettre à jour</button><label class="btn">${icon('upload')} Importer un .ics<input type="file" id="ics-file" accept=".ics,text/calendar" hidden></label></div>
      <div id="ics-msg" class="small" style="margin-top:10px"></div>
    </section>

    <section class="card">
      <h2>${icon('sparkle')} Traitement par Claude</h2>
      <p class="small">Pas de clé API ni de frais en plus : une <b>tâche planifiée Claude</b> (ton abonnement) passe régulièrement sur le dépôt, traite les cours « en attente » et les demandes (nouveaux quiz, questions, échéances). Les consignes qu’elle suit sont dans <span class="kbd">PROCESSING.md</span> du dépôt.</p>
      <div id="queue" class="small muted">…</div>
      <details style="margin-top:12px"><summary class="small"><b>Consigne de la tâche planifiée</b> (si tu dois la recréer)</summary>
        <textarea id="task-prompt" readonly style="margin-top:8px;min-height:150px;font-size:.82rem"></textarea>
        <button class="btn sm" id="copy-prompt" style="margin-top:6px">Copier</button>
      </details>
    </section>

    <section class="card">
      <h2>${icon('edit')} Profil</h2>
      <p class="muted small">Utilisé par Claude pour adapter le niveau et le ton des fiches.</p>
      <label class="field"><span>Prénom</span><input type="text" id="p-name"></label>
      <label class="field"><span>Formation</span><input type="text" id="p-form" placeholder="PGE 1re année, apprentissage"></label>
      <label class="field"><span>Préférences pour les fiches <small>(facultatif)</small></span><textarea id="p-pref" placeholder="Ex. : beaucoup d’exemples chiffrés, rappeler les unités, schémas décrits en texte…"></textarea></label>
      <button class="btn primary" id="save-profile">Enregistrer le profil</button>
    </section>

    <section class="card">
      <h2>${icon('gear')} Apparence et données</h2>
      <label class="field"><span>Thème</span>
        <select id="theme"><option value="auto">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select></label>
      <div class="row"><button class="btn" id="clear-cache">Vider le cache de cet appareil</button></div>
      <p class="small muted" style="margin-top:12px">Appli installable : sur iPad, Safari → Partager → « Sur l’écran d’accueil ». Sur Mac, Safari → Fichier → « Ajouter au Dock ».</p>
    </section>
  </div>`;

  // --- mode
  const seg = $('#mode-seg', el);
  let curMode = mode === 'none' ? 'github' : mode;
  const showMode = () => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.m === curMode));
    $('#gh-fields', el).classList.toggle('hidden', curMode !== 'github');
    $('#local-fields', el).classList.toggle('hidden', curMode !== 'local');
    $('#test', el).classList.toggle('hidden', curMode !== 'github');
  };
  seg.onclick = (e) => { const b = e.target.closest('button'); if (b) { curMode = b.dataset.m; showMode(); } };
  showMode();

  const msg = (sel, html, err) => { const m = $(sel, el); m.innerHTML = html; m.style.color = err ? 'var(--danger)' : ''; };
  const readGh = () => ({ repo: $('#gh-repo', el).value.trim(), token: $('#gh-token', el).value.trim(), branch: $('#gh-branch', el).value.trim() || 'main' });

  const save = () => {
    settings.set('mode', curMode);
    if (curMode === 'github') { const g = readGh(); settings.set('ghRepo', g.repo); settings.set('ghToken', g.token); settings.set('ghBranch', g.branch); }
    dispatchEvent(new Event('ensam:settings'));
    resetEdtCache();
  };

  $('#test', el).onclick = async () => {
    const g = readGh();
    if (!g.repo || !g.token) return msg('#store-msg', 'Renseigne le dépôt et le jeton.', true);
    msg('#store-msg', '<span class="spinner"></span> Test…');
    try {
      const gh = new GitHub(g);
      const info = await gh.repoInfo();
      const canPush = info.permissions?.push;
      msg('#store-msg', `✅ Connecté à <b>${esc(info.full_name)}</b> — ${info.private ? 'privé' : '<b style="color:var(--danger)">PUBLIC : passe-le en privé !</b>'}${canPush === false ? ' · ⚠️ pas de droit d’écriture' : ''}`);
    } catch (e) { msg('#store-msg', e.message, true); }
  };

  $('#save-store', el).onclick = () => { save(); toast('Réglages enregistrés', 'ok'); loadRemote(); };

  $('#init', el).onclick = async () => {
    save();
    if (!store.ready) return msg('#store-msg', 'Configure d’abord le stockage.', true);
    msg('#store-msg', '<span class="spinner"></span> Préparation du dépôt…');
    const done = [], skipped = [], failed = [];
    try {
      for (const [path, def] of Object.entries(DEFAULTS)) {
        if (await store.backend.readText(path) == null) { await store.backend.write(path, JSON.stringify(def, null, 2) + '\n', `Initialisation ${path}`); done.push(path); } else skipped.push(path);
      }
      for (const [path, init] of [[PATHS.edtConfig, { icsUrl: '' }], [PATHS.profile, { prenom: '', formation: 'PGE Arts et Métiers, 1re année (apprentissage)', preferences: '' }]]) {
        if (await store.backend.readText(path) == null) { await store.backend.write(path, JSON.stringify(init, null, 2) + '\n', `Initialisation ${path}`); done.push(path); } else skipped.push(path);
      }
      if (store.mode === 'github') {
        for (const [path, src] of TEMPLATE_FILES) {
          const txt = await (await fetch(src, { cache: 'no-store' })).text();
          const existing = await store.backend.readText(path).catch(() => null);
          if (existing === txt) { skipped.push(path); continue; }
          try { await store.backend.write(path, txt, existing == null ? `Ajout ${path}` : `Mise à jour ${path}`); done.push(path); }
          catch (e) { failed.push(`${path} (${e.status === 404 || e.status === 403 ? 'le jeton doit avoir la permission « Workflows : lecture/écriture »' : e.message})`); }
        }
      }
      store.invalidate();
      msg('#store-msg', `✅ Dépôt prêt. ${done.length} fichier(s) créé(s) ou mis à jour, ${skipped.length} déjà en place.${failed.length ? '<br>⚠️ ' + failed.map(esc).join('<br>⚠️ ') : ''}`, failed.length > 0);
    } catch (e) { msg('#store-msg', e.message, true); }
  };

  $('#demo', el).onclick = async () => {
    curMode = 'local'; save();
    await seedDemo();
    store.invalidate(); resetEdtCache();
    toast('Données d’exemple chargées', 'ok');
    location.hash = '#/';
  };

  // --- EDT
  $('#save-ics', el).onclick = async () => {
    const url = $('#ics', el).value.trim();
    if (!/^https?:\/\//.test(url)) return msg('#ics-msg', 'Lien invalide (il doit commencer par https://).', true);
    if (!store.ready) return msg('#ics-msg', 'Configure d’abord le stockage.', true);
    msg('#ics-msg', '<span class="spinner"></span> Enregistrement…');
    try {
      await store.update(PATHS.edtConfig, (c) => { c.icsUrl = url; return c; }, 'Lien de l’emploi du temps');
      if (store.mode === 'github') {
        try { await store.backend.dispatch('edt.yml'); msg('#ics-msg', '✅ Enregistré. Téléchargement lancé sur GitHub : l’EDT apparaît d’ici 1 à 2 minutes.'); }
        catch { msg('#ics-msg', '✅ Enregistré. Il sera téléchargé au prochain passage automatique (ou clique « Préparer le dépôt » si l’Action n’existe pas encore).'); }
      } else {
        try {
          const r = await fetch(url); const t = await r.text(); parseICS(t);
          await idb.set('edt:manual', t); resetEdtCache();
          msg('#ics-msg', '✅ EDT téléchargé directement.');
        } catch { msg('#ics-msg', 'Le serveur de l’école bloque le téléchargement direct depuis le navigateur : importe le fichier .ics à la main, ou passe en mode GitHub.', true); }
      }
    } catch (e) { msg('#ics-msg', e.message, true); }
  };
  $('#ics-file', el).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const t = await f.text();
    try { const evs = parseICS(t); await idb.set('edt:manual', t); if (store.ready) await store.putText(PATHS.ics, t, 'Import manuel de l’EDT').catch(() => {}); resetEdtCache(); msg('#ics-msg', `✅ ${evs.length} créneaux importés.`); }
    catch (err) { msg('#ics-msg', 'Fichier ICS illisible : ' + err.message, true); }
  };

  // --- profil, thème
  $('#theme', el).value = settings.get('theme', 'auto');
  $('#theme', el).onchange = (e) => { settings.set('theme', e.target.value); dispatchEvent(new Event('ensam:settings')); };
  $('#save-profile', el).onclick = async () => {
    try {
      await store.update(PATHS.profile, (p) => ({ ...p, prenom: $('#p-name', el).value.trim(), formation: $('#p-form', el).value.trim(), preferences: $('#p-pref', el).value.trim() }), 'Profil');
      settings.set('prenom', $('#p-name', el).value.trim());
      toast('Profil enregistré', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#clear-cache', el).onclick = async () => {
    if (!(await confirmDialog('Vider le cache', 'Les fichiers téléchargés sur cet appareil seront supprimés (rien n’est effacé sur GitHub). En mode essai local, cela efface tes données.'))) return;
    await idb.clear(); store.invalidate(); resetEdtCache(); toast('Cache vidé', 'ok');
  };

  const repo = settings.get('ghRepo') || 'utilisateur/ensam-data';
  $('#task-prompt', el).value = taskPrompt(repo);
  $('#copy-prompt', el).onclick = () => { navigator.clipboard.writeText($('#task-prompt', el).value); toast('Copié', 'ok'); };

  async function loadRemote() {
    if (!store.ready) { $('#queue', el).textContent = 'Stockage non configuré.'; return; }
    try {
      const [edt, prof, courses, reqs] = await Promise.all([
        store.json(PATHS.edtConfig, { fresh: true }).catch(() => ({})),
        store.json(PATHS.profile, { fresh: true }).catch(() => ({})),
        store.json(PATHS.courses, { fresh: true }),
        store.json(PATHS.requests, { fresh: true }),
      ]);
      $('#ics', el).value = edt.icsUrl || '';
      $('#p-name', el).value = prof.prenom || settings.get('prenom', '');
      $('#p-form', el).value = prof.formation || '';
      $('#p-pref', el).value = prof.preferences || '';
      const pc = (courses.courses || []).filter((c) => c.status === 'pending').length;
      const pr = (reqs.requests || []).filter((r) => r.status === 'pending').length;
      const last = (courses.courses || []).map((c) => c.processedAt).filter(Boolean).sort().pop();
      $('#queue', el).innerHTML = `En attente : <b>${pc}</b> cours, <b>${pr}</b> demande(s).${last ? ` Dernier traitement ${esc(new Date(last).toLocaleString('fr-FR'))}.` : ''}`;
    } catch (e) { $('#queue', el).textContent = e.message; }
  }
  loadRemote();
}

export function taskPrompt(repo) {
  return `Tâche « Mon ENSAM — traitement des cours ».
1. Ajoute le dépôt GitHub ${repo} à la session avec un accès en écriture (push), puis clone-le.
2. Lis le fichier PROCESSING.md à la racine du dépôt et applique-le à la lettre.
3. Lance d'abord « python3 tools/ensam.py pending » : s'il n'y a ni cours ni demande en attente, arrête-toi immédiatement sans rien modifier.
Ne supprime jamais de fichier existant et ne touche pas aux réglages du dépôt.`;
}
