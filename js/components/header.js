/* Top bar: hamburger, brand, search (with live results), Create menu, theme, avatar. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);

  let el, input, panel, wrap;
  let hits = [];
  let active = -1;

  function avatarHTML(size) {
    const p = WS.storage.getProfile();
    return p.photo ? '<img src="' + esc(p.photo) + '" alt="">' : esc(WS.util.initials(p.name));
  }

  function render() {
    const themeIcon = document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon';
    const p = WS.storage.getProfile();
    el.innerHTML =
      '<div class="header-left">' +
        '<button class="icon-btn" id="nav-toggle" type="button" aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false">' + icon('menu', 20) + '</button>' +
        '<a class="brand" href="#/home"><span class="brand-mark">' + icon('file', 15) + '</span><span>MyWorkspace</span></a>' +
      '</div>' +
      '<div class="search" id="search" role="search">' +
        '<button class="icon-btn search-toggle" id="search-toggle" type="button" aria-label="Search pages">' + icon('search', 20) + '</button>' +
        '<div class="search-box">' + icon('search', 16) +
          '<input id="search-input" type="search" placeholder="Search pages…" autocomplete="off" aria-label="Search pages" aria-controls="search-panel">' +
          '<kbd aria-hidden="true">/</kbd></div>' +
        '<div class="search-panel" id="search-panel" hidden></div>' +
      '</div>' +
      '<div class="header-right">' +
        '<button class="btn btn-primary btn-sm" id="create-btn" type="button" aria-haspopup="menu" aria-expanded="false">' + icon('plus', 16) + '<span class="header-hide-mobile">Create</span></button>' +
        '<button class="icon-btn header-hide-mobile" id="theme-btn" type="button" aria-label="Switch theme">' + icon(themeIcon, 19) + '</button>' +
        '<a class="avatar sm header-hide-mobile" href="#/profile" aria-label="Your profile' + (p.name ? ': ' + esc(p.name) : '') + '">' + avatarHTML() + '</a>' +
      '</div>';

    input = el.querySelector('#search-input');
    panel = el.querySelector('#search-panel');
    wrap = el.querySelector('#search');
    bindSearch();
    syncToggle();
  }

  function syncToggle() {
    const btn = el.querySelector('#nav-toggle');
    if (!btn) return;
    const open = WS.util.isMobile() ? document.body.classList.contains('sidebar-open') : !document.body.classList.contains('sidebar-collapsed');
    btn.setAttribute('aria-expanded', String(open));
  }

  /* ---------- Search ---------- */
  function hidePanel() {
    panel.hidden = true;
    panel.innerHTML = '';
    hits = [];
    active = -1;
  }

  function setActive(i) {
    active = i;
    panel.querySelectorAll('.search-hit').forEach((n, idx) => n.classList.toggle('active', idx === i));
    const node = panel.querySelectorAll('.search-hit')[i];
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }

  function paintPanel(q) {
    if (!hits.length) {
      panel.innerHTML = '<div class="search-empty">No pages match “' + esc(q) + '”.</div>';
      panel.hidden = false;
      return;
    }
    panel.innerHTML = hits.map((h) =>
      '<a class="search-hit" href="#/page/' + esc(h.page.id) + '">' +
        '<div class="t">' + h.titleHtml + '</div>' +
        '<div class="m"><span class="chip-space">' + icon('folder', 13) + esc(WS.pages.spaceName(h.page.spaceId)) + '</span></div>' +
        (h.snippet ? '<div class="s">' + h.snippet + '</div>' : '') +
      '</a>').join('') +
      '<a class="search-hit" href="#/search/' + encodeURIComponent(q) + '"><div class="t">See all results for “' + esc(q) + '”</div></a>';
    panel.hidden = false;
    active = -1;
  }

  function bindSearch() {
    const run = WS.util.debounce(() => {
      const q = input.value.trim();
      if (!q) { hidePanel(); return; }
      hits = WS.search.query(q, 6);
      paintPanel(q);
    }, 120);

    input.addEventListener('input', run);
    input.addEventListener('focus', () => { if (input.value.trim()) run(); });
    input.addEventListener('keydown', (e) => {
      const links = panel.querySelectorAll('.search-hit');
      if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); setActive((active + 1) % links.length); }
      else if (e.key === 'ArrowUp' && links.length) { e.preventDefault(); setActive((active - 1 + links.length) % links.length); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        run.cancel();
        if (active >= 0 && links[active]) links[active].click();
        else WS.router.navigate('/search/' + encodeURIComponent(q));
        hidePanel();
        input.blur();
      } else if (e.key === 'Escape') {
        hidePanel();
        input.blur();
        wrap.classList.remove('open');
      }
    });
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) { hidePanel(); input.blur(); } });

    el.querySelector('#search-toggle').addEventListener('click', () => {
      wrap.classList.add('open');
      input.focus();
    });
  }

  function onRoute(route) {
    if (!input) return;
    hidePanel();
    wrap.classList.remove('open');
    input.value = route.pattern === '/search/:q' ? route.params.q : '';
  }

  WS.header = {
    mount() {
      el = document.getElementById('header');
      render();
      document.addEventListener('mousedown', (e) => {
        if (wrap && !wrap.contains(e.target)) { hidePanel(); wrap.classList.remove('open'); }
      });

      el.addEventListener('click', (e) => {
        if (e.target.closest('#nav-toggle')) { WS.sidebar.toggle(); return; }
        if (e.target.closest('#theme-btn')) { WS.theme.toggle(); return; }
        const create = e.target.closest('#create-btn');
        if (create) {
          WS.ui.menu(create, [
            { label: 'New page', icon: 'filePlus', onClick: () => WS.actions.newPage({}) },
            { label: 'New space', icon: 'folderPlus', onClick: () => WS.actions.newSpace() },
            { label: 'Import Markdown', icon: 'upload', onClick: () => WS.actions.importMarkdown() }
          ]);
        }
      });

      WS.router.onChange(onRoute);
      WS.storage.on((evt) => {
        if (evt.type === 'profile' || evt.type === 'settings' || evt.type === 'external') {
          const q = input ? input.value : '';
          render();
          input.value = q;
        }
      });
    },
    focusSearch() {
      if (WS.util.isPhone()) wrap.classList.add('open');
      input.focus();
      input.select();
    },
    syncToggle,
    refreshTheme: render
  };
})();
