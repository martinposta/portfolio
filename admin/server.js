'use strict';
/*
 * Martin Pošta portfolio — local admin tool
 * ------------------------------------------
 * Zero-dependency Node.js server (built-ins only, so `npm install` is never
 * required; git has to be installed). Serves a small local UI for editing the
 * gallery cards on site/index.html, backed by content/projects.json.
 *
 * "Save & publish" = fetch (refuse if GitHub's main moved meanwhile) → write
 * content/projects.json → regenerate the grid between the ADMIN:GRID markers
 * in site/index.html → commit → push. Git history is the backup.
 *
 * "Preview" renders the same thing WITHOUT writing anything to disk, drafts
 * included (greyed), so unsaved changes can be checked first.
 *
 * Run with:  node server.js   (Mac: start.command, Windows: start.bat)
 * Then open: http://localhost:4173
 *
 * No authentication, so it listens on 127.0.0.1 only. HOST=0.0.0.0 exposes
 * it — do that only behind something that adds a login (see CLAUDE.md).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { renderGrid, findGridBlock } = require('./lib/cards');
const { makeGit, GitError } = require('./lib/git');

const REPO = path.join(__dirname, '..');
const ROOT = path.join(REPO, 'site');             // what GitHub Pages publishes
const DATA_FILE = path.join(REPO, 'content', 'projects.json');
const INDEX_FILE = path.join(ROOT, 'index.html');
const THUMBS_DIR = path.join(ROOT, 'images', 'thumbs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const git = makeGit(REPO);

const GRID_START = '<!-- ADMIN:GRID:START -->';
const GRID_END = '<!-- ADMIN:GRID:END -->';

const CATEGORIES = ['feature', 'vfx', 'games', 'shorts'];   // must match the tabs in index.html
const KINDS = ['link', 'page', 'lightbox'];

// Site asset paths (real site files) that the preview page needs to load
// with the exact same root-relative URLs the live site uses.
const SITE_STATIC_PREFIXES = ['/assets/', '/partials/', '/images/', '/projects/'];
const SITE_STATIC_FILES = ['/posta_resume.pdf', '/CNAME'];

// In-memory store for unsaved previews, keyed by a random token.
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previews = new Map();
function cleanupPreviews() {
  const now = Date.now();
  for (const [token, entry] of previews) {
    if (now - entry.createdAt > PREVIEW_TTL_MS) previews.delete(token);
  }
}

function readJSON(res, req, cb) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 50 * 1024 * 1024) req.destroy(); });
  req.on('end', () => {
    let data;
    try { data = JSON.parse(body || '{}'); }
    catch (e) { return send(res, 400, { error: 'bad json: ' + e.message }); }
    try { cb(data); }
    catch (e) { sendError(res, e); }
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendError(res, e) {
  if (e instanceof GitError) {
    const status = e.code === 'moved' || e.code === 'diverged' ? 409 : 500;
    return send(res, status, { error: e.message, code: e.code, repo: e.details });
  }
  send(res, 500, { error: e.message });
}

function loadCards() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// The icon list is read from the <symbol>s in index.html, so adding an icon
// there is the only step — a second hardcoded list would drift.
function iconIds() {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  return [...html.matchAll(/<symbol\s+id="(ic-[\w-]+)"/g)].map((m) => m[1]);
}

// Returns a readable message for the first problem, or null.
function validateCards(cards) {
  if (!Array.isArray(cards)) return 'expected a list of cards';
  const icons = iconIds();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const name = `Card ${i + 1} (${(c && c.title) || 'untitled'})`;
    if (!c || typeof c !== 'object') return `${name} is not an object`;
    if (!String(c.title || '').trim()) return `${name}: the title is empty`;
    if (!CATEGORIES.includes(c.category)) return `${name}: category must be one of ${CATEGORIES.join(', ')}`;
    const it = c.interaction || {};
    if (!KINDS.includes(it.type)) return `${name}: click behaviour must be ${KINDS.join(', ')}`;
    if (it.type === 'page') {
      const p = String(it.href || '');
      if (!/^\/projects\/[\w-]+\.html$/.test(p) || !fs.existsSync(path.join(ROOT, p))) return `${name}: project page ${p || '(empty)'} does not exist`;
    }
    if (it.type === 'link' && !/^https?:\/\//.test(it.href || '')) return `${name}: the link must start with http:// or https://`;
    if (c.thumb && c.thumb.type === 'icon' && !icons.includes(c.thumb.icon)) return `${name}: unknown icon ${c.thumb.icon}`;
  }
  return null;
}

// Builds the full index.html source with the grid block replaced by the
// rendering of `cards`, WITHOUT touching disk.
function buildUpdatedHtml(cards, opts) {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const newGrid = GRID_START + '\n    ' + renderGrid(cards, opts) + '\n    ' + GRID_END;
  if (html.includes(GRID_START) && html.includes(GRID_END)) {
    const startIdx = html.indexOf(GRID_START);
    const endIdx = html.indexOf(GRID_END) + GRID_END.length;
    return html.slice(0, startIdx) + newGrid + html.slice(endIdx);
  }
  const { start, end } = findGridBlock(html);
  return html.slice(0, start) + newGrid + html.slice(end);
}

function writeFiles(cards) {
  const updated = buildUpdatedHtml(cards);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2) + '\n', 'utf8');
  fs.writeFileSync(INDEX_FILE, updated, 'utf8');
}

function buildPreviewHtml(cards) {
  let html = buildUpdatedHtml(cards, { preview: true });
  const drafts = cards.filter((c) => c.visible === false).length;
  const banner =
    '<div style="position:fixed;top:0;left:0;right:0;z-index:9999;' +
    'background:#b23a2e;color:#fff;font-family:monospace;font-size:13px;' +
    'padding:8px 16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.25)">' +
    'PREVIEW — unsaved changes, not published' +
    (drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'} shown dashed, not on the live site` : '') +
    '</div><div style="height:34px"></div>';
  return html.replace(/<body([^>]*)>/, '<body$1>' + banner);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

function serveFrom(baseDir, urlPath, res) {
  const full = path.join(baseDir, decodeURIComponent(urlPath));
  if (full !== baseDir && !full.startsWith(baseDir + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

function serveStatic(req, res) {
  let p = req.url.split('?')[0];
  if (SITE_STATIC_PREFIXES.some((prefix) => p.startsWith(prefix)) || SITE_STATIC_FILES.includes(p)) {
    return serveFrom(ROOT, p, res);
  }
  if (p === '/') p = '/index.html';
  return serveFrom(PUBLIC_DIR, p, res);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/api/projects' && req.method === 'GET') {
      return send(res, 200, { cards: loadCards(), head: git.state().head });
    }

    // Called when the admin page opens: fetch, fast-forward if only behind.
    if (url === '/api/sync' && req.method === 'POST') {
      return send(res, 200, git.sync());
    }

    // Cheap re-check (the page calls it when the tab regains focus).
    if (url === '/api/repo' && req.method === 'GET') {
      return send(res, 200, git.state({ fetch: true }));
    }

    if (url === '/api/projects' && req.method === 'PUT') {
      return readJSON(res, req, ({ cards, message, head }) => {
        const problem = validateCards(cards);
        if (problem) return send(res, 400, { error: problem });
        const result = git.publish({ message, expectHead: head, write: () => writeFiles(cards) });
        send(res, 200, Object.assign({ ok: true, count: cards.length }, result, { repo: git.state() }));
      });
    }

    if (url === '/api/push' && req.method === 'POST') {
      const err = git.push();
      return send(res, err ? 500 : 200, err ? { error: err } : { ok: true, repo: git.state() });
    }

    if (url === '/api/upload-thumb' && req.method === 'POST') {
      return readJSON(res, req, ({ filename, dataBase64, overwrite }) => {
        if (!filename || !dataBase64) return send(res, 400, { error: 'missing filename or dataBase64' });
        const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const dest = path.join(THUMBS_DIR, safeName);
        // An upload with the name of an existing file used to replace it
        // silently — and with it the thumbnail of whichever card used it.
        if (fs.existsSync(dest) && !overwrite) {
          const users = loadCards().filter((c) => c.thumb && c.thumb.src === '/images/thumbs/' + safeName).map((c) => c.title);
          return send(res, 409, { error: `${safeName} already exists` + (users.length ? ` (used by ${users.join(', ')})` : ''), code: 'exists' });
        }
        fs.mkdirSync(THUMBS_DIR, { recursive: true });
        fs.writeFileSync(dest, Buffer.from(dataBase64.replace(/^data:[^,]+,/, ''), 'base64'));
        send(res, 200, { ok: true, path: '/images/thumbs/' + safeName });
      });
    }

    if (url === '/api/icons' && req.method === 'GET') {
      return send(res, 200, iconIds());
    }

    if (url === '/api/preview' && req.method === 'POST') {
      return readJSON(res, req, (cards) => {
        if (!Array.isArray(cards)) return send(res, 400, { error: 'expected an array' });
        cleanupPreviews();
        const token = crypto.randomBytes(8).toString('hex');
        previews.set(token, { html: buildPreviewHtml(cards), createdAt: Date.now() });
        send(res, 200, { ok: true, url: '/preview/' + token });
      });
    }

    if (url.startsWith('/preview/') && req.method === 'GET') {
      const entry = previews.get(url.slice('/preview/'.length));
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<p style="font-family:sans-serif;padding:40px">Preview expired or not found — go back and click Preview again.</p>');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(entry.html);
    }

    return serveStatic(req, res);
  } catch (e) {
    sendError(res, e);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nMartin Pošta portfolio — admin tool\nOpen: http://localhost:${PORT}\nRepo: ${REPO}\n(Ctrl+C to stop)\n`);
});
