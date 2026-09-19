/* Home dashboard: welcome banner, quick actions, recent pages, favorites. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);
  WS.views = WS.views || {};

  const ART = '<svg viewBox="0 0 190 110" fill="none" aria-hidden="true">' +
    '<rect x="1" y="1" width="188" height="108" rx="10" fill="var(--surface)" stroke="var(--border)"/>' +
    '<circle cx="138" cy="34" r="12" fill="currentColor" opacity=".35"/>' +
    '<path d="M1 100 62 44l34 38 22-22 71 42v6a10 10 0 0 1-10 2H11A10 10 0 0 1 1 100z" fill="currentColor" opacity=".6"/>' +
    '<path d="M62 44l34 38-24-10-10 12-14-14-19 18z" fill="currentColor" opacity=".9"/></svg>';

  WS.views.home = function () {
    WS.app.setTitle('');
    const profile = WS.storage.getProfile();
    const first = (profile.name || '').trim().split(/\s+/)[0];
    const recent = WS.pages.recent(5);
    const favs = WS.pages.favorites().slice(0, 5);

    const main = WS.app.render(
      '<div class="view">' +
        '<section class="welcome">' +
          '<div><h1>' + (first ? 'Welcome back, ' + esc(first) + '!' : 'Welcome back!') + '</h1>' +
          '<p>Capture your ideas. Organize your knowledge. Build your personal library.</p></div>' +
          '<div class="welcome-art">' + ART + '</div>' +
        '</section>' +

        '<h2 class="section-title">Quick actions</h2>' +
        '<div class="quick-actions">' +
          '<button class="action-tile" type="button" data-act="new-page">' + icon('file', 26) + '<span>Create a new page</span></button>' +
          '<button class="action-tile" type="button" data-act="new-space">' + icon('folder', 26) + '<span>Create a space</span></button>' +
          '<button class="action-tile" type="button" data-act="import">' + icon('upload', 26) + '<span>Import Markdown</span></button>' +
        '</div>' +

        '<div class="dash-grid">' +
          '<section class="card"><div class="card-head"><h2>Recent pages</h2><a href="#/recent">View all</a></div><div class="card-body">' +
            (recent.length ? recent.map((p) => WS.list.compactItem(p)).join('')
              : '<div class="empty small"><p style="margin:0">No pages yet. Create one to get started.</p></div>') +
          '</div></section>' +
          '<section class="card"><div class="card-head"><h2>Favorites</h2><a href="#/favorites">View all</a></div><div class="card-body">' +
            (favs.length ? favs.map((p) => WS.list.compactItem(p, { star: true })).join('')
              : '<div class="empty small"><p style="margin:0">Select the star on a page to keep it here.</p></div>') +
          '</div></section>' +
        '</div>' +
      '</div>');

    main.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.getAttribute('data-act');
      if (a === 'new-page') WS.actions.newPage({});
      else if (a === 'new-space') WS.actions.newSpace();
      else if (a === 'import') WS.actions.importMarkdown();
    });
  };
})();
