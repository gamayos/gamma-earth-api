// Lightweight script to show "Last update" from GitHub commit date.
// Usage:
// 1) Place <p class="note last-updated">Last update: —</p> in your page where you want the date.
// 2) Include this script on the page:
//
// <script src="/docs/js/last-updated.js" data-repo-owner="gamayos" data-repo-name="gamma-earth-api" data-filepath="docs/index.html" async></script>
//
// Optional: add data-debug="1" to the script tag to enable console logs.
// Optional token: either add <meta name="github-token" content="ghp_..."> or add data-token="..." to the script tag
// (do NOT expose tokens in public pages).

(function () {
  'use strict';

  // CONFIG DEFAULTS
  const DEFAULT_OWNER = 'gamayos';
  const DEFAULT_REPO = 'gamma-earth-api';
  const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  // Helpers
  function nowMs() { return Date.now(); }
  function qs(sel) { return document.querySelector(sel); }
  function humanDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return iso; }
  }

  // Locate current <script> node (works even when loaded async)
  const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const debug = Boolean(currentScript && (currentScript.dataset.debug === '1' || currentScript.getAttribute('data-debug') === '1'));

  const owner = (currentScript && currentScript.dataset.repoOwner) || DEFAULT_OWNER;
  const repo = (currentScript && currentScript.dataset.repoName) || DEFAULT_REPO;
  const explicitPath = currentScript && (currentScript.dataset.filepath || currentScript.getAttribute('data-filepath'));
  const token = (currentScript && (currentScript.dataset.token || null)) || (document.querySelector('meta[name="github-token"]') || {}).content || null;

  if (debug) console.log('last-updated: owner=', owner, 'repo=', repo, 'explicitPath=', explicitPath, 'token?', !!token);

  // Determine repo file path (best-effort)
  function derivePath() {
    if (explicitPath) return explicitPath.replace(/^\/+/, '');
    let p = location.pathname || '';
    // If served under a prefix (e.g. /owner/repo/docs/...), try to extract the docs/... portion
    const docsIndex = p.indexOf('/docs/');
    if (docsIndex !== -1) {
      p = p.substring(docsIndex + 1); // drop leading slash
    } else {
      p = p.replace(/^\/+/, '');
    }
    if (p === '' || p.endsWith('/')) p = (p || 'docs') + (p.endsWith('/') ? 'index.html' : '/index.html');
    // Normalize windows-style backslashes, etc.
    return p;
  }

  const filePath = derivePath();
  if (debug) console.log('last-updated: resolved filePath=', filePath);

  // Find or insert placeholder element
  function getOrInsertPlaceholder() {
    let el = qs('.last-updated');
    if (el) return el;

    // try to insert near breadcrumb if available
    const crumb = qs('nav.breadcrumb');
    el = document.createElement('p');
    el.className = 'note last-updated';
    el.textContent = 'Last update: —';
    if (crumb && crumb.parentNode) {
      // insert after breadcrumb
      crumb.parentNode.insertBefore(el, crumb.nextSibling);
    } else {
      // fallback: append to top of article.prose or body
      const article = qs('article.prose') || document.body;
      article.insertBefore(el, article.firstChild);
    }
    return el;
  }

  const placeholder = getOrInsertPlaceholder();
  if (!placeholder) {
    if (debug) console.warn('last-updated: could not create placeholder');
    return;
  }

  // Local cache key
  const cacheKey = `ge:lastUpdated:${owner}/${repo}/${filePath}`;

  // Fast path: use cache
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.ts && (nowMs() - parsed.ts) < CACHE_TTL_MS && parsed.date) {
        placeholder.textContent = 'Last update: ' + parsed.date;
        if (debug) console.log('last-updated: used cached value', parsed.date);
        return;
      }
    }
  } catch (e) {
    if (debug) console.warn('last-updated: localStorage read error', e);
  }

  // Build GitHub commit query
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?path=${encodeURIComponent(filePath)}&per_page=1`;

  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `token ${token}`;

  if (debug) console.log('last-updated: fetching', apiUrl);

  fetch(apiUrl, { headers })
    .then((res) => {
      if (!res.ok) throw new Error('GitHub API error ' + res.status + ' ' + res.statusText);
      return res.json();
    })
    .then((data) => {
      if (!Array.isArray(data) || data.length === 0) {
        placeholder.textContent = 'Last update: (no commits found)';
        if (debug) console.log('last-updated: no commits found for', filePath, data);
        return;
      }
      const c = data[0];
      const dateIso = (c && c.commit && (c.commit.author && c.commit.author.date)) || (c.commit && c.commit.committer && c.commit.committer.date) || null;
      if (!dateIso) {
        placeholder.textContent = 'Last update: (unknown)';
        if (debug) console.log('last-updated: commit found but no date', c);
        return;
      }
      const formatted = humanDate(dateIso);
      placeholder.textContent = 'Last update: ' + formatted;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ date: formatted, ts: nowMs() }));
      } catch (e) {
        if (debug) console.warn('last-updated: localStorage write error', e);
      }
      if (debug) console.log('last-updated: updated', formatted);
    })
    .catch((err) => {
      if (debug) console.warn('last-updated fetch error:', err);
      // keep placeholder (silent fallback)
    });
})();
