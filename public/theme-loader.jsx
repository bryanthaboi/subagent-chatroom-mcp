/* AOL theme loader.
   Runs before aol-app.jsx. Resolves the active theme via /api/settings +
   /api/themes/<name>/resolved, injects CSS in cascade order, loads the
   active theme's Shell.jsx and the fallback shell. Resolves the
   __AOL_BOOT_READY promise so aol-app.jsx may render.

   Page boot order (see index.html):
     retro.css → react/react-dom/babel → THIS FILE →
     aol-core.jsx → aol-signon.jsx → aol-windows.jsx → aol-app.jsx
*/

window.__AOL_BOOT_READY = new Promise((resolve) => {
  window.__AOL_BOOT_RESOLVE = resolve;
});

(async () => {
  const log = (...args) => {
    if (window.AOL_DEBUG && window.AOL_DEBUG.enabled) console.log('[boot]', ...args);
  };

  function appendStylesheet(href) {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      // Soft-fail: 404 on an extending theme's css shouldn't break the page;
      // the browser will simply skip it. We still call resolve so boot continues.
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  // @babel/standalone only auto-transforms <script type="text/babel"> tags
  // found at its initial scan. Dynamically-appended ones are ignored. We
  // fetch the JSX manually, transform it ourselves, then execute in global
  // scope so window.AOL_THEME_SHELL / AOL_FALLBACK_SHELL get set.
  async function loadBabelModule(src) {
    const r = await fetch(src);
    if (!r.ok) throw new Error('failed to fetch ' + src + ': ' + r.status);
    const source = await r.text();
    const Babel = window.Babel;
    if (!Babel || typeof Babel.transform !== 'function') {
      throw new Error('Babel/standalone not loaded');
    }
    const { code } = Babel.transform(source, {
      presets: ['react'],
      filename: src,
      sourceMaps: 'inline',
    });
    // Indirect eval = global scope. The transformed code uses createElement
    // calls and assigns to window globals — no module wrapping required.
    (0, eval)(code);
  }

  try {
    // 1. settings
    const settings = await fetch('/api/settings').then((r) => r.json());
    window.__AOL_INITIAL_SETTINGS = settings;
    window.AOL_DEBUG = window.AOL_DEBUG || { enabled: !!settings['debug.devlog'] };
    if (settings['debug.devlog']) window.AOL_DEBUG.enabled = true;
    log('settings', settings);

    // 2. resolve active theme
    const active = settings['theme.active'] || 'aol';
    const resolved = await fetch('/api/themes/' + encodeURIComponent(active) + '/resolved').then((r) => r.json());
    window.AOL_RESOLVED_THEME = resolved;
    log('resolved', resolved.active.name, 'cssUrls', resolved.active.cssUrls, 'shell', resolved.active.shellUrl);

    // 3. inject CSS
    for (const url of resolved.active.cssUrls) {
      await appendStylesheet(url);
    }

    // 4. load fallback first (always available), then active shell
    await loadBabelModule('/fallback-shell.jsx');
    if (resolved.active.shellUrl && resolved.active.shellUrl !== '/fallback-shell.jsx') {
      try {
        await loadBabelModule(resolved.active.shellUrl);
      } catch (e) {
        window.AOL_BOOT_ERROR = String(e);
        log('shell load failed; falling back', e);
      }
    }

    // 5. AudioFx may be loaded by aol-core.jsx after we resolve __AOL_BOOT_READY,
    //    so apply the audio map from a microtask once setAudioMap is available.
    Promise.resolve().then(() => {
      if (window.AOL_DATA && window.AOL_DATA.AudioFx && window.AOL_DATA.AudioFx.setAudioMap) {
        window.AOL_DATA.AudioFx.setAudioMap(resolved.active.audio || {});
      }
    });

    window.__AOL_BOOT_RESOLVE();
  } catch (err) {
    window.AOL_BOOT_ERROR = String(err);
    log('boot failed', err);
    if (!window.AOL_FALLBACK_SHELL) {
      try { await loadBabelModule('/fallback-shell.jsx'); } catch {}
    }
    window.__AOL_BOOT_RESOLVE();
  }
})();
