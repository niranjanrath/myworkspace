/* Small shared helpers. Everything hangs off the global WS namespace so the app
   works when opened straight from disk (no ES modules → no CORS issues on file://). */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  WS.util = {
    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);
    },

    escRegex(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    formatDate(ts) {
      return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    },

    timeAgo(ts) {
      const s = Math.max(0, (Date.now() - ts) / 1000);
      if (s < 45) return 'just now';
      const m = Math.floor(s / 60);
      if (m < 60) return (m || 1) + ' min ago';
      const h = Math.floor(s / 3600);
      if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
      const d = Math.floor(s / 86400);
      if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago');
      return WS.util.formatDate(ts);
    },

    debounce(fn, ms) {
      let t = null;
      let lastArgs = null;
      const wrapped = function (...args) {
        lastArgs = args;
        clearTimeout(t);
        t = setTimeout(() => { t = null; fn(...lastArgs); }, ms);
      };
      wrapped.flush = () => { if (t) { clearTimeout(t); t = null; fn(...lastArgs); } };
      wrapped.cancel = () => { clearTimeout(t); t = null; };
      wrapped.pending = () => t !== null;
      return wrapped;
    },

    slug(text) {
      const s = String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return s || 'untitled';
    },

    initials(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    },

    todayStamp() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },

    isMobile() {
      return window.matchMedia('(max-width: 899px)').matches;
    },

    isPhone() {
      return window.matchMedia('(max-width: 699px)').matches;
    },

    download(filename, content, mime) {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },

    readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error || new Error('Could not read file'));
        r.readAsText(file);
      });
    },

    /* Center-crop an image file to a square JPEG data URL (keeps LocalStorage small). */
    imageToAvatar(file, size) {
      size = size || 256;
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')); };
        img.src = url;
      });
    },

    pickFiles(accept, multiple) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept || '';
        input.multiple = !!multiple;
        input.style.display = 'none';
        document.body.appendChild(input);
        let settled = false;
        const finish = (files) => { if (settled) return; settled = true; input.remove(); resolve(files); };
        input.addEventListener('change', () => finish(Array.from(input.files || [])));
        input.addEventListener('cancel', () => finish([]));
        input.click();
      });
    },

    formatBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(2) + ' MB';
    }
  };
})();
