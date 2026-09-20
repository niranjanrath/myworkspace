/* App bootstrap: theme, shared actions (create/delete/import…), routes, keyboard shortcuts. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);

  /* ---------- Main container ----------
     Each render swaps in a fresh <main>, which drops the previous view's event listeners. */
  WS.app = {
    render(html, cls) {
      const old = document.getElementById('main');
      const fresh = old.cloneNode(false);
      fresh.className = 'main' + (cls ? ' ' + cls : '');
      fresh.innerHTML = html;
      old.replaceWith(fresh);
      WS.md.bindInteractions(fresh);
      window.scrollTo(0, 0);
      return fresh;
    },
    setTitle(t) { document.title = t ? t + ' – MyWorkspace' : 'MyWorkspace'; }
  };

  /* ---------- Theme ---------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  WS.theme = {
    apply(pref) {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#151c26' : '#ffffff');
    },
    set(pref) {
      WS.storage.saveSettings({ theme: pref });
      WS.theme.apply(pref);
      WS.header.refreshTheme();
      WS.sidebar.render();
    },
    toggle() {
      WS.theme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    },
    init() {
      WS.theme.apply(WS.storage.getSettings().theme);
      const onChange = () => { if (WS.storage.getSettings().theme === 'system') { WS.theme.apply('system'); WS.header.refreshTheme(); WS.sidebar.render(); } };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  };

  /* ---------- Actions ---------- */
  WS.actions = {
    newPage(opts) {
      opts = opts || {};
      const content = opts.title ? '# ' + opts.title + '\n\n' : '# \n\n';
      const page = WS.pages.create({ content, spaceId: opts.spaceId, draft: WS.md.isBlank(content) });
      if (opts.spaceId) WS.storage.saveSettings({ lastSpaceId: opts.spaceId });
      WS.router.navigate('/page/' + encodeURIComponent(page.id) + '/edit');
    },

    createPageFromLink(title) {
      const r = WS.router.current();
      const cur = r.params && r.params.id ? WS.pages.get(r.params.id) : null;
      WS.actions.newPage({ title, spaceId: cur ? cur.spaceId : undefined });
    },

    newSpace() {
      return WS.ui.form({
        title: 'Create space',
        message: 'Spaces group related pages, like Work or Projects.',
        confirmText: 'Create space',
        fields: [{
          name: 'name', label: 'Space name', required: true, placeholder: 'e.g. Recipes',
          validate: (v) => (WS.pages.spaceNameTaken(v) ? 'A space with this name already exists.' : '')
        }]
      }).then((v) => {
        if (!v) return;
        const space = WS.pages.createSpace(v.name);
        WS.ui.toast('Space created');
        WS.router.navigate('/space/' + encodeURIComponent(space.id));
      });
    },

    renameSpace(id) {
      const space = WS.pages.getSpace(id);
      if (!space) return;
      return WS.ui.form({
        title: 'Rename space', confirmText: 'Save',
        fields: [{
          name: 'name', label: 'Space name', required: true, value: space.name,
          validate: (v) => (WS.pages.spaceNameTaken(v, id) ? 'A space with this name already exists.' : '')
        }]
      }).then((v) => {
        if (!v) return;
        WS.pages.renameSpace(id, v.name);
        WS.router.refresh();
      });
    },

    deleteSpace(id) {
      const space = WS.pages.getSpace(id);
      if (!space) return;
      const n = WS.pages.countInSpace(id);
      return WS.ui.confirm({
        title: 'Delete space',
        message: 'Delete “' + space.name + '”' + (n ? ' and its ' + n + (n === 1 ? ' page' : ' pages') : '') + '? This cannot be undone.',
        confirmText: 'Delete space', danger: true
      }).then((ok) => {
        if (!ok) return;
        WS.pages.removeSpace(id);
        WS.ui.toast('Space deleted');
        WS.router.navigate('/pages');
      });
    },

    deletePage(id) {
      const page = WS.pages.get(id);
      if (!page) return;
      return WS.ui.confirm({
        title: 'Delete page', message: 'Delete “' + page.title + '”? You can undo this right after.', confirmText: 'Delete page', danger: true
      }).then((ok) => {
        if (!ok) return;
        const removed = WS.pages.remove(id);
        WS.router.navigate('/space/' + encodeURIComponent(removed.spaceId), { replace: false });
        WS.ui.toast('Page deleted', 'info', 7000, {
          label: 'Undo',
          onClick: () => { WS.pages.restore(removed); WS.router.navigate('/page/' + encodeURIComponent(removed.id)); }
        });
      });
    },

    duplicatePage(id) {
      const copy = WS.pages.duplicate(id);
      if (copy) { WS.ui.toast('Page duplicated'); WS.router.navigate('/page/' + encodeURIComponent(copy.id)); }
    },

    movePage(id) {
      const page = WS.pages.get(id);
      if (!page) return;
      return WS.ui.form({
        title: 'Move page', confirmText: 'Move',
        fields: [{ name: 'spaceId', label: 'Space', type: 'select', value: page.spaceId,
          options: WS.pages.spaces().map((s) => ({ value: s.id, label: s.name })) }]
      }).then((v) => {
        if (!v || v.spaceId === page.spaceId) return;
        WS.pages.update(id, { spaceId: v.spaceId });
        WS.ui.toast('Moved to ' + WS.pages.spaceName(v.spaceId));
        WS.router.refresh();
      });
    },

    sharePage(id) {
      const page = WS.pages.get(id);
      if (!page) return;
      if (navigator.share) {
        navigator.share({ title: page.title, text: WS.pages.toMarkdownFile(page) }).catch(() => {});
      } else {
        WS.pages.exportPage(page);
      }
    },

    importMarkdown(spaceId) {
      return WS.util.pickFiles('.md,.markdown,.txt,text/markdown,text/plain', true).then((files) => {
        if (!files.length) return;
        return WS.ui.form({
          title: 'Import ' + files.length + (files.length === 1 ? ' file' : ' files'),
          confirmText: 'Import',
          fields: [{ name: 'spaceId', label: 'Add to space', type: 'select', value: spaceId || WS.pages.defaultSpaceId(),
            options: WS.pages.spaces().map((s) => ({ value: s.id, label: s.name })) }]
        }).then((v) => {
          if (!v) return;
          return Promise.all(files.map((f) => WS.util.readFileAsText(f).then((t) => WS.pages.importMarkdown(f.name, t, v.spaceId))))
            .then((created) => {
              WS.ui.toast('Imported ' + created.length + (created.length === 1 ? ' page' : ' pages'));
              WS.router.navigate(created.length === 1 ? '/page/' + encodeURIComponent(created[0].id) : '/space/' + encodeURIComponent(v.spaceId));
            })
            .catch((err) => WS.ui.toast('Import failed: ' + err.message, 'error'));
        });
      });
    },

    exportAll() {
      if (!WS.pages.all().length) { WS.ui.toast('There are no pages to export yet.'); return; }
      WS.pages.exportAllZip()
        .then((n) => WS.ui.toast('Exported ' + n + (n === 1 ? ' page' : ' pages')))
        .catch((err) => WS.ui.toast('Export failed: ' + err.message, 'error'));
    },

    restoreBackup() {
      return WS.util.pickFiles('.json,application/json').then((files) => {
        if (!files.length) return;
        return WS.util.readFileAsText(files[0]).then((text) => {
          let obj;
          try { obj = JSON.parse(text); } catch (e) { obj = null; }
          if (!WS.storage.isValidBackup(obj)) { WS.ui.toast('That file is not a MyWorkspace backup.', 'error'); return; }
          return WS.ui.form({
            title: 'Restore backup',
            message: 'This backup has ' + obj.data.pages.length + ' pages in ' + obj.data.spaces.length + ' spaces' +
              (obj.exportedAt ? ', saved ' + WS.util.formatDate(Date.parse(obj.exportedAt)) : '') + '.',
            confirmText: 'Restore',
            fields: [{ name: 'mode', label: 'How should it be applied?', type: 'radio', value: 'merge', options: [
              { value: 'merge', label: 'Merge into this workspace', hint: 'Keeps what you have; the newer copy of each page wins.' },
              { value: 'replace', label: 'Replace this workspace', hint: 'Erases current pages, profile and settings first.' }] }]
          }).then((v) => {
            if (!v) return;
            const n = WS.pages.restoreBackup(obj, v.mode);
            WS.theme.apply(WS.storage.getSettings().theme);
            WS.ui.toast('Restored ' + n + (n === 1 ? ' page' : ' pages'));
            WS.router.navigate('/home');
            WS.router.refresh();
          });
        });
      }).catch((err) => WS.ui.toast('Restore failed: ' + err.message, 'error'));
    },

    resetWorkspace() {
      return WS.ui.confirm({
        title: 'Reset workspace',
        message: 'This erases every page, space, your profile and settings in this browser, then restores the sample content. Download a backup first if you might need anything.',
        confirmText: 'Erase and reset', danger: true
      }).then((ok) => {
        if (!ok) return;
        WS.pages.resetAll();
        WS.theme.apply(WS.storage.getSettings().theme);
        WS.ui.toast('Workspace reset');
        WS.router.navigate('/home');
        WS.router.refresh();
      });
    },

    about() {
      const n = WS.pages.all().length;
      return WS.ui.dialog({
        title: 'About MyWorkspace', hideCancel: true, confirmText: 'Close',
        body: '<p>A personal, Markdown-first documentation workspace. It runs entirely in your browser: no account, no server, no tracking.</p>' +
          '<p style="margin-top:10px">' + n + (n === 1 ? ' page' : ' pages') + ' · ' + WS.pages.spaces().length + ' spaces · ' + WS.util.formatBytes(WS.storage.usageBytes()) + ' stored locally.</p>' +
          '<p style="margin-top:10px">Tip: press <span class="kbd">/</span> to search from anywhere.</p>'
      });
    }
  };

  /* ---------- Boot ---------- */
  function boot() {
    WS.pages.init();
    WS.theme.init();
    WS.header.mount();
    WS.sidebar.mount();

    const r = WS.router;
    r.add('/home', () => WS.views.home());
    r.add('/pages', () => WS.views.pages());
    r.add('/page/:id', (p) => WS.views.page(p));
    r.add('/page/:id/edit', (p) => WS.views.edit(p));
    r.add('/space/:id', (p) => WS.views.space(p));
    r.add('/favorites', () => WS.views.favorites());
    r.add('/recent', () => WS.views.recent());
    r.add('/profile', () => WS.views.profile());
    r.add('/settings', () => WS.views.settings());
    r.add('/search/:q', (p) => WS.views.search(p));
    r.setNotFound(() => WS.views.notFound());

    // Another tab changed the data: refresh what is on screen (but never clobber an open editor).
    WS.storage.on((evt) => {
      if (evt.type !== 'external') return;
      WS.theme.apply(WS.storage.getSettings().theme);
      if (r.current().pattern !== '/page/:id/edit') r.refresh();
    });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        WS.header.focusSearch();
      }
    });

    window.addEventListener('resize', WS.util.debounce(() => WS.header.syncToggle(), 100));
    r.start();
  }

  function start() {
    WS.storage.init()
      .catch((err) => { console.error('Storage init failed', err); })
      .then((info) => {
        boot();
        if (info && info.migrated) {
          WS.ui.toast('Your workspace was upgraded to IndexedDB. Nothing was lost.', 'info', 6000);
        }
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
