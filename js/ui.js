/* UI primitives: toasts, modal dialogs, popover menus, tag input. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);

  /* ---------- Toasts ---------- */
  function toast(message, type, ms, action) {
    const root = document.getElementById('toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = '<span>' + esc(message) + '</span>';
    if (action) {
      const b = document.createElement('button');
      b.className = 'undo';
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.onClick(); el.remove(); });
      el.appendChild(b);
    }
    root.appendChild(el);
    setTimeout(() => el.remove(), ms || (action ? 6000 : 3000));
  }

  /* ---------- Clipboard ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  /* ---------- Dialog ----------
     opts: { title, body (string|Node), confirmText, cancelText, danger, hideCancel, collect(bodyEl) }
     Resolves with collect()'s value (or true) on confirm, and null on cancel. */
  function dialog(opts) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<form class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" novalidate>' +
        '<div class="modal-head"><h2 id="modal-title">' + esc(opts.title || '') + '</h2>' +
        '<button type="button" class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
        '<div class="modal-body"></div>' +
        '<div class="modal-foot"></div>' +
      '</form>';
    const form = overlay.querySelector('form');
    const body = overlay.querySelector('.modal-body');
    const foot = overlay.querySelector('.modal-foot');

    if (opts.body instanceof Node) body.appendChild(opts.body);
    else body.innerHTML = opts.body || '';

    if (!opts.hideCancel) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = opts.cancelText || 'Cancel';
      cancel.setAttribute('data-close', '');
      foot.appendChild(cancel);
    }
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    ok.textContent = opts.confirmText || 'OK';
    foot.appendChild(ok);

    const prevFocus = document.activeElement;
    let finish;
    const result = new Promise((r) => { finish = r; });

    function close(value) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
      finish(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    }
    document.addEventListener('keydown', onKey, true);

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    overlay.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(null); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (opts.collect) {
        const v = opts.collect(body);
        if (v === undefined) return;
        close(v);
      } else {
        close(true);
      }
    });

    root.appendChild(overlay);
    const focusTarget = body.querySelector('input:not([type=radio]), select, textarea') || body.querySelector('input') || ok;
    setTimeout(() => { focusTarget.focus(); if (focusTarget.select && focusTarget.type === 'text') focusTarget.select(); }, 0);
    return result;
  }

  function confirmDialog(opts) {
    return dialog({
      title: opts.title,
      body: '<p>' + esc(opts.message || '') + '</p>',
      confirmText: opts.confirmText || 'Confirm',
      danger: !!opts.danger
    }).then((v) => v === true);
  }

  /* fields: [{ name, label, type: 'text'|'select'|'radio', value, options: [{value,label,hint}], placeholder, required }] */
  function formDialog(opts) {
    const fields = opts.fields || [];
    let html = opts.message ? '<p style="margin-bottom:14px">' + esc(opts.message) + '</p>' : '';
    fields.forEach((f, i) => {
      const id = 'mf-' + i;
      html += '<div class="mfield">';
      if (f.type === 'radio') {
        html += '<span class="mlabel">' + esc(f.label) + '</span>';
        (f.options || []).forEach((o) => {
          html += '<label class="radio-opt"><input type="radio" name="' + esc(f.name) + '" value="' + esc(o.value) + '"' +
            (String(o.value) === String(f.value) ? ' checked' : '') + '><span>' + esc(o.label) +
            (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</span></label>';
        });
      } else if (f.type === 'select') {
        html += '<label class="mlabel" for="' + id + '">' + esc(f.label) + '</label><select class="select" id="' + id + '" name="' + esc(f.name) + '">';
        (f.options || []).forEach((o) => {
          html += '<option value="' + esc(o.value) + '"' + (String(o.value) === String(f.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        });
        html += '</select>';
      } else {
        html += '<label class="mlabel" for="' + id + '">' + esc(f.label) + '</label><input class="input" id="' + id + '" type="text" name="' +
          esc(f.name) + '" value="' + esc(f.value || '') + '" placeholder="' + esc(f.placeholder || '') + '" autocomplete="off">';
      }
      html += '<div class="field-error" hidden></div></div>';
    });

    return dialog({
      title: opts.title,
      body: html,
      confirmText: opts.confirmText || 'Save',
      danger: !!opts.danger,
      collect(bodyEl) {
        const out = {};
        let valid = true;
        fields.forEach((f, i) => {
          const wrap = bodyEl.querySelectorAll('.mfield')[i];
          const err = wrap.querySelector('.field-error');
          let value;
          if (f.type === 'radio') {
            const checked = bodyEl.querySelector('input[name="' + f.name + '"]:checked');
            value = checked ? checked.value : '';
          } else {
            value = wrap.querySelector('input, select').value;
            if (f.type !== 'select') value = value.trim();
          }
          let message = '';
          if (f.required && !value) message = f.requiredMessage || (f.label + ' is required.');
          else if (f.validate) message = f.validate(value) || '';
          if (message) {
            err.textContent = message;
            err.hidden = false;
            valid = false;
          } else {
            err.hidden = true;
          }
          out[f.name] = value;
        });
        return valid ? out : undefined;
      }
    });
  }

  /* ---------- Popover menu ----------
     items: [{ label, icon, danger, onClick } | { divider: true }] */
  let openMenu = null;
  function closeMenu() {
    if (!openMenu) return;
    document.removeEventListener('mousedown', openMenu.onDown, true);
    document.removeEventListener('keydown', openMenu.onKey, true);
    window.removeEventListener('resize', closeMenu);
    openMenu.anchor.setAttribute('aria-expanded', 'false');
    openMenu.el.remove();
    openMenu = null;
  }

  function menu(anchor, items) {
    const wasOpenOnSame = openMenu && openMenu.anchor === anchor;
    closeMenu();
    if (wasOpenOnSame) return;

    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    items.forEach((it) => {
      if (it.divider) { el.appendChild(document.createElement('hr')); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (it.danger) b.className = 'danger';
      b.innerHTML = (it.icon ? icon(it.icon, 16) : '') + '<span>' + esc(it.label) + '</span>';
      b.addEventListener('click', () => { closeMenu(); it.onClick && it.onClick(); });
      el.appendChild(b);
    });
    document.body.appendChild(el);

    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';

    const buttons = () => Array.from(el.querySelectorAll('button'));
    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); anchor.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = buttons();
        const i = list.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next].focus();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', closeMenu);
    anchor.setAttribute('aria-expanded', 'true');
    openMenu = { el, anchor, onDown, onKey };
    const first = buttons()[0];
    if (first) first.focus();
  }

  /* ---------- Tags input ----------
     Returns { getTags, setTags }. */
  function tagsInput(container, opts) {
    opts = opts || {};
    let tags = (opts.tags || []).slice();
    const listId = 'tags-list-' + WS.util.uid();

    container.classList.add('tags-input');
    container.innerHTML = '<input type="text" placeholder="' + esc(opts.placeholder || 'Add tag…') + '" aria-label="' +
      esc(opts.label || 'Add tag') + '" list="' + listId + '" autocomplete="off">' +
      '<datalist id="' + listId + '">' + (opts.suggestions || []).map((s) => '<option value="' + esc(s) + '">').join('') + '</datalist>';
    const input = container.querySelector('input');

    function paint() {
      container.querySelectorAll('.tag').forEach((n) => n.remove());
      tags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'tag';
        chip.innerHTML = esc(t) + '<button type="button" aria-label="Remove tag ' + esc(t) + '">' + icon('x', 12) + '</button>';
        chip.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          tags = tags.filter((x) => x !== t);
          paint();
          opts.onChange && opts.onChange(tags.slice());
          input.focus();
        });
        container.insertBefore(chip, input);
      });
    }
    function add(raw) {
      const t = String(raw).trim().replace(/^#/, '').replace(/,+$/, '').trim();
      if (!t) return false;
      if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
        tags.push(t);
        paint();
        opts.onChange && opts.onChange(tags.slice());
      }
      return true;
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (add(input.value)) input.value = '';
      } else if (e.key === 'Backspace' && !input.value && tags.length) {
        tags.pop();
        paint();
        opts.onChange && opts.onChange(tags.slice());
      }
    });
    input.addEventListener('input', () => {
      if (input.value.indexOf(',') !== -1) {
        input.value.split(',').forEach(add);
        input.value = '';
      }
    });
    input.addEventListener('blur', () => { if (add(input.value)) input.value = ''; });
    container.addEventListener('click', (e) => { if (e.target === container) input.focus(); });
    paint();

    return {
      getTags() { add(input.value); input.value = ''; return tags.slice(); },
      setTags(next) { tags = next.slice(); paint(); }
    };
  }

  WS.ui = {
    toast, copyText, dialog, confirm: confirmDialog, form: formDialog, menu, closeMenu, tagsInput
  };
})();
