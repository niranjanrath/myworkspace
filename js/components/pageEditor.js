/* Page editor: Markdown source + live preview, formatting toolbar, autosave to LocalStorage. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);
  WS.views = WS.views || {};

  const TOOLS = [
    ['bold', 'bold', 'Bold (Ctrl+B)'], ['italic', 'italic', 'Italic (Ctrl+I)'], ['heading', 'heading', 'Heading'], '|',
    ['list', 'list', 'Bulleted list'], ['ordered', 'listOrdered', 'Numbered list'], ['task', 'checkSquare', 'Task list'], ['quote', 'quote', 'Quote'], '|',
    ['code', 'code', 'Code'], ['link', 'link', 'Link']
  ];

  WS.views.edit = function (params) {
    const page = WS.pages.get(params.id);
    if (!page) return WS.views.notFound('This page was deleted or never existed.');
    const id = page.id;
    WS.app.setTitle('Editing ' + page.title);

    const settings = WS.storage.getSettings();
    let view = WS.util.isPhone() ? 'write' : (settings.editorView === 'write' ? 'write' : 'split');

    const main = WS.app.render(
      '<div class="editor" data-view="' + view + '">' +
        '<div class="editor-bar">' +
          '<button class="icon-btn" type="button" data-act="back" aria-label="Back to page">' + icon('arrowLeft', 20) + '</button>' +
          '<h1>Edit page</h1>' +
          '<span class="editor-status" id="status" aria-live="polite"></span>' +
          '<span class="editor-status hide-mobile" id="words"></span>' +
          '<span style="flex:1"></span>' +
          '<button class="btn" type="button" id="preview-btn" data-act="preview"></button>' +
          '<button class="btn btn-primary" type="button" data-act="save">Save</button>' +
          '<button class="icon-btn" type="button" data-act="more" aria-haspopup="menu" aria-label="More actions">' + icon('more') + '</button>' +
        '</div>' +
        '<div class="editor-meta">' +
          '<div class="field-inline"><label for="space-select">Space</label><select class="select" id="space-select">' +
            WS.pages.spaces().map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select></div>' +
          '<div class="field-inline tags-field"><label>Tags</label><div id="tags" style="flex:1"></div></div>' +
        '</div>' +
        '<div class="editor-toolbar" role="toolbar" aria-label="Formatting">' +
          TOOLS.map((t) => t === '|' ? '<span class="sep"></span>' :
            '<button class="icon-btn sm" type="button" data-fmt="' + t[0] + '" title="' + t[2] + '" aria-label="' + t[2] + '">' + icon(t[1], 17) + '</button>').join('') +
        '</div>' +
        '<div class="editor-panes">' +
          '<section class="pane pane-edit"><div class="pane-label">Markdown</div>' +
            '<textarea class="editor-textarea" id="ta" spellcheck="true" aria-label="Markdown source"></textarea></section>' +
          '<section class="pane pane-preview"><div class="pane-label">Preview</div>' +
            '<div class="preview-scroll" id="preview-scroll"><div class="markdown-body" id="preview"></div></div></section>' +
        '</div>' +
      '</div>', 'editor-mode');

    const root = main.querySelector('.editor');
    const ta = main.querySelector('#ta');
    const preview = main.querySelector('#preview');
    const previewScroll = main.querySelector('#preview-scroll');
    const status = main.querySelector('#status');
    const wordsEl = main.querySelector('#words');
    const spaceSel = main.querySelector('#space-select');
    const previewBtn = main.querySelector('#preview-btn');

    ta.value = page.content;
    spaceSel.value = page.spaceId;

    const tagsCtl = WS.ui.tagsInput(main.querySelector('#tags'), {
      tags: page.tags,
      suggestions: WS.pages.allTags().map((t) => t.tag),
      placeholder: 'Add tag and press Enter',
      onChange(tags) { WS.pages.update(id, { tags }); flashSaved(); }
    });

    /* ---------- Status + preview ---------- */
    function flashSaved() { status.textContent = 'All changes saved'; status.classList.remove('saving'); }
    function updateWords() {
      const n = WS.md.wordCount(ta.value);
      wordsEl.textContent = n + (n === 1 ? ' word' : ' words');
    }
    const renderPreview = WS.util.debounce(() => { preview.innerHTML = WS.md.render(ta.value).html; }, 120);

    function updatePreviewBtn() {
      if (WS.util.isPhone()) {
        previewBtn.innerHTML = view === 'preview' ? icon('edit', 16) + '<span>Edit</span>' : icon('eye', 16) + '<span>Preview</span>';
        previewBtn.removeAttribute('aria-pressed');
      } else {
        previewBtn.innerHTML = icon('eye', 16) + '<span>Preview</span>';
        previewBtn.setAttribute('aria-pressed', String(view !== 'write'));
      }
    }

    function togglePreview() {
      if (WS.util.isPhone()) view = view === 'preview' ? 'write' : 'preview';
      else {
        view = view === 'split' ? 'write' : 'split';
        WS.storage.saveSettings({ editorView: view });
      }
      root.setAttribute('data-view', view);
      updatePreviewBtn();
      if (view !== 'write') { renderPreview.cancel(); preview.innerHTML = WS.md.render(ta.value).html; }
    }

    /* ---------- Autosave ---------- */
    function persist() {
      const p = WS.pages.get(id);
      if (!p) return;
      if (p.content !== ta.value) WS.pages.update(id, { content: ta.value });
      flashSaved();
    }
    const autosave = WS.util.debounce(persist, 500);

    ta.addEventListener('input', () => {
      status.textContent = 'Saving…';
      status.classList.add('saving');
      autosave();
      renderPreview();
      updateWords();
    });

    spaceSel.addEventListener('change', () => {
      WS.pages.update(id, { spaceId: spaceSel.value });
      WS.storage.saveSettings({ lastSpaceId: spaceSel.value });
      flashSaved();
    });

    const flushOnHide = () => { autosave.cancel(); persist(); };
    window.addEventListener('pagehide', flushOnHide);

    /* ---------- Text manipulation ---------- */
    function replaceRange(start, end, text, selStart, selEnd) {
      ta.focus();
      ta.setSelectionRange(start, end);
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok) {
        ta.setRangeText(text, start, end, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (selStart != null) ta.setSelectionRange(selStart, selEnd == null ? selStart : selEnd);
    }

    function wrap(before, after, placeholder) {
      const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
      const chosen = v.slice(s, e) || placeholder;
      if (s !== e && v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
        replaceRange(s - before.length, e + after.length, chosen, s - before.length, s - before.length + chosen.length);
        return;
      }
      replaceRange(s, e, before + chosen + after, s + before.length, s + before.length + chosen.length);
    }

    function lineBounds() {
      const v = ta.value;
      let s = ta.selectionStart, e = ta.selectionEnd;
      if (e > s && v[e - 1] === '\n') e--;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', e);
      if (le === -1) le = v.length;
      return { ls, le };
    }

    function prefixLines(prefix, opts) {
      opts = opts || {};
      const { ls, le } = lineBounds();
      const lines = ta.value.slice(ls, le).split('\n');
      const has = (l) => (opts.ordered ? /^\d+\.\s/.test(l) : l.indexOf(prefix) === 0);
      const remove = lines.every(has);
      const out = lines.map((l, i) => {
        if (remove) return opts.ordered ? l.replace(/^\d+\.\s/, '') : l.slice(prefix.length);
        const base = opts.strip ? l.replace(opts.strip, '') : l;
        return (opts.ordered ? (i + 1) + '. ' : prefix) + base;
      }).join('\n');
      replaceRange(ls, le, out, ls, ls + out.length);
    }

    function indentLines(outdent) {
      const { ls, le } = lineBounds();
      const lines = ta.value.slice(ls, le).split('\n');
      const out = lines.map((l) => outdent ? l.replace(/^ {1,2}/, '') : '  ' + l).join('\n');
      replaceRange(ls, le, out, ls, ls + out.length);
    }

    function format(kind) {
      switch (kind) {
        case 'bold': wrap('**', '**', 'bold text'); break;
        case 'italic': wrap('*', '*', 'italic text'); break;
        case 'heading': prefixLines('## ', { strip: /^#{1,6}\s+/ }); break;
        case 'list': prefixLines('- '); break;
        case 'ordered': prefixLines('', { ordered: true }); break;
        case 'task': prefixLines('- [ ] '); break;
        case 'quote': prefixLines('> '); break;
        case 'code': {
          const s = ta.selectionStart, e = ta.selectionEnd;
          const chosen = ta.value.slice(s, e);
          if (chosen.indexOf('\n') !== -1) replaceRange(s, e, '```\n' + chosen + '\n```', s + 4, s + 4 + chosen.length);
          else wrap('`', '`', 'code');
          break;
        }
        case 'link': {
          const s = ta.selectionStart, e = ta.selectionEnd;
          const text = ta.value.slice(s, e) || 'link text';
          const url = 'https://';
          replaceRange(s, e, '[' + text + '](' + url + ')', s + text.length + 3, s + text.length + 3 + url.length);
          break;
        }
        default: break;
      }
    }

    main.querySelector('.editor-toolbar').addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-fmt]')) e.preventDefault(); // keep textarea focus/selection
    });
    main.querySelector('.editor-toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fmt]');
      if (b) format(b.getAttribute('data-fmt'));
    });

    ta.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); format('bold'); return; }
      if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); format('italic'); return; }
      if (e.key === 'Escape') { ta.blur(); return; } // lets keyboard users Tab out of the editor

      if (e.key === 'Tab' && !mod && !e.altKey) {
        e.preventDefault();
        const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).indexOf('\n') !== -1;
        if (multi || e.shiftKey) indentLines(e.shiftKey);
        else replaceRange(ta.selectionStart, ta.selectionEnd, '  ', ta.selectionStart + 2);
        return;
      }

      // Continue lists on Enter
      if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey && ta.selectionStart === ta.selectionEnd) {
        const pos = ta.selectionStart;
        const v = ta.value;
        const ls = v.lastIndexOf('\n', pos - 1) + 1;
        const line = v.slice(ls, pos);
        const m = /^(\s*)([-*+]|\d+\.)\s(\[[ xX]\]\s)?/.exec(line);
        if (m) {
          e.preventDefault();
          if (!line.slice(m[0].length).trim()) { replaceRange(ls, pos, '', ls); return; }
          const marker = /\d/.test(m[2]) ? (parseInt(m[2], 10) + 1) + '.' : m[2];
          replaceRange(pos, pos, '\n' + m[1] + marker + ' ' + (m[3] ? '[ ] ' : ''));
        }
      }
    });

    ta.addEventListener('scroll', () => {
      if (view === 'write' || WS.util.isPhone()) return;
      const max = ta.scrollHeight - ta.clientHeight;
      if (max <= 0) return;
      previewScroll.scrollTop = (ta.scrollTop / max) * (previewScroll.scrollHeight - previewScroll.clientHeight);
    });

    /* ---------- Buttons ---------- */
    function leaveTarget() {
      const p = WS.pages.get(id);
      return p && !(p.draft && WS.md.isBlank(ta.value)) ? '/page/' + encodeURIComponent(id) : '/home';
    }
    function save() {
      autosave.cancel();
      persist();
      const target = leaveTarget();
      WS.ui.toast(target === '/home' ? 'Empty page discarded' : 'Saved');
      WS.router.navigate(target);
    }

    main.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.getAttribute('data-act');
      if (a === 'back') { autosave.cancel(); persist(); WS.router.navigate(leaveTarget()); }
      else if (a === 'save') save();
      else if (a === 'preview') togglePreview();
      else if (a === 'more') {
        WS.ui.menu(b, [
          { label: 'Export as Markdown', icon: 'download', onClick: () => { persist(); WS.pages.exportPage(WS.pages.get(id)); } },
          { label: 'Copy Markdown', icon: 'copy', onClick: () => WS.ui.copyText(ta.value).then(() => WS.ui.toast('Markdown copied')) },
          { divider: true },
          { label: 'Delete page', icon: 'trash', danger: true, onClick: () => WS.actions.deletePage(id) }
        ]);
      }
    });

    /* ---------- Initial paint ---------- */
    updatePreviewBtn();
    updateWords();
    flashSaved();
    if (view !== 'write') preview.innerHTML = WS.md.render(ta.value).html;

    if (page.draft) {
      ta.focus();
      const caret = /^# \n/.test(ta.value) ? 2 : ta.value.length;
      ta.setSelectionRange(caret, caret);
    } else if (!WS.util.isPhone()) {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(0, 0);
    }

    /* ---------- Cleanup when leaving ---------- */
    return function cleanup() {
      window.removeEventListener('pagehide', flushOnHide);
      autosave.cancel();
      renderPreview.cancel();
      persist();
      const p = WS.pages.get(id);
      if (p && p.draft && WS.md.isBlank(p.content)) WS.pages.remove(id);
    };
  };
})();
