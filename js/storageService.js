/* LocalStorage persistence. Three keys: data (spaces + pages), profile, settings.
   Data is cached in memory and written through on save; a tiny pub/sub tells the
   shell (sidebar, header) when something changed. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});

  const KEY = { data: 'mw:v1:data', profile: 'mw:v1:profile', settings: 'mw:v1:settings' };

  const DEFAULT_SETTINGS = { theme: 'system', editorView: 'split', sidebarCollapsed: false, lastSpaceId: null };
  const DEFAULT_PROFILE = { name: '', title: '', about: '', location: '', website: '', github: '', linkedin: '', interests: [], photo: '' };

  const listeners = new Set();
  let cache = {};

  function readRaw(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.error('Could not read ' + key, err);
      return fallback;
    }
  }

  function writeRaw(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('Could not write ' + key, err);
      if (WS.ui) WS.ui.toast('Could not save: browser storage is full or blocked. Download a backup, then free some space.', 'error', 7000);
      return false;
    }
  }

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

  function normalizeData(d) {
    const out = { spaces: [], pages: [] };
    if (d && Array.isArray(d.spaces)) {
      out.spaces = d.spaces.filter((s) => s && s.id && s.name).map((s) => ({
        id: String(s.id), name: String(s.name), createdAt: Number(s.createdAt) || Date.now()
      }));
    }
    if (d && Array.isArray(d.pages)) out.pages = d.pages.filter((p) => p && p.id).map(normalizePage);
    return out;
  }

  function emit(type) {
    listeners.forEach((fn) => { try { fn({ type }); } catch (err) { console.error(err); } });
  }

  const storage = {
    KEY,
    DEFAULT_PROFILE,
    normalizeData,

    hasData() {
      try { return localStorage.getItem(KEY.data) !== null; } catch (e) { return false; }
    },

    getData() {
      if (!cache.data) cache.data = normalizeData(readRaw(KEY.data, null));
      return cache.data;
    },
    saveData() {
      const ok = writeRaw(KEY.data, cache.data);
      emit('data');
      return ok;
    },
    setData(d) {
      cache.data = normalizeData(d);
      return storage.saveData();
    },

    getProfile() {
      if (!cache.profile) cache.profile = Object.assign({}, DEFAULT_PROFILE, readRaw(KEY.profile, {}));
      return cache.profile;
    },
    saveProfile(p) {
      cache.profile = Object.assign({}, DEFAULT_PROFILE, p);
      const ok = writeRaw(KEY.profile, cache.profile);
      emit('profile');
      return ok;
    },

    getSettings() {
      if (!cache.settings) cache.settings = Object.assign({}, DEFAULT_SETTINGS, readRaw(KEY.settings, {}));
      return cache.settings;
    },
    saveSettings(patch) {
      cache.settings = Object.assign({}, storage.getSettings(), patch);
      const ok = writeRaw(KEY.settings, cache.settings);
      emit('settings');
      return ok;
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

    usageBytes() {
      let n = 0;
      Object.keys(KEY).forEach((k) => {
        try { n += (localStorage.getItem(KEY[k]) || '').length * 2; } catch (e) { /* ignore */ }
      });
      return n;
    },

    clearAll() {
      Object.keys(KEY).forEach((k) => { try { localStorage.removeItem(KEY[k]); } catch (e) { /* ignore */ } });
      cache = {};
      emit('data'); emit('profile'); emit('settings');
    }
  };

  // Changes made in another tab: drop the cache and let the shell refresh.
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.indexOf('mw:v1:') === 0) {
      cache = {};
      emit('external');
    }
  });

  WS.storage = storage;
})();
