/* List-style views: All Pages, Favorites, Recent, Space, Search results. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);
  WS.views = WS.views || {};

  function tagChips(tags) {
    return tags.map((t) => '<a class="tag" href="#/search/' + encodeURIComponent('tag:' + t) + '">' + esc(t) + '</a>').join('');
  }

  function rowHTML(p, o) {
    o = o || {};
    const fav = p.favorite;
    return '<li class="page-row">' +
      '<a class="page-row-main" href="#/page/' + esc(p.id) + '">' +
        '<span class="page-row-icon">' + icon('file', 18) + '</span>' +
        '<span class="page-row-text">' +
          '<span class="page-row-title">' + (o.titleHtml || esc(p.title)) + '</span>' +
          '<span class="page-row-sub"><span class="chip-space">' + icon('folder', 13) + esc(WS.pages.spaceName(p.spaceId)) + '</span>' +
          '<span>Updated ' + WS.util.timeAgo(p.updatedAt) + '</span></span>' +
          (o.snippet ? '<span class="page-row-snippet">' + o.snippet + '</span>' : '') +
        '</span></a>' +
      '<span class="page-row-tags">' + tagChips(p.tags.slice(0, 4)) + '</span>' +
      '<button class="icon-btn star' + (fav ? ' on' : '') + '" type="button" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '" aria-label="' +
        (fav ? 'Remove from favorites' : 'Add to favorites') + '">' + icon('star', 18) + '</button>' +
    '</li>';
  }

  function compactItem(p, opts) {
    opts = opts || {};
    return '<a class="compact-item" href="#/page/' + esc(p.id) + '">' +
      (opts.star ? '<span class="star-fill">' + icon('star', 18) + '</span>' : icon('file', 20)) +
      '<span class="txt"><span class="t">' + esc(p.title) + '</span>' +
      (opts.star ? '' : '<span class="m">' + WS.util.timeAgo(p.updatedAt) + '</span>') + '</span></a>';
  }

  function bindRowActions(root, onChange) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fav]');
      if (!b) return;
      const on = WS.pages.toggleFavorite(b.getAttribute('data-fav'));
      WS.ui.toast(on ? 'Added to favorites' : 'Removed from favorites');
      onChange && onChange();
    });
  }

  function emptyHTML(e) {
    return '<div class="card"><div class="empty">' + icon(e.icon || 'file', 36) + '<h2>' + esc(e.title) + '</h2><p>' + esc(e.text || '') + '</p>' +
      (e.action ? '<button class="btn btn-primary" type="button" data-act="new-page">' + icon('plus', 16) + esc(e.action) + '</button>' : '') + '</div></div>';
  }

  /* opts: { title, subtitle(fn|string), getPages(), filters, empty, actionsHTML, headExtra, rowOpts(result) } */
  function mount(opts) {
    let sort = 'updated';
    let spaceFilter = '';
    let tagFilter = '';
    const main = WS.app.render(
      '<div class="view">' +
        '<div class="view-head"><div class="grow"><h1>' + opts.titleHTML + '</h1><p class="sub" id="list-sub"></p></div>' +
        '<div class="view-actions">' + (opts.actionsHTML || '') + '</div></div>' +
        (opts.filters ? '<div class="list-toolbar" id="list-toolbar"></div><div class="filter-tags" id="filter-tags"></div>' : '') +
        '<div id="list-wrap"></div>' +
      '</div>');
    const wrap = main.querySelector('#list-wrap');
    const sub = main.querySelector('#list-sub');

    function paintToolbar() {
      if (!opts.filters) return;
      const tb = main.querySelector('#list-toolbar');
      tb.innerHTML =
        '<label class="sr-only" for="sort-sel">Sort</label><select class="select" id="sort-sel">' +
          '<option value="updated">Recently updated</option><option value="title">Title A–Z</option><option value="created">Recently created</option></select>' +
        '<label class="sr-only" for="space-sel">Space</label><select class="select" id="space-sel"><option value="">All spaces</option>' +
          WS.pages.spaces().map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select>';
      tb.querySelector('#sort-sel').value = sort;
      tb.querySelector('#space-sel').value = spaceFilter;
      tb.querySelector('#sort-sel').addEventListener('change', (e) => { sort = e.target.value; paint(); });
      tb.querySelector('#space-sel').addEventListener('change', (e) => { spaceFilter = e.target.value; paint(); });

      const tags = WS.pages.allTags().slice(0, 14);
      main.querySelector('#filter-tags').innerHTML = tags.map((t) =>
        '<button class="tag' + (tagFilter === t.tag.toLowerCase() ? ' on' : '') + '" type="button" data-tag="' + esc(t.tag.toLowerCase()) + '">' + esc(t.tag) + ' ' + t.count + '</button>').join('');
    }

    function paint() {
      let items = opts.getPages();
      const total = items.length;
      if (opts.filters) {
        if (spaceFilter) items = items.filter((r) => r.page.spaceId === spaceFilter);
        if (tagFilter) items = items.filter((r) => r.page.tags.some((t) => t.toLowerCase() === tagFilter));
        items = items.slice().sort((a, b) => {
          if (sort === 'title') return a.page.title.localeCompare(b.page.title);
          if (sort === 'created') return b.page.createdAt - a.page.createdAt;
          return b.page.updatedAt - a.page.updatedAt;
        });
      }
      sub.textContent = typeof opts.subtitle === 'function' ? opts.subtitle(items.length, total) : (opts.subtitle || '');
      sub.hidden = !sub.textContent;
      if (!items.length) {
        wrap.innerHTML = emptyHTML(total && opts.filters ? { icon: 'search', title: 'No pages match these filters', text: 'Try a different space or tag.' } : opts.empty);
        return;
      }
      wrap.innerHTML = '<div class="card"><ul class="page-list">' + items.map((r) => rowHTML(r.page, r.opts)).join('') + '</ul></div>';
    }

    main.addEventListener('click', function handler(e) {
      const tag = e.target.closest('[data-tag]');
      if (tag) {
        const t = tag.getAttribute('data-tag');
        tagFilter = tagFilter === t ? '' : t;
        paintToolbar();
        paint();
      }
    });
    bindRowActions(wrap, () => { paintToolbar(); paint(); });
    paintToolbar();
    paint();
    return main;
  }

  const wrapPages = (pages) => pages.map((p) => ({ page: p }));

  function newPageAction(main, spaceId) {
    main.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="new-page"]')) WS.actions.newPage({ spaceId });
    });
  }

  WS.views.pages = function () {
    WS.app.setTitle('All pages');
    const main = mount({
      titleHTML: 'All pages', filters: true,
      subtitle: (n, total) => (n === total ? total + (total === 1 ? ' page' : ' pages') : n + ' of ' + total + ' pages'),
      getPages: () => wrapPages(WS.pages.all()),
      actionsHTML: '<button class="btn btn-primary" type="button" data-act="new-page">' + icon('plus', 16) + 'New page</button>',
      empty: { icon: 'file', title: 'No pages yet', text: 'Create your first page. Everything is written in Markdown.', action: 'Create a page' }
    });
    newPageAction(main);
  };

  WS.views.favorites = function () {
    WS.app.setTitle('Favorites');
    mount({
      titleHTML: 'Favorites',
      subtitle: (n) => n + (n === 1 ? ' page' : ' pages'),
      getPages: () => wrapPages(WS.pages.favorites()),
      empty: { icon: 'star', title: 'No favorites yet', text: 'Select the star on any page to keep it here for quick access.' }
    });
  };

  WS.views.recent = function () {
    WS.app.setTitle('Recent');
    mount({
      titleHTML: 'Recently modified',
      subtitle: 'Your 30 most recently edited pages',
      getPages: () => wrapPages(WS.pages.recent(30)),
      empty: { icon: 'clock', title: 'Nothing here yet', text: 'Pages you create or edit show up here.' }
    });
  };

  WS.views.space = function (params) {
    const space = WS.pages.getSpace(params.id);
    if (!space) return WS.views.notFound('This space no longer exists.');
    WS.app.setTitle(space.name);
    WS.storage.saveSettings({ lastSpaceId: space.id });
    const main = mount({
      titleHTML: icon('folder', 22) + ' ' + esc(space.name),
      subtitle: (n) => n + (n === 1 ? ' page' : ' pages'),
      getPages: () => wrapPages(WS.pages.inSpace(space.id)),
      actionsHTML: '<button class="btn btn-primary" type="button" data-act="new-page">' + icon('plus', 16) + 'New page</button>' +
        '<button class="icon-btn" type="button" data-act="space-more" aria-haspopup="menu" aria-label="Space actions">' + icon('more') + '</button>',
      empty: { icon: 'folder', title: 'This space is empty', text: 'Add a page or import Markdown files to get started.', action: 'Create a page' }
    });
    newPageAction(main, space.id);
    main.addEventListener('click', (e) => {
      const more = e.target.closest('[data-act="space-more"]');
      if (!more) return;
      WS.ui.menu(more, [
        { label: 'Rename space', icon: 'edit', onClick: () => WS.actions.renameSpace(space.id) },
        { label: 'Import Markdown here', icon: 'upload', onClick: () => WS.actions.importMarkdown(space.id) },
        { divider: true },
        { label: 'Delete space', icon: 'trash', danger: true, onClick: () => WS.actions.deleteSpace(space.id) }
      ]);
    });
  };

  WS.views.search = function (params) {
    const q = params.q;
    WS.app.setTitle('Search: ' + q);
    const terms = WS.search.parse(q).terms;
    mount({
      titleHTML: 'Results for “' + esc(q) + '”',
      subtitle: (n) => n + (n === 1 ? ' page' : ' pages') + ' found',
      getPages: () => WS.search.query(q).map((r) => ({ page: r.page, opts: { titleHtml: r.titleHtml, snippet: terms.length ? r.snippet : '' } })),
      empty: { icon: 'search', title: 'No pages found', text: 'Check the spelling, try fewer words, or search by tag with tag:name.' }
    });
  };

  WS.views.notFound = function (message) {
    WS.app.setTitle('Not found');
    WS.app.render('<div class="view view-narrow"><div class="card"><div class="empty">' + icon('search', 36) +
      '<h2>Page not found</h2><p>' + esc(typeof message === 'string' ? message : 'That address does not match anything in this workspace.') +
      '</p><a class="btn btn-primary" href="#/home">Go to Home</a></div></div></div>');
  };

  WS.list = { rowHTML, compactItem, bindRowActions, emptyHTML };
})();
