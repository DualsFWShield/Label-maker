/**
 * db.js — IndexedDB adapter for persistent storage
 * Stores label projects, images, and auto-save state
 */

const DB_NAME = 'LabelMakerStudio';
const DB_VERSION = 1;
const STORES = {
  projects: 'projects',
  images: 'images',
  autosave: 'autosave',
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.projects)) {
        db.createObjectStore(STORES.projects, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.images)) {
        db.createObjectStore(STORES.images, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.autosave)) {
        db.createObjectStore(STORES.autosave, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      _db = request.result;
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

async function _transaction(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function _request(idbRequest) {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(idbRequest.error);
  });
}

/* ---------- Generic CRUD ---------- */

async function dbPut(storeName, value) {
  const store = await _transaction(storeName, 'readwrite');
  return _request(store.put(value));
}

async function dbGet(storeName, key) {
  const store = await _transaction(storeName, 'readonly');
  return _request(store.get(key));
}

async function dbGetAll(storeName) {
  const store = await _transaction(storeName, 'readonly');
  return _request(store.getAll());
}

async function dbDelete(storeName, key) {
  const store = await _transaction(storeName, 'readwrite');
  return _request(store.delete(key));
}

async function dbClear(storeName) {
  const store = await _transaction(storeName, 'readwrite');
  return _request(store.clear());
}

/* ---------- Autosave Helpers ---------- */

async function saveAutoState(stateObj) {
  return dbPut(STORES.autosave, { key: 'currentState', ...stateObj, savedAt: Date.now() });
}

async function loadAutoState() {
  return dbGet(STORES.autosave, 'currentState');
}

/* ---------- Image Store Helpers ---------- */

async function saveImage(id, dataUrl) {
  return dbPut(STORES.images, { id, dataUrl, savedAt: Date.now() });
}

async function loadImage(id) {
  const record = await dbGet(STORES.images, id);
  return record?.dataUrl ?? null;
}

async function deleteImage(id) {
  return dbDelete(STORES.images, id);
}

/* ---------- Exports ---------- */

export {
  STORES,
  openDB,
  dbPut,
  dbGet,
  dbGetAll,
  dbDelete,
  dbClear,
  saveAutoState,
  loadAutoState,
  saveImage,
  loadImage,
  deleteImage,
};
