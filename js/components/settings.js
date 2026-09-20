/* Settings: theme, editor layout, backup/restore, Markdown import/export, reset. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);
  WS.views = WS.views || {};

  function segmented(name, options, current) {
    return '<div class="segmented" role="group" data-seg="' + name + '">' + options.map((o) =>
      '<button type="button" data-value="' + o[0] + '" aria-pressed="' + (o[0] === current) + '">' + o[1] + '</button>').join('') + '</div>';
  }

  WS.views.settings = function () {
    WS.app.setTitle('Settings');
    const s = WS.storage.getSettings();
    const pages = WS.pages.all().length;
    const spaces = WS.pages.spaces().length;

    const main = WS.app.render(
      '<div class="view view-narrow">' +
        '<div class="view-head"><div class="grow"><h1>Settings</h1></div></div>' +

        '<section class="card settings-block"><h2>Appearance</h2><p>Choose how MyWorkspace looks.</p>' +
          '<div class="setting-row"><div><div class="label">Theme</div></div>' +
            segmented('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], s.theme) + '</div>' +
          '<div class="setting-row"><div><div class="label">Editor layout</div><div class="desc">Show the live preview next to the Markdown source.</div></div>' +
            segmented('editorView', [['split', 'Split view'], ['write', 'Markdown only']], s.editorView === 'write' ? 'write' : 'split') + '</div>' +
        '</section>' +

        '<section class="card settings-block"><h2>Backup and restore</h2><p>Your workspace lives only in this browser. Keep a copy somewhere safe.</p>' +
          '<div class="setting-row"><div><div class="label">Full backup</div><div class="desc">' + pages + ' pages, ' + spaces + ' spaces, profile and settings as one JSON file.</div></div>' +
            '<div class="setting-actions"><button class="btn" type="button" data-act="backup">' + icon('download', 16) + 'Download backup</button>' +
            '<button class="btn" type="button" data-act="restore">' + icon('upload', 16) + 'Restore backup</button></div></div>' +
        '</section>' +

        '<section class="card settings-block"><h2>Markdown files</h2><p>Pages are plain Markdown, so they work with any other editor.</p>' +
          '<div class="setting-row"><div><div class="label">Import</div><div class="desc">Add one or more .md files as new pages.</div></div>' +
            '<div class="setting-actions"><button class="btn" type="button" data-act="import">' + icon('upload', 16) + 'Import .md files</button></div></div>' +
          '<div class="setting-row"><div><div class="label">Export</div><div class="desc">Download every page as .md files in a zip, grouped by space.</div></div>' +
            '<div class="setting-actions"><button class="btn" type="button" data-act="export-all">' + icon('download', 16) + 'Export all pages</button></div></div>' +
        '</section>' +

        '<section class="card settings-block"><h2>Storage</h2>' +
          '<div class="setting-row"><div><div class="label">Used in this browser</div><div class="desc" id="storage-desc">Checking…</div></div>' +
            '<strong id="storage-usage">…</strong></div>' +
          (WS.storage.legacyExists()
            ? '<div class="setting-row"><div><div class="label">Old LocalStorage copy</div><div class="desc">Your data was copied to IndexedDB. The old copy is still here as a safety net. Remove it once you are happy everything is intact.</div></div>' +
              '<button class="btn btn-danger-outline" type="button" data-act="remove-legacy">Remove old copy</button></div>' : '') +
        '</section>' +

        '<section class="card settings-block"><h2>About</h2>' +
          '<div class="setting-row"><div><div class="label">MyWorkspace</div><div class="desc">A personal, Markdown-first workspace that runs entirely in your browser: no account, no server, no tracking. ' +
            pages + (pages === 1 ? ' page' : ' pages') + ' in ' + spaces + (spaces === 1 ? ' space' : ' spaces') + '. Press <span class="kbd">/</span> to search from anywhere.</div></div></div>' +
        '</section>' +

        '<section class="card settings-block"><h2>Reset</h2>' +
          '<div class="setting-row"><div><div class="label">Reset workspace</div><div class="desc">Erase all pages, spaces, profile and settings from this browser and restore the sample content.</div></div>' +
            '<button class="btn btn-danger-outline" type="button" data-act="reset">' + icon('trash', 16) + 'Reset workspace</button></div>' +
        '</section>' +
      '</div>');

    main.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-seg] button');
      if (seg) {
        const name = seg.parentElement.getAttribute('data-seg');
        const value = seg.getAttribute('data-value');
        seg.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === seg)));
        if (name === 'theme') WS.theme.set(value);
        else WS.storage.saveSettings({ [name]: value });
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.getAttribute('data-act');
      if (a === 'backup') { WS.pages.downloadBackup(); WS.ui.toast('Backup downloaded'); }
      else if (a === 'restore') WS.actions.restoreBackup();
      else if (a === 'import') WS.actions.importMarkdown();
      else if (a === 'export-all') WS.actions.exportAll();
      else if (a === 'reset') WS.actions.resetWorkspace();
      else if (a === 'remove-legacy') {
        WS.ui.confirm({ title: 'Remove old copy', message: 'Delete the old LocalStorage copy of your workspace? The IndexedDB copy is not affected.', confirmText: 'Remove', danger: true })
          .then((ok) => ok && WS.storage.removeLegacy().then(() => { WS.ui.toast('Old copy removed'); WS.router.refresh(); }));
      }
    });

    WS.storage.estimate().then((e) => {
      const usage = main.querySelector('#storage-usage');
      const desc = main.querySelector('#storage-desc');
      if (!usage || !document.body.contains(usage)) return;
      usage.textContent = WS.util.formatBytes(e.usage) + (e.quota ? ' of ' + WS.util.formatBytes(e.quota) : '');
      desc.textContent = e.engine === 'indexeddb'
        ? 'Stored in IndexedDB, which has far more room than LocalStorage. ' + (e.persisted ? 'The browser has marked it as persistent.' : 'The browser may clear it if the device runs very low on space, so keep a backup.')
        : 'IndexedDB is unavailable here, so LocalStorage is used (about 5 MB limit). Keep a backup.';
    });
  };
})();
