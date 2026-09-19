/* Search across page titles, tags and content. All terms must match (AND).
   "tag:design" restricts to a tag. Results are ranked title > tag > content. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});

  function parse(q) {
    const terms = [];
    const tags = [];
    String(q || '').trim().split(/\s+/).filter(Boolean).forEach((tok) => {
      const m = /^tag:(.+)$/i.exec(tok);
      if (m) tags.push(m[1].toLowerCase());
      else terms.push(tok.toLowerCase());
    });
    return { terms, tags };
  }

  function highlight(text, terms) {
    const safe = WS.util.esc(text);
    if (!terms.length) return safe;
    const re = new RegExp('(' + terms.map((t) => WS.util.escRegex(WS.util.esc(t))).join('|') + ')', 'gi');
    return safe.replace(re, '<mark>$1</mark>');
  }

  function snippet(plain, terms) {
    if (!plain) return '';
    const lower = plain.toLowerCase();
    let at = -1;
    for (const t of terms) { const i = lower.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; }
    if (at === -1) return WS.util.esc(plain.slice(0, 140)) + (plain.length > 140 ? '…' : '');
    const start = Math.max(0, at - 50);
    const end = Math.min(plain.length, at + 110);
    return (start > 0 ? '…' : '') + highlight(plain.slice(start, end), terms) + (end < plain.length ? '…' : '');
  }

  WS.search = {
    parse,
    highlight,

    query(q, limit) {
      const { terms, tags } = parse(q);
      if (!terms.length && !tags.length) return [];
      const results = [];

      WS.pages.all().forEach((page) => {
        const title = page.title.toLowerCase();
        const pageTags = page.tags.map((t) => t.toLowerCase());
        let score = 0;

        for (const t of tags) {
          if (!pageTags.some((pt) => pt === t)) return;
          score += 8;
        }

        let plain = null;
        let lower = null;
        for (const t of terms) {
          let s = 0;
          if (title.includes(t)) s += title.startsWith(t) ? 15 : 10;
          if (pageTags.some((pt) => pt === t)) s += 8;
          else if (pageTags.some((pt) => pt.includes(t))) s += 4;
          if (plain === null) { plain = WS.md.plainText(page.content); lower = plain.toLowerCase(); }
          let idx = lower.indexOf(t);
          let hits = 0;
          while (idx !== -1 && hits < 5) { hits++; idx = lower.indexOf(t, idx + t.length); }
          s += hits;
          if (!s) return; // this term matched nowhere → page excluded
          score += s;
        }

        if (plain === null) plain = WS.md.plainText(page.content);
        results.push({
          page,
          score,
          titleHtml: highlight(page.title, terms),
          snippet: terms.length ? snippet(plain, terms) : WS.util.esc(plain.slice(0, 140))
        });
      });

      results.sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt);
      return limit ? results.slice(0, limit) : results;
    }
  };
})();
