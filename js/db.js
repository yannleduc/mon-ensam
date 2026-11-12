// Petit cache clé/valeur dans IndexedDB (lecture hors-ligne, fichiers déjà téléchargés)
const DB_NAME = 'mon-ensam';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', mode);
    const store = t.objectStore('kv');
    const r = fn(store);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const idb = {
  get: (k) => tx('readonly', (s) => s.get(k)).catch(() => undefined),
  set: (k, v) => tx('readwrite', (s) => s.put(v, k)).catch(() => {}),
  del: (k) => tx('readwrite', (s) => s.delete(k)).catch(() => {}),
  clear: () => tx('readwrite', (s) => s.clear()).catch(() => {}),
};
