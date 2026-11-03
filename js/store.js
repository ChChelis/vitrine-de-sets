// Armazenamento local (IndexedDB). Substitui o banco do artifact do Claude.
// Lojas: sets (uma linha por edição), cards (chave [set,id]), kv (usuário e preferências).
const DB_NAME = 'vitrine-sets', DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('sets', { keyPath: 'code' });
      db.createObjectStore('cards', { keyPath: ['set', 'id'] }).createIndex('set', 'set');
      db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode);
    let out;
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(t.error);
    out = fn(t);
  });
}
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const kv = {
  get: async k => { const db = await open(); return wrap(db.transaction('kv').objectStore('kv').get(k)); },
  set: (k, v) => tx('kv', 'readwrite', t => t.objectStore('kv').put(v, k)),
};

export const sets = {
  all: async () => { const db = await open(); return wrap(db.transaction('sets').objectStore('sets').getAll()); },
  put: s => tx('sets', 'readwrite', t => t.objectStore('sets').put(s)),
};

export const cards = {
  bySet: async code => { const db = await open(); return wrap(db.transaction('cards').objectStore('cards').index('set').getAll(code)); },
  // grava/atualiza; nunca remove cartas
  putMany: list => tx('cards', 'readwrite', t => { const s = t.objectStore('cards'); list.forEach(c => s.put(c)); }),
};

// Pede ao navegador para não despejar os dados quando o espaço apertar.
export async function persist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
