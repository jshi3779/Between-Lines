// Everything is saved on this device only: JSON state in localStorage, and the bytes of photos
// and recordings in IndexedDB (localStorage is too small for media). Saved records point at
// media by `mediaId`; object URLs are recreated from IndexedDB each time a notebook opens.

const PREFIX = "between-lines:";
export const SHELF_KEY = `${PREFIX}shelf`;
export const LIBRARY_KEY = `${PREFIX}library`;
export const notebookKey = (id) => `${PREFIX}notebook:${id}`;

export const loadJSON = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Returns false when the browser refuses (private mode, storage full) so callers can say so.
export const saveJSON = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const removeSaved = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // nothing saved, or storage unavailable — either way there is nothing to remove
  }
};

const MEDIA_STORE = "media";
let database;
const openDatabase = () => {
  database ??= new Promise((resolve, reject) => {
    const request = window.indexedDB.open("between-lines", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MEDIA_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
};

const mediaRequest = async (mode, run) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, mode);
    const request = run(transaction.objectStore(MEDIA_STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
  });
};

export const saveMedia = (id, blob) => mediaRequest("readwrite", (store) => store.put(blob, id)).catch(() => undefined);
export const loadMedia = (id) => mediaRequest("readonly", (store) => store.get(id)).catch(() => undefined);
