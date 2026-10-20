// Archivio locale (IndexedDB): metadati in "docs", PDF in "files".
const NAME = 'fatture';
const VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Archivio locale non disponibile'));
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(stores, mode);
        let out;
        try {
          out = fn(t);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
        t.onerror = () => reject(t.error || new Error('Errore di archiviazione'));
        t.onabort = () => reject(t.error || new Error('Spazio esaurito o archiviazione annullata'));
      })
  );
}

export const db = {
  all: () => tx('docs', 'readonly', (t) => t.objectStore('docs').getAll()),
  get: (id) => tx('docs', 'readonly', (t) => t.objectStore('docs').get(id)),
  put: (doc) => tx('docs', 'readwrite', (t) => t.objectStore('docs').put(doc)),
  // Salva scheda e PDF nella stessa transazione: o entrambi o nessuno.
  save: (doc, blob) =>
    tx(['docs', 'files'], 'readwrite', (t) => {
      t.objectStore('files').put({ id: doc.id, blob });
      t.objectStore('docs').put(doc);
    }),
  del: (id) =>
    tx(['docs', 'files'], 'readwrite', (t) => {
      t.objectStore('docs').delete(id);
      t.objectStore('files').delete(id);
    }),
  getFile: async (id) => (await tx('files', 'readonly', (t) => t.objectStore('files').get(id)))?.blob || null,
};
