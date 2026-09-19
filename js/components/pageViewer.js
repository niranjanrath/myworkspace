/* Page view (read mode): breadcrumb, title, actions, tags, rendered Markdown, table of contents. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);
  WS.views = WS.views || {};

  WS.views.page = function (params) {
    const page = WS.pages.get(params.id);
    if (!page || (page.draft && WS.md.isBlank(page.content))) return WS.views.notFound('This page was deleted or never existed.');

    WS.app.setTitle(page.title);
    const space = WS.pages.getSpace(page.spaceId);
    const rendered = WS.md.render(page.content, { stripTitle: true });
    const isEmpty = WS.md.isBlank(page.content) || !WS.md.stripTitle(page.content).trim();
    const editHref = '#/page/' + encodeURIComponent(page.id) + '/edit';
    const minutes = WS.md.readingMinutes(page.content);
    const starLabel = page.favorite ? 'Remove from favorites' : 'Add to favorites';

    const main = WS.app.render(
      '<div class="page-layout">' +
        '<article class="page-col">' +
          '<nav class="crumbs" aria-label="Breadcrumb">' +
            (space ? '<a href="#/space/' + encodeURIComponent(space.id) + '">' + esc(space.name) + '</a>' + icon('chevronRight', 14) : '') +
            '<span class="current">' + esc(page.title) + '</span>' +
          '</nav>' +
          '<div class="page-title-row">' +
            '<h1 class="page-title">' + esc(page.title) + '</h1>' +
            '<div class="page-actions">' +
              '<button class="icon-btn star' + (page.favorite ? ' on' : '') + '" type="button" data-act="fav" aria-pressed="' + page.favorite + '" aria-label="' + starLabel + '">' + icon('star', 20) + '</button>' +
              '<a class="btn btn-primary desktop-only" href="' + editHref + '">' + icon('edit', 16) + 'Edit</a>' +
              '<button class="icon-btn desktop-only" type="button" data-act="more" aria-haspopup="menu" aria-label="More actions">' + icon('more') + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="page-meta"><span title="' + esc(new Date(page.updatedAt).toLocaleString()) + '">Last updated: ' + WS.util.formatDate(page.updatedAt) + '</span>' +
            '<span class="dot"></span><span>' + minutes + ' min read</span></div>' +
          (page.tags.length ? '<div class="page-tags">' + page.tags.map((t) => '<a class="tag" href="#/search/' + encodeURIComponent('tag:' + t) + '">' + esc(t) + '</a>').join('') + '</div>' : '') +
          (isEmpty
            ? '<div class="empty">' + icon('edit', 36) + '<h2>This page is empty</h2><p>Write something in Markdown.</p><a class="btn btn-primary" href="' + editHref + '">Start writing</a></div>'
            : '<div class="markdown-body" id="md">' + rendered.html + '</div>') +
        '</article>' +
        (rendered.toc.length >= 2
          ? '<aside class="page-toc" aria-label="On this page"><div class="toc-title">On this page</div><nav class="toc">' +
            rendered.toc.map((t) => '<a class="l' + t.level + '" href="#' + esc(t.id) + '" data-toc="' + esc(t.id) + '">' + esc(t.text) + '</a>').join('') + '</nav></aside>'
          : '') +
      '</div>' +
      '<div class="mobile-actions">' +
        '<a class="btn btn-primary" href="' + editHref + '">' + icon('edit', 16) + 'Edit</a>' +
        '<button class="btn" type="button" data-act="share">' + icon('share', 16) + 'Share</button>' +
        '<button class="btn" type="button" data-act="more" aria-haspopup="menu">' + icon('more', 16) + 'More</button>' +
      '</div>');

    main.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.getAttribute('data-act');
      if (a === 'fav') {
        const on = WS.pages.toggleFavorite(page.id);
        act.classList.toggle('on', on);
        act.setAttribute('aria-pressed', String(on));
        act.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites');
        WS.ui.toast(on ? 'Added to favorites' : 'Removed from favorites');
      } else if (a === 'share') {
        WS.actions.sharePage(page.id);
      } else if (a === 'more') {
        WS.ui.menu(act, [
          { label: 'Export as Markdown', icon: 'download', onClick: () => WS.pages.exportPage(WS.pages.get(page.id)) },
          { label: 'Copy Markdown', icon: 'copy', onClick: () => WS.ui.copyText(WS.pages.toMarkdownFile(WS.pages.get(page.id))).then(() => WS.ui.toast('Markdown copied')) },
          { label: 'Duplicate', icon: 'copy', onClick: () => WS.actions.duplicatePage(page.id) },
          { label: 'Move to space…', icon: 'move', onClick: () => WS.actions.movePage(page.id) },
          { label: 'Print', icon: 'printer', onClick: () => window.print() },
          { divider: true },
          { label: 'Delete page', icon: 'trash', danger: true, onClick: () => WS.actions.deletePage(page.id) }
        ]);
      }
    });

    // Highlight the current section in the table of contents.
    let observer = null;
    const tocLinks = main.querySelectorAll('.toc a');
    if (tocLinks.length && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            tocLinks.forEach((l) => l.classList.toggle('active', l.getAttribute('data-toc') === en.target.id));
          }
        });
      }, { rootMargin: '-70px 0px -70% 0px' });
      rendered.toc.forEach((t) => { const h = main.querySelector('[id="' + t.id + '"]'); if (h) observer.observe(h); });
    }
    return () => { if (observer) observer.disconnect(); };
  };
})();
