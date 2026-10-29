// Tiny IndexedDB queue for receipts captured offline: the photo and the form fields wait here until there is a connection.
const DB = "receipt-vault-queue", STORE = "pending";

const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const request = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(request.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const enqueue = (item) => run("readwrite", (s) => s.add(item));
export const pending = async (uid) => (await run("readonly", (s) => s.getAll())).filter((i) => i.uid === uid);
export const remove = (id) => run("readwrite", (s) => s.delete(id));
