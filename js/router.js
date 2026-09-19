/* Tiny hash router. Routes like '/page/:id/edit'. A handler may return a cleanup
   function, which runs before the next route renders (used by the editor to flush autosave). */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});

  const routes = [];
  const listeners = new Set();
  let notFound = null;
  let cleanup = null;
  let current = { path: '/home', pattern: '/home', params: {}, query: {} };

  function add(pattern, handler) {
    const keys = [];
    const src = pattern.replace(/:([A-Za-z]+)/g, (m, k) => { keys.push(k); return '([^/]+)'; });
    routes.push({ pattern, keys, handler, re: new RegExp('^' + src + '/?$') });
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/home';
    const qi = raw.indexOf('?');
    const path = qi === -1 ? raw : raw.slice(0, qi);
    const query = {};
    if (qi !== -1) new URLSearchParams(raw.slice(qi + 1)).forEach((v, k) => { query[k] = v; });
    return { path: path || '/home', query };
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function resolve() {
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (err) { console.error(err); }
    }
    cleanup = null;

    const { path, query } = parseHash();
    let matched = null;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = safeDecode(m[i + 1]); });
        matched = { r, params };
        break;
      }
    }

    current = { path, query, pattern: matched ? matched.r.pattern : null, params: matched ? matched.params : {} };
    try {
      const out = matched ? matched.r.handler(matched.params, query) : (notFound && notFound(path));
      cleanup = typeof out === 'function' ? out : null;
    } catch (err) {
      console.error('Route error', err);
      WS.ui && WS.ui.toast('Something went wrong showing this page.', 'error');
    }
    listeners.forEach((fn) => { try { fn(current); } catch (err) { console.error(err); } });
  }

  WS.router = {
    add,
    setNotFound(fn) { notFound = fn; },
    current() { return current; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    navigate(path, opts) {
      const target = '#' + path;
      if (opts && opts.replace) {
        history.replaceState(null, '', target);
        resolve();
      } else if (location.hash === target) {
        resolve();
      } else {
        location.hash = path;
      }
    },
    refresh() { resolve(); },
    start() {
      window.addEventListener('hashchange', resolve);
      if (!location.hash) history.replaceState(null, '', '#/home');
      resolve();
    }
  };
})();
