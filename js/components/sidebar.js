/* Sidebar navigation (desktop) that doubles as the mobile drawer.
   Contains profile card, main navigation, spaces, and footer actions. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);

  let el;

  function navItem(href, ic, label, active, count) {
    return '<a class="nav-item' + (active ? ' active' : '') + '" href="' + href + '"' + (active ? ' aria-current="page"' : '') + '>' +
      icon(ic, 18) + '<span class="label">' + esc(label) + '</span>' +
      (count != null ? '<span class="count">' + count + '</span>' : '') + '</a>';
  }

  function render() {
    if (!el) return;
    const route = WS.router.current();
    const pat = route.pattern;
    const profile = WS.storage.getProfile();
    const spaces = WS.pages.spaces();

    let activeSpace = null;
    if (pat === '/space/:id') activeSpace = route.params.id;
    else if (pat === '/page/:id' || pat === '/page/:id/edit') {
      const p = WS.pages.get(route.params.id);
      activeSpace = p ? p.spaceId : null;
    }

    const avatar = profile.photo ? '<img src="' + esc(profile.photo) + '" alt="">' : esc(WS.util.initials(profile.name));
    const dark = document.documentElement.dataset.theme === 'dark';

    el.innerHTML =
      '<div class="sb-top">' +
        '<a class="sb-profile" href="#/profile">' +
          '<span class="avatar">' + avatar + '</span>' +
          '<span><div class="name">' + esc(profile.name || 'Your profile') + '</div>' +
          '<div class="sub">' + (profile.name ? 'View profile' : 'Add your details') + '</div></span>' +
        '</a>' +
        '<button class="icon-btn sb-drawer-close" type="button" data-action="close" aria-label="Close navigation">' + icon('x', 20) + '</button>' +
      '</div>' +
      '<div class="sb-scroll thin-scroll">' +
      '<nav aria-label="Main">' +
        navItem('#/home', 'home', 'Home', pat === '/home') +
        navItem('#/pages', 'file', 'All Pages', pat === '/pages') +
        navItem('#/favorites', 'star', 'Favorites', pat === '/favorites') +
        navItem('#/recent', 'clock', 'Recent', pat === '/recent') +
      '</nav>' +
      '<div class="sb-section"><span>Spaces</span>' +
        '<button class="icon-btn sm" type="button" data-action="add-space" aria-label="Create space">' + icon('plus', 16) + '</button></div>' +
      '<nav aria-label="Spaces">' +
        (spaces.length ? spaces.map((s) => navItem('#/space/' + encodeURIComponent(s.id), 'folder', s.name, activeSpace === s.id, WS.pages.countInSpace(s.id))).join('')
          : '<p style="padding:6px 10px;color:var(--text-3);font-size:13px">No spaces yet.</p>') +
      '</nav>' +
      '</div>' +
      '<div class="sb-footer">' +
        navItem('#/settings', 'settings', 'Settings', pat === '/settings') +
        '<button class="nav-item" type="button" data-action="theme">' + icon(dark ? 'sun' : 'moon', 18) + '<span class="label">' + (dark ? 'Light theme' : 'Dark theme') + '</span></button>' +
        '<button class="nav-item" type="button" data-action="export-all">' + icon('download', 18) + '<span class="label">Export all (Markdown)</span></button>' +
        '<button class="nav-item" type="button" data-action="about">' + icon('info', 18) + '<span class="label">About</span></button>' +
      '</div>';
  }

  function isOpen() {
    return WS.util.isMobile() ? document.body.classList.contains('sidebar-open') : !document.body.classList.contains('sidebar-collapsed');
  }

  function close() {
    document.body.classList.remove('sidebar-open');
    WS.header.syncToggle();
  }

  WS.sidebar = {
    mount() {
      el = document.getElementById('sidebar');
      if (WS.storage.getSettings().sidebarCollapsed) document.body.classList.add('sidebar-collapsed');
      render();

      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          const a = btn.getAttribute('data-action');
          if (a === 'close') close();
          else if (a === 'add-space') { close(); WS.actions.newSpace(); }
          else if (a === 'theme') WS.theme.toggle();
          else if (a === 'export-all') { close(); WS.actions.exportAll(); }
          else if (a === 'about') { close(); WS.actions.about(); }
          return;
        }
        if (e.target.closest('a')) close();
      });
      document.getElementById('scrim').addEventListener('click', close);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) { close(); }
      });

      WS.router.onChange(() => { render(); if (WS.util.isMobile()) close(); });
      WS.storage.on(() => render());
    },

    toggle() {
      if (WS.util.isMobile()) {
        document.body.classList.toggle('sidebar-open');
        if (document.body.classList.contains('sidebar-open')) {
          const first = el.querySelector('a, button');
          if (first) first.focus();
        }
      } else {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        WS.storage.saveSettings({ sidebarCollapsed: collapsed });
      }
      WS.header.syncToggle();
    },

    close,
    isOpen,
    render
  };
})();
