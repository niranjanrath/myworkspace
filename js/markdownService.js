/* Markdown: rendering (marked + DOMPurify), title extraction, front matter, plain-text helpers.
   Markdown is the source of truth; a page's title is simply its first "# Heading". */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);

  /* ---- [[Wiki links]] → links to other pages by title ---- */
  if (window.marked && typeof marked.use === 'function') {
    marked.use({
      gfm: true,
      breaks: false,
      extensions: [{
        name: 'wikilink',
        level: 'inline',
        start(src) { return src.indexOf('[['); },
        tokenizer(src) {
          const m = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
          if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim(), label: (m[2] || m[1]).trim() };
          return undefined;
        },
        renderer(token) {
          const page = WS.pages && WS.pages.findByTitle(token.target);
          if (page) return '<a class="wikilink" href="#/page/' + esc(page.id) + '">' + esc(token.label) + '</a>';
          return '<a class="wikilink missing" href="#/home" data-create="' + esc(token.target) +
            '" title="This page does not exist yet. Click to create it.">' + esc(token.label) + '</a>';
        }
      }]
    });
  }

  function cleanInline(text) {
    return String(text || '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a)
      .replace(/[*_`~]/g, '')
      .trim();
  }

  const md = {
    isBlank(text) {
      return !String(text || '').replace(/[#\s]/g, '');
    },

    extractTitle(text) {
      const lines = String(text || '').split(/\r?\n/);
      let fence = false;
      for (const line of lines) {
        if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
        if (fence) continue;
        const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
        if (m) return cleanInline(m[1]);
      }
      return '';
    },

    deriveTitle(text) {
      const t = md.extractTitle(text);
      if (t) return t;
      const first = String(text || '').split(/\r?\n/).find((l) => l.replace(/^[#>\s\-*+]+/, '').trim());
      const plain = first ? cleanInline(first.replace(/^[#>\s\-*+]+/, '')) : '';
      return plain ? plain.slice(0, 80) : 'Untitled page';
    },

    /* Remove the leading "# Title" line (the viewer shows the title in its own header). */
    stripTitle(text) {
      const lines = String(text || '').split(/\r?\n/);
      let i = 0;
      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length && /^#\s+\S/.test(lines[i])) {
        i++;
        while (i < lines.length && !lines[i].trim()) i++;
        return lines.slice(i).join('\n');
      }
      return String(text || '');
    },

    plainText(text) {
      return String(text || '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/^\s*(```|~~~).*$/gm, ' ')
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a)
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
        .replace(/\[[ xX]\]\s/g, '')
        .replace(/[*_`~|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    },

    wordCount(text) {
      const t = md.plainText(text);
      return t ? t.split(' ').length : 0;
    },

    readingMinutes(text) {
      return Math.max(1, Math.ceil(md.wordCount(text) / 200));
    },

    /* ---- Front matter (tags only) for export / import ---- */
    parseFrontMatter(text) {
      const src = String(text || '').replace(/^\uFEFF/, '');
      const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
      if (!m) return { meta: {}, body: src };
      const meta = {};
      m[1].split(/\r?\n/).forEach((line) => {
        const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
        if (kv) meta[kv[1].toLowerCase()] = kv[2].trim();
      });
      if (typeof meta.tags === 'string') {
        meta.tags = meta.tags.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
      return { meta, body: src.slice(m[0].length).replace(/^\s*\r?\n/, '') };
    },

    buildFrontMatter(tags) {
      if (!tags || !tags.length) return '';
      return '---\ntags: [' + tags.join(', ') + ']\n---\n\n';
    },

    /* Returns { html, toc } — html is sanitized. */
    render(text, opts) {
      opts = opts || {};
      let src = String(text || '');
      if (opts.stripTitle) src = md.stripTitle(src);
      if (!src.trim()) return { html: '<p class="empty-preview">Nothing to preview yet.</p>', toc: [] };

      let html;
      try {
        html = window.marked.parse(src, { gfm: true, breaks: false });
      } catch (err) {
        console.error('Markdown render failed', err);
        html = '<pre>' + esc(src) + '</pre>';
      }
      html = window.DOMPurify.sanitize(html);

      const box = document.createElement('div');
      box.innerHTML = html;

      // Heading ids + table of contents
      const toc = [];
      const seen = {};
      box.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
        let id = WS.util.slug(h.textContent);
        seen[id] = (seen[id] || 0) + 1;
        if (seen[id] > 1) id += '-' + seen[id];
        h.id = id;
        const level = Number(h.tagName[1]);
        if (level === 2 || level === 3) toc.push({ id, level, text: h.textContent.trim() });
      });

      // External links open in a new tab
      box.querySelectorAll('a[href]').forEach((a) => {
        if (/^https?:\/\//i.test(a.getAttribute('href'))) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      });

      // Scrollable tables
      box.querySelectorAll('table').forEach((t) => {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        t.replaceWith(wrap);
        wrap.appendChild(t);
      });

      // Code blocks get a copy button
      box.querySelectorAll('pre').forEach((pre) => {
        const wrap = document.createElement('div');
        wrap.className = 'code-block';
        pre.replaceWith(wrap);
        wrap.appendChild(pre);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy';
        btn.setAttribute('aria-label', 'Copy code');
        btn.textContent = 'Copy';
        wrap.appendChild(btn);
      });

      return { html: box.innerHTML, toc };
    },

    /* Click handling for rendered content: copy buttons, in-page anchors, [[missing links]]. */
    bindInteractions(container) {
      if (container.__mdBound) return;
      container.__mdBound = true;
      container.addEventListener('click', (e) => {
        const copy = e.target.closest('.code-copy');
        if (copy) {
          const code = copy.parentElement.querySelector('pre');
          WS.ui.copyText(code ? code.textContent : '').then(() => {
            copy.textContent = 'Copied';
            setTimeout(() => { copy.textContent = 'Copy'; }, 1400);
          });
          return;
        }
        const create = e.target.closest('a[data-create]');
        if (create) {
          e.preventDefault();
          WS.actions.createPageFromLink(create.getAttribute('data-create'));
          return;
        }
        const anchor = e.target.closest('a[href^="#"]');
        if (anchor) {
          const href = anchor.getAttribute('href');
          if (href.indexOf('#/') === 0) return; // app route
          e.preventDefault();
          const id = decodeURIComponent(href.slice(1));
          const target = id && container.querySelector('[id="' + id.replace(/"/g, '\\"') + '"]');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  };

  WS.md = md;
})();
