/* Pages + spaces: CRUD, queries, import/export, backup restore, first-run sample content. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const store = () => WS.storage;

  const DEFAULT_SPACES = [
    ['personal', 'Personal'], ['work', 'Work'], ['ideas', 'Ideas'],
    ['learning', 'Learning'], ['projects', 'Projects'], ['archive', 'Archive']
  ];

  const P = {
    /* ---------- Startup ---------- */
    init() {
      if (!store().hasData()) P.seed();
      const d = store().getData();
      // Remove blank drafts left behind (e.g. tab closed mid-creation).
      d.pages = d.pages.filter((p) => !(p.draft && WS.md.isBlank(p.content)));
      // Every page must belong to an existing space.
      if (!d.spaces.length) d.spaces.push({ id: 'personal', name: 'Personal', createdAt: Date.now() });
      const ids = new Set(d.spaces.map((s) => s.id));
      d.pages.forEach((p) => { if (!ids.has(p.spaceId)) p.spaceId = d.spaces[0].id; });
      store().saveData();
    },

    /* ---------- Reads ---------- */
    all() { return store().getData().pages.filter((p) => !p.draft); },
    get(id) { return store().getData().pages.find((p) => p.id === id) || null; },
    findByTitle(title) {
      const t = String(title).trim().toLowerCase();
      return P.all().find((p) => p.title.toLowerCase() === t) || null;
    },
    favorites() { return P.all().filter((p) => p.favorite).sort((a, b) => b.updatedAt - a.updatedAt); },
    recent(limit) {
      const list = P.all().sort((a, b) => b.updatedAt - a.updatedAt);
      return limit ? list.slice(0, limit) : list;
    },
    inSpace(spaceId) { return P.all().filter((p) => p.spaceId === spaceId).sort((a, b) => b.updatedAt - a.updatedAt); },
    allTags() {
      const counts = {};
      P.all().forEach((p) => p.tags.forEach((t) => { const k = t.toLowerCase(); counts[k] = counts[k] || { tag: t, count: 0 }; counts[k].count++; }));
      return Object.keys(counts).map((k) => counts[k]).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    },

    /* ---------- Spaces ---------- */
    spaces() { return store().getData().spaces; },
    getSpace(id) { return P.spaces().find((s) => s.id === id) || null; },
    spaceName(id) { const s = P.getSpace(id); return s ? s.name : 'No space'; },
    countInSpace(id) { return P.all().filter((p) => p.spaceId === id).length; },
    defaultSpaceId() {
      const last = store().getSettings().lastSpaceId;
      if (last && P.getSpace(last)) return last;
      const first = P.spaces()[0];
      return first ? first.id : null;
    },
    createSpace(name) {
      const space = { id: WS.util.uid(), name: String(name).trim(), createdAt: Date.now() };
      store().getData().spaces.push(space);
      store().saveData();
      return space;
    },
    renameSpace(id, name) {
      const s = P.getSpace(id);
      if (!s) return null;
      s.name = String(name).trim();
      store().saveData();
      return s;
    },
    spaceNameTaken(name, exceptId) {
      const n = String(name).trim().toLowerCase();
      return P.spaces().some((s) => s.id !== exceptId && s.name.toLowerCase() === n);
    },
    /* Deletes the space and every page in it. Returns the number of pages removed. */
    removeSpace(id) {
      const d = store().getData();
      const before = d.pages.length;
      d.pages = d.pages.filter((p) => p.spaceId !== id);
      d.spaces = d.spaces.filter((s) => s.id !== id);
      if (store().getSettings().lastSpaceId === id) store().saveSettings({ lastSpaceId: null });
      store().saveData();
      return before - d.pages.length;
    },

    /* ---------- Page writes ---------- */
    create(opts) {
      opts = opts || {};
      const now = Date.now();
      const content = opts.content || '';
      const page = {
        id: WS.util.uid(),
        title: opts.title || WS.md.deriveTitle(content),
        content,
        spaceId: opts.spaceId || P.defaultSpaceId(),
        tags: (opts.tags || []).slice(),
        favorite: !!opts.favorite,
        draft: !!opts.draft,
        createdAt: opts.createdAt || now,
        updatedAt: opts.updatedAt || now
      };
      store().getData().pages.push(page);
      store().saveData();
      return page;
    },

    /* patch: any page fields. opts.touch=false keeps updatedAt (e.g. toggling a favorite). */
    update(id, patch, opts) {
      const page = P.get(id);
      if (!page) return null;
      Object.assign(page, patch);
      if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
        page.title = WS.md.deriveTitle(page.content);
        if (!WS.md.isBlank(page.content)) page.draft = false;
      }
      if (!opts || opts.touch !== false) page.updatedAt = Date.now();
      store().saveData();
      return page;
    },

    remove(id) {
      const d = store().getData();
      const page = d.pages.find((p) => p.id === id);
      d.pages = d.pages.filter((p) => p.id !== id);
      store().saveData();
      return page || null;
    },

    restore(page) {
      const d = store().getData();
      if (!d.pages.some((p) => p.id === page.id)) d.pages.push(page);
      store().saveData();
    },

    duplicate(id) {
      const src = P.get(id);
      if (!src) return null;
      const content = src.content.replace(/^(\s*#\s+)(.+)$/m, (m, hashes, t) => hashes + t + ' (copy)');
      return P.create({ content: content === src.content ? src.content + '\n' : content, spaceId: src.spaceId, tags: src.tags });
    },

    toggleFavorite(id) {
      const page = P.get(id);
      if (!page) return false;
      page.favorite = !page.favorite;
      store().saveData();
      return page.favorite;
    },

    /* ---------- Markdown import / export ---------- */
    importMarkdown(fileName, text, spaceId) {
      const parsed = WS.md.parseFrontMatter(text);
      let content = parsed.body;
      if (!WS.md.extractTitle(content)) {
        const name = String(fileName || 'Imported page').replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported page';
        content = '# ' + name + '\n\n' + content;
      }
      return P.create({ content, spaceId: spaceId || P.defaultSpaceId(), tags: parsed.meta.tags || [] });
    },

    toMarkdownFile(page) {
      return WS.md.buildFrontMatter(page.tags) + page.content.replace(/\s+$/, '') + '\n';
    },

    fileNameFor(page) { return WS.util.slug(page.title) + '.md'; },

    exportPage(page) {
      WS.util.download(P.fileNameFor(page), P.toMarkdownFile(page), 'text/markdown;charset=utf-8');
    },

    /* Zip of every page, grouped by space folder. */
    exportAllZip() {
      if (!window.JSZip) return Promise.reject(new Error('Zip library is missing.'));
      const zip = new window.JSZip();
      const used = {};
      P.all().forEach((page) => {
        const folder = WS.util.slug(P.spaceName(page.spaceId));
        let name = WS.util.slug(page.title);
        const key = folder + '/' + name;
        used[key] = (used[key] || 0) + 1;
        if (used[key] > 1) name += '-' + used[key];
        zip.file(folder + '/' + name + '.md', P.toMarkdownFile(page));
      });
      return zip.generateAsync({ type: 'blob' }).then((blob) => {
        WS.util.download('myworkspace-markdown-' + WS.util.todayStamp() + '.zip', blob);
        return P.all().length;
      });
    },

    /* ---------- Backup / restore ---------- */
    downloadBackup() {
      WS.util.download('myworkspace-backup-' + WS.util.todayStamp() + '.json',
        JSON.stringify(store().exportBackup(), null, 2), 'application/json');
    },

    /* mode: 'replace' | 'merge' */
    restoreBackup(obj, mode) {
      const incoming = store().normalizeData(obj.data);
      if (mode === 'merge') {
        const d = store().getData();
        incoming.spaces.forEach((s) => { if (!d.spaces.some((x) => x.id === s.id)) d.spaces.push(s); });
        incoming.pages.forEach((p) => {
          const i = d.pages.findIndex((x) => x.id === p.id);
          if (i === -1) d.pages.push(p);
          else if (p.updatedAt > d.pages[i].updatedAt) d.pages[i] = p;
        });
        store().saveData();
      } else {
        store().setData(incoming);
        if (obj.profile) store().saveProfile(obj.profile);
        if (obj.settings) store().saveSettings(obj.settings);
      }
      P.init();
      return incoming.pages.length;
    },

    resetAll() {
      store().clearAll();
      P.init();
    },

    /* ---------- Sample content (first run) ---------- */
    seed() {
      const now = Date.now();
      const H = 3600 * 1000;
      const D = 24 * H;
      const banner = (() => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 240"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9dcf4"/><stop offset="1" stop-color="#eef4fb"/></linearGradient></defs><rect width="1200" height="240" fill="url(#g)"/><path d="M0 240 210 92 320 160 520 38 700 168 830 98 1200 240z" fill="#587aa6"/><path d="M520 38 578 96 545 88 520 112 496 84 468 98z" fill="#fff" opacity=".92"/><path d="M830 98 872 142 848 136 830 156 812 132 790 142z" fill="#fff" opacity=".85"/></svg>';
        return '![Mountain range](data:image/svg+xml;base64,' + btoa(svg) + ')';
      })();

      const spaces = DEFAULT_SPACES.map((s) => ({ id: s[0], name: s[1], createdAt: now }));
      const pages = [
        {
          id: 'welcome', spaceId: 'personal', tags: ['guide'], favorite: false, ago: 30 * 60 * 1000,
          content: [
            '# Welcome to MyWorkspace',
            '',
            'Everything here is plain Markdown, saved in this browser. No account, no server.',
            '',
            '## Getting around',
            '',
            '- Use the **hamburger menu** to show or hide the sidebar. On a phone it opens as a drawer.',
            '- Group pages into **spaces** and label them with **tags**.',
            '- Press `/` or `Ctrl`+`K` to search titles, content and tags.',
            '- Link pages together with wiki links, like [[System Design Principles]]. A link to a page that does not exist yet (like [[Reading Backlog]]) creates it when you click it.',
            '',
            '## Editing',
            '',
            'Open any page and press **Edit**. Changes autosave as you type. The first `# Heading` is the page title.',
            '',
            '| Shortcut | Action |',
            '| --- | --- |',
            '| `Ctrl`+`S` | Save and close the editor |',
            '| `Ctrl`+`B` / `Ctrl`+`I` | Bold / italic |',
            '| `Tab` | Indent |',
            '',
            '## Keeping your data safe',
            '',
            'Data lives in this browser only. Download a JSON backup from **Settings** now and then, or export every page as `.md` files.',
            '',
            '- [x] Read the welcome page',
            '- [ ] Create your first page',
            '- [ ] Make a backup'
          ].join('\n')
        },
        {
          id: 'sdp', spaceId: 'work', tags: ['architecture', 'design', 'principles'], favorite: false, ago: 2 * H,
          content: [
            '# System Design Principles',
            '',
            banner,
            '',
            '> Good architecture enables change.',
            '',
            '## 1. Introduction',
            '',
            'These are the core principles I follow when designing systems.',
            '',
            '## 2. Key Principles',
            '',
            '- Start with the problem, not the technology',
            '- Design for change',
            '- Keep it simple',
            '- Make it observable',
            '- Security and privacy by design',
            '',
            '## 3. References',
            '',
            '- [C4 Model](https://c4model.com)',
            '- [[Architecture Decision Records]]',
            '- [[Team Topologies]]'
          ].join('\n')
        },
        {
          id: 'adr', spaceId: 'work', tags: ['architecture', 'decisions'], favorite: true, ago: 5 * D,
          content: [
            '# Architecture Decision Records',
            '',
            'Short notes that capture *why* a decision was made, so it is still understandable a year later.',
            '',
            '## Template',
            '',
            '```md',
            '# ADR-001: Title',
            'Status: proposed | accepted | superseded',
            'Context: what forces are at play?',
            'Decision: what did we choose?',
            'Consequences: what gets easier, what gets harder?',
            '```',
            '',
            'See also: [[System Design Principles]].'
          ].join('\n')
        },
        {
          id: 'topologies', spaceId: 'work', tags: ['architecture', 'teams'], favorite: false, ago: 9 * D,
          content: [
            '# Team Topologies',
            '',
            'Four team types: stream-aligned, enabling, complicated-subsystem and platform.',
            '',
            'Three interaction modes: collaboration, X-as-a-service and facilitating.'
          ].join('\n')
        },
        {
          id: 'network', spaceId: 'personal', tags: ['home', 'network'], favorite: false, ago: 1 * D,
          content: [
            '# Home Network Setup',
            '',
            '## Checklist',
            '',
            '- [x] Replace ISP router with own router',
            '- [x] Separate guest Wi-Fi',
            '- [ ] Move smart-home devices to their own VLAN',
            '- [ ] Set up a weekly config backup',
            '',
            '## Notes',
            '',
            '| Device | Address | Role |',
            '| --- | --- | --- |',
            '| Router | 192.168.1.1 | Gateway, DHCP |',
            '| NAS | 192.168.1.20 | Backups |'
          ].join('\n')
        },
        {
          id: 'goals', spaceId: 'personal', tags: ['goals'], favorite: true, ago: 12 * D,
          content: [
            '# Personal Goals 2026',
            '',
            '1. Ship one small side project every quarter',
            '2. Read 20 books',
            '3. Walk 8,000 steps a day',
            '',
            '## Review',
            '',
            'Review these on the first Sunday of every month.'
          ].join('\n')
        },
        {
          id: 'travel', spaceId: 'personal', tags: ['travel'], favorite: false, ago: 2 * D,
          content: [
            '# Travel Checklist',
            '',
            '- [ ] Passport and tickets',
            '- [ ] Chargers and adapters',
            '- [ ] Offline maps',
            '- [ ] Travel insurance details',
            '- [ ] Water the plants'
          ].join('\n')
        },
        {
          id: 'books', spaceId: 'learning', tags: ['books'], favorite: false, ago: 3 * D,
          content: [
            '# Book Notes',
            '',
            '## Currently reading',
            '',
            '- *A Philosophy of Software Design*: deep modules, small interfaces',
            '- *Team Topologies*: see [[Team Topologies]]',
            '',
            '## Quotes worth keeping',
            '',
            '> Complexity is anything that makes a system hard to understand and modify.'
          ].join('\n')
        },
        {
          id: 'learning-plan', spaceId: 'learning', tags: ['plan'], favorite: true, ago: 6 * D,
          content: [
            '# Learning Plan',
            '',
            '## This quarter',
            '',
            '- Event-driven architecture',
            '- Observability with OpenTelemetry',
            '',
            '## How I learn',
            '',
            'Read a little, build something small, then write it up here.'
          ].join('\n')
        }
      ];

      store().setData({
        spaces,
        pages: pages.map((p) => ({
          id: p.id, title: WS.md.deriveTitle(p.content), content: p.content, spaceId: p.spaceId, tags: p.tags,
          favorite: p.favorite, draft: false, createdAt: now - p.ago - 2 * D, updatedAt: now - p.ago
        }))
      });
    }
  };

  WS.pages = P;
})();
