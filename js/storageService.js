/* Persistence layer: IndexedDB.
   - The whole workspace is loaded into memory once at startup (init()), so the rest of the app keeps a
     simple synchronous API (getData / saveData / getProfile / …).
   - Writes go to IndexedDB in the background, batched, and only the pages that actually changed are
     written (per-record), so autosaving one page never rewrites the whole workspace.
   - First run after the upgrade: existing LocalStorage data is copied into IndexedDB automatically.
   - If IndexedDB is unavailable (some private modes), it falls back to LocalStorage.
   - Other tabs are told about changes through BroadcastChannel. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});

  const DB_NAME = 'myworkspace';
  const DB_VERSION = 1;
  const LEGACY = { data: 'mw:v1:data', profile: 'mw:v1:profile', settings: 'mw:v1:settings' };
  const THEME_MIRROR = 'mw:theme'; // read synchronously before first paint to avoid a theme flash

  const DEFAULT_SETTINGS = { theme: 'system', editorView: 'split', sidebarCollapsed: false, lastSpaceId: null };
  const DEFAULT_PROFILE = { name: '', title: '', about: '', location: '', website: '', github: '', linkedin: '', interests: [], photo: '' };

  const listeners = new Set();
  const state = { data: null, profile: null, settings: null, initialized: false };
  let dirty = { data: false, profile: false, settings: false };
  let backend = null;
  let backendName = 'none';
  let flushTimer = null;
  let running = null;
  let initPromise = null;
  let migrated = false;
  let channel = null;
  let lastErrorToast = 0;

  /* ---------- Normalisation ---------- */
  function normalizePage(p) {
    return {
      id: String(p.id),
      title: p.title || 'Untitled page',
      content: typeof p.content === 'string' ? p.content : '',
      spaceId: p.spaceId || null,
      tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      favorite: !!p.favorite,
      draft: !!p.draft,
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Number(p.createdAt) || Date.now()
    };
  }

  function normalizeSpace(s) {
    return { id: String(s.id), name: String(s.name), createdAt: Number(s.createdAt) || Date.now() };
  }

  function normalizeData(d) {
    const out = { spaces: [], pages: [] };
    if (d && Array.isArray(d.spaces)) out.spaces = d.spaces.filter((s) => s && s.id && s.name).map(normalizeSpace);
    if (d && Array.isArray(d.pages)) out.pages = d.pages.filter((p) => p && p.id).map(normalizePage);
    return out;
  }

  function emit(type) {
    listeners.forEach((fn) => { try { fn({ type }); } catch (err) { console.error(err); } });
  }

  function mirrorTheme() {
    try { localStorage.setItem(THEME_MIRROR, state.settings.theme); } catch (e) { /* ignore */ }
  }

  /* ---------- IndexedDB helpers ---------- */
  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      let req;
      try { req = window.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('spaces')) db.createObjectStore('spaces', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* Writes only the records that changed since the last successful write (compared as JSON). */
  function diffStore(store, list, snapshot) {
    const seen = new Set();
    list.forEach((item) => {
      seen.add(item.id);
      const json = JSON.stringify(item);
      if (snapshot.get(item.id) !== json) {
        store.put(item);
        snapshot.set(item.id, json);
      }
    });
    snapshot.forEach((json, id) => {
      if (!seen.has(id)) { store.delete(id); snapshot.delete(id); }
    });
  }

  function createIdbBackend(db) {
    const snap = { pages: new Map(), spaces: new Map() };
    let needFull = false;

    return {
      name: 'indexeddb',

      load() {
        const tx = db.transaction(['pages', 'spaces', 'meta'], 'readonly');
        return Promise.all([
          reqP(tx.objectStore('pages').getAll()),
          reqP(tx.objectStore('spaces').getAll()),
          reqP(tx.objectStore('meta').getAll())
        ]).then(([pages, spaces, meta]) => {
          const m = {};
          meta.forEach((r) => { m[r.key] = r.value; });
          return { spaces, pages, profile: m.profile, settings: m.settings, initialized: !!m.initialized };
        });
      },

      seedSnapshot(data) {
        snap.pages.clear();
        snap.spaces.clear();
        data.pages.forEach((p) => snap.pages.set(p.id, JSON.stringify(p)));
        data.spaces.forEach((s) => snap.spaces.set(s.id, JSON.stringify(s)));
      },

      markFull() { needFull = true; },

      persist(st, work) {
        const tx = db.transaction(['pages', 'spaces', 'meta'], 'readwrite');
        const meta = tx.objectStore('meta');
        if (work.data) {
          if (needFull) {
            tx.objectStore('pages').clear();
            tx.objectStore('spaces').clear();
            snap.pages.clear();
            snap.spaces.clear();
          }
          diffStore(tx.objectStore('pages'), st.data.pages, snap.pages);
          diffStore(tx.objectStore('spaces'), st.data.spaces, snap.spaces);
          meta.put({ key: 'initialized', value: !!st.initialized });
        }
        if (work.profile) meta.put({ key: 'profile', value: st.profile });
        if (work.settings) meta.put({ key: 'settings', value: st.settings });
        return txDone(tx).then(() => { needFull = false; }).catch((err) => {
          needFull = true; // something is unknown about the store now: rewrite everything next time
          throw err;
        });
      }
    };
  }

  /* Fallback when IndexedDB cannot be opened. */
  const lsBackend = {
    name: 'localstorage',
    load() {
      const read = (k) => { try { const raw = localStorage.getItem(k); return raw == null ? null : JSON.parse(raw); } catch (e) { return null; } };
      const data = read(LEGACY.data);
      return Promise.resolve({
        spaces: data && data.spaces, pages: data && data.pages,
        profile: read(LEGACY.profile), settings: read(LEGACY.settings), initialized: data !== null
      });
    },
    persist(st, work) {
      try {
        if (work.data) localStorage.setItem(LEGACY.data, JSON.stringify(st.data));
        if (work.profile) localStorage.setItem(LEGACY.profile, JSON.stringify(st.profile));
        if (work.settings) localStorage.setItem(LEGACY.settings, JSON.stringify(st.settings));
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    }
  };

  /* ---------- Flushing ---------- */
  const anyDirty = () => dirty.data || dirty.profile || dirty.settings;

  function reportError(err) {
    console.error('Save failed', err);
    const now = Date.now();
    if (WS.ui && now - lastErrorToast > 10000) {
      lastErrorToast = now;
      WS.ui.toast('Could not save to browser storage. Download a backup from Settings and check free disk space.', 'error', 8000);
    }
  }

  function runOnce() {
    if (!backend || !anyDirty()) return Promise.resolve();
    const work = dirty;
    dirty = { data: false, profile: false, settings: false };
    let p;
    try { p = backend.persist(state, work); } catch (err) { p = Promise.reject(err); }
    return p.then(() => {
      if (channel) { try { channel.postMessage({ t: 'changed' }); } catch (e) { /* ignore */ } }
    }).catch((err) => {
      dirty.data = dirty.data || work.data;
      dirty.profile = dirty.profile || work.profile;
      dirty.settings = dirty.settings || work.settings;
      reportError(err);
    });
  }

  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    const p = running ? running.then(runOnce) : runOnce();
    running = p;
    p.then(() => { if (running === p) running = null; });
    return p;
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 120);
  }

  /* ---------- Loading ---------- */
  function applyLoaded(loaded) {
    state.data = normalizeData({ spaces: loaded.spaces, pages: loaded.pages });
    state.profile = Object.assign({}, DEFAULT_PROFILE, loaded.profile || {});
    state.settings = Object.assign({}, DEFAULT_SETTINGS, loaded.settings || {});
    state.initialized = !!loaded.initialized;
    if (backend && backend.seedSnapshot) backend.seedSnapshot(state.data);
    mirrorTheme();
  }

  function migrateLegacy() {
    if (state.initialized || backendName !== 'indexeddb') return Promise.resolve();
    let raw = null;
    try { raw = localStorage.getItem(LEGACY.data); } catch (e) { raw = null; }
    if (raw == null) return Promise.resolve();

    let old;
    try { old = JSON.parse(raw); } catch (e) { console.error('Old data is unreadable, skipping migration', e); return Promise.resolve(); }
    const read = (k) => { try { const r = localStorage.getItem(k); return r == null ? null : JSON.parse(r); } catch (e) { return null; } };

    state.data = normalizeData(old);
    state.profile = Object.assign({}, DEFAULT_PROFILE, read(LEGACY.profile) || {});
    state.settings = Object.assign({}, DEFAULT_SETTINGS, read(LEGACY.settings) || {});
    state.initialized = true;
    dirty = { data: true, profile: true, settings: true };
    mirrorTheme();

    return flush().then(() => backend.load()).then((check) => {
      if (check.pages.length !== state.data.pages.length || check.spaces.length !== state.data.spaces.length) {
        throw new Error('Migration check failed');
      }
      migrated = true; // the old LocalStorage copy is left in place until the user removes it in Settings
    }).catch((err) => { console.error(err); reportError(err); });
  }

  function reload() {
    if (!backend) return Promise.resolve();
    return flush().then(() => backend.load()).then((loaded) => {
      applyLoaded(loaded);
      emit('external');
    }).catch((err) => console.error('Reload failed', err));
  }

  function setupSync() {
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('myworkspace-sync');
        channel.onmessage = () => { reload(); };
      } catch (e) { channel = null; }
    }
    window.addEventListener('storage', (e) => {
      if (backendName === 'localstorage' && e.key && e.key.indexOf('mw:v1:') === 0) reload();
    });
    window.addEventListener('pagehide', () => { flush(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  function requestPersistence() {
    try {
      if (!navigator.storage || !navigator.storage.persisted || !navigator.storage.persist) return;
      navigator.storage.persisted().then((already) => {
        if (already || localStorage.getItem('mw:persist-asked')) return undefined;
        localStorage.setItem('mw:persist-asked', '1');
        return navigator.storage.persist();
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  /* ---------- Public API ---------- */
  const storage = {
    DEFAULT_PROFILE,
    normalizeData,

    init() {
      if (initPromise) return initPromise;
      initPromise = openDb()
        .then((db) => { backend = createIdbBackend(db); backendName = 'indexeddb'; return backend.load(); })
        .catch((err) => {
          console.warn('IndexedDB unavailable, falling back to LocalStorage', err);
          backend = lsBackend;
          backendName = 'localstorage';
          return backend.load();
        })
        .then(applyLoaded)
        .then(migrateLegacy)
        .then(() => { setupSync(); requestPersistence(); return { engine: backendName, migrated }; });
      return initPromise;
    },

    engine() { return backendName; },
    wasMigrated() { return migrated; },
    flush,

    hasData() { return state.initialized; },

    getData() {
      if (!state.data) state.data = normalizeData(null);
      return state.data;
    },
    saveData() {
      state.initialized = true;
      dirty.data = true;
      scheduleFlush();
      emit('data');
      return true;
    },
    setData(d) {
      state.data = normalizeData(d);
      return storage.saveData();
    },

    getProfile() {
      if (!state.profile) state.profile = Object.assign({}, DEFAULT_PROFILE);
      return state.profile;
    },
    saveProfile(p) {
      state.profile = Object.assign({}, DEFAULT_PROFILE, p);
      dirty.profile = true;
      scheduleFlush();
      emit('profile');
      return true;
    },

    getSettings() {
      if (!state.settings) state.settings = Object.assign({}, DEFAULT_SETTINGS);
      return state.settings;
    },
    saveSettings(patch) {
      state.settings = Object.assign({}, storage.getSettings(), patch);
      dirty.settings = true;
      mirrorTheme();
      scheduleFlush();
      emit('settings');
      return true;
    },

    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    exportBackup() {
      return {
        app: 'MyWorkspace',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: storage.getData(),
        profile: storage.getProfile(),
        settings: storage.getSettings()
      };
    },

    isValidBackup(obj) {
      return !!(obj && obj.app === 'MyWorkspace' && obj.data && Array.isArray(obj.data.pages) && Array.isArray(obj.data.spaces));
    },

    /* Rough size of the workspace in bytes (for the About dialog). */
    usageBytes() {
      try { return JSON.stringify(storage.getData()).length * 2; } catch (e) { return 0; }
    },

    /* Real usage/quota as reported by the browser (async). */
    estimate() {
      const approx = storage.usageBytes();
      const base = { usage: approx, quota: 0, persisted: false, engine: backendName };
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(base);
      return Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)
      ]).then(([e, persisted]) => ({ usage: e.usage || approx, quota: e.quota || 0, persisted: !!persisted, engine: backendName }))
        .catch(() => base);
    },

    /* Old LocalStorage copy that was left behind after the upgrade. */
    legacyExists() {
      if (backendName !== 'indexeddb') return false;
      try { return localStorage.getItem(LEGACY.data) !== null; } catch (e) { return false; }
    },
    removeLegacy() {
      return flush().then(() => {
        Object.keys(LEGACY).forEach((k) => { try { localStorage.removeItem(LEGACY[k]); } catch (e) { /* ignore */ } });
      });
    },

    clearAll() {
      Object.keys(LEGACY).forEach((k) => { try { localStorage.removeItem(LEGACY[k]); } catch (e) { /* ignore */ } });
      try { localStorage.removeItem(THEME_MIRROR); } catch (e) { /* ignore */ }
      state.data = normalizeData(null);
      state.profile = Object.assign({}, DEFAULT_PROFILE);
      state.settings = Object.assign({}, DEFAULT_SETTINGS);
      state.initialized = false;
      dirty = { data: true, profile: true, settings: true };
      if (backend && backend.markFull) backend.markFull();
      scheduleFlush();
      emit('data'); emit('profile'); emit('settings');
    }
  };

  WS.storage = storage;
})();
