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

/* ---------- whole-app backup (settings page) ---------- */
const savedKeys = () => {
  try {
    return Object.keys(window.localStorage).filter((key) => key.startsWith(PREFIX));
  } catch {
    return [];
  }
};

// Bytes used by the saved JSON (UTF-16, as the browser counts it) and by the media blobs.
export const storageUsage = async () => {
  const json = savedKeys().reduce((sum, key) => sum + (key.length + (window.localStorage.getItem(key)?.length ?? 0)) * 2, 0);
  const blobs = await mediaRequest("readonly", (store) => store.getAll()).catch(() => []);
  return { json, media: blobs.reduce((sum, blob) => sum + (blob?.size ?? 0), 0), mediaCount: blobs.length };
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export const exportBackup = async () => {
  const data = Object.fromEntries(savedKeys().map((key) => [key, window.localStorage.getItem(key)]));
  const [ids, blobs] = await Promise.all([
    mediaRequest("readonly", (store) => store.getAllKeys()).catch(() => []),
    mediaRequest("readonly", (store) => store.getAll()).catch(() => []),
  ]);
  const media = {};
  for (let i = 0; i < ids.length; i++) if (blobs[i]) media[ids[i]] = await blobToDataUrl(blobs[i]);
  return { app: "between-lines", version: 1, exportedAt: new Date().toISOString(), data, media };
};

export const clearAllSaved = async () => {
  savedKeys().forEach(removeSaved);
  await mediaRequest("readwrite", (store) => store.clear()).catch(() => undefined);
};

// Replaces everything saved with the backup's contents; throws if the file isn't a backup.
export const importBackup = async (backup) => {
  if (backup?.app !== "between-lines" || typeof backup.data !== "object") throw new Error("not a Between Lines backup");
  await clearAllSaved();
  for (const [key, value] of Object.entries(backup.data)) {
    if (key.startsWith(PREFIX) && typeof value === "string") window.localStorage.setItem(key, value);
  }
  for (const [id, url] of Object.entries(backup.media ?? {})) {
    const blob = await fetch(url).then((response) => response.blob()).catch(() => null);
    if (blob) await saveMedia(id, blob);
  }
};
