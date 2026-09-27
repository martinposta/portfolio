'use strict';
/*
 * Martin Pošta portfolio — local admin tool
 * ------------------------------------------
 * Zero-dependency Node.js server (built-ins only, so `npm install` is never
 * required). Serves a small local UI for editing the gallery cards on
 * index.html, backed by data/projects.json as the source of truth.
 *
 * "Save & publish" writes data/projects.json AND regenerates the
 * <div class="grid">...</div> block inside ../index.html between the
 * ADMIN:GRID markers, after making a timestamped backup copy. The rest of
 * index.html (hero, header/footer includes, script tags) is left untouched.
 *
 * "Preview" renders the same thing WITHOUT writing anything to disk, so you
 * can visually check unsaved changes first (real notebook.css, real
 * header/footer, real thumbnails — served straight from the site files).
 *
 * Run with:  node server.js
 *   Mac:      double-click start.command
 *   Windows:  double-click start.bat
 * Then open: http://localhost:4173
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseCards, renderGrid, findGridBlock } = require('./lib/cards');

const ROOT = path.join(__dirname, '..');           // site root (…/animovane portfolio)
const DATA_FILE = path.join(ROOT, 'data', 'projects.json');
const INDEX_FILE = path.join(ROOT, 'index.html');
const BACKUP_DIR = path.join(ROOT, 'backup');
const THUMBS_DIR = path.join(ROOT, 'images', 'thumbs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 4173;

const GRID_START = '<!-- ADMIN:GRID:START -->';
const GRID_END = '<!-- ADMIN:GRID:END -->';

// Site asset paths (real site files) that the preview page needs to load
// with the exact same root-relative URLs the live site uses.
const SITE_STATIC_PREFIXES = ['/assets/', '/partials/', '/images/', '/projects/'];
const SITE_STATIC_FILES = ['/posta_resume.pdf', '/CNAME'];

// In-memory store for unsaved previews, keyed by a random token.
// Cleared after PREVIEW_TTL_MS or on server restart — previews are
// throwaway, never written to disk.
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
    try { cb(JSON.parse(body || '{}')); }
    catch (e) { send(res, 400, { error: 'bad json: ' + e.message }); }
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function loadCards() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Builds the full index.html source with the grid block replaced by the
// rendering of `cards`, WITHOUT touching disk. Used by both the real save
// (which then writes the result) and the preview (which never does).
function buildUpdatedHtml(cards) {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const newGrid = GRID_START + '\n    ' + renderGrid(cards) + '\n    ' + GRID_END;
  if (html.includes(GRID_START) && html.includes(GRID_END)) {
    const startIdx = html.indexOf(GRID_START);
    const endIdx = html.indexOf(GRID_END) + GRID_END.length;
    return html.slice(0, startIdx) + newGrid + html.slice(endIdx);
  }
  // first run: locate the existing plain grid div and wrap it with markers
  const { start, end } = findGridBlock(html);
  return html.slice(0, start) + newGrid + html.slice(end);
}

function saveCardsAndPublish(cards) {
  // 1) write data/projects.json
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2), 'utf8');

  // 2) backup current index.html
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const currentHtml = fs.readFileSync(INDEX_FILE, 'utf8');
  fs.writeFileSync(path.join(BACKUP_DIR, `index.${stamp}.html`), currentHtml, 'utf8');

  // 3) regenerate the grid block between markers and write it for real
  const updated = buildUpdatedHtml(cards);
  fs.writeFileSync(INDEX_FILE, updated, 'utf8');
}

// Builds a preview page: the real page HTML with the pending (unsaved)
// cards rendered in, plus a banner so it's obviously not the live site.
function buildPreviewHtml(cards) {
  let html = buildUpdatedHtml(cards);
  const banner =
    '<div style="position:fixed;top:0;left:0;right:0;z-index:9999;' +
    'background:#b23a2e;color:#fff;font-family:monospace;font-size:13px;' +
    'padding:8px 16px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.25)">' +
    'PREVIEW — unsaved changes, not written to index.html' +
    '</div><div style="height:34px"></div>';
  html = html.replace(/<body([^>]*)>/, '<body$1>' + banner);
  return html;
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

function serveFrom(baseDir, urlPath, res) {
  const full = path.join(baseDir, urlPath);
  if (!full.startsWith(baseDir)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

function serveStatic(req, res) {
  let p = req.url.split('?')[0];
  // Real site files (css/js/partials/images/project pages) — served from
  // the site root so a preview page's root-relative links resolve exactly
  // like they do on the live site.
  if (SITE_STATIC_PREFIXES.some((prefix) => p.startsWith(prefix)) || SITE_STATIC_FILES.includes(p)) {
    return serveFrom(ROOT, p, res);
  }
  // Everything else is the admin UI itself.
  if (p === '/') p = '/index.html';
  return serveFrom(PUBLIC_DIR, p, res);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/projects' && req.method === 'GET') {
    return send(res, 200, loadCards());
  }

  if (url === '/api/projects' && req.method === 'PUT') {
    return readJSON(res, req, (cards) => {
      if (!Array.isArray(cards)) return send(res, 400, { error: 'expected an array' });
      try {
        saveCardsAndPublish(cards);
        send(res, 200, { ok: true, count: cards.length });
      } catch (e) {
        send(res, 500, { error: e.message });
      }
    });
  }

  if (url === '/api/upload-thumb' && req.method === 'POST') {
    return readJSON(res, req, ({ filename, dataBase64 }) => {
      try {
        if (!filename || !dataBase64) throw new Error('missing filename or dataBase64');
        const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        fs.mkdirSync(THUMBS_DIR, { recursive: true });
        const dest = path.join(THUMBS_DIR, safeName);
        const b64 = dataBase64.replace(/^data:[^,]+,/, '');
        fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
        send(res, 200, { ok: true, path: '/images/thumbs/' + safeName });
      } catch (e) {
        send(res, 500, { error: e.message });
      }
    });
  }

  if (url === '/api/icons' && req.method === 'GET') {
    return send(res, 200, ['ic-wave', 'ic-crown', 'ic-flame', 'ic-flask', 'ic-star', 'ic-drop', 'ic-spikes', 'ic-portal', 'ic-cat']);
  }

  if (url === '/api/preview' && req.method === 'POST') {
    return readJSON(res, req, (cards) => {
      if (!Array.isArray(cards)) return send(res, 400, { error: 'expected an array' });
      try {
        cleanupPreviews();
        const html = buildPreviewHtml(cards);
        const token = crypto.randomBytes(8).toString('hex');
        previews.set(token, { html, createdAt: Date.now() });
        send(res, 200, { ok: true, url: '/preview/' + token });
      } catch (e) {
        send(res, 500, { error: e.message });
      }
    });
  }

  if (url.startsWith('/preview/') && req.method === 'GET') {
    const token = url.slice('/preview/'.length);
    const entry = previews.get(token);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<p style="font-family:sans-serif;padding:40px">Preview expired or not found — go back and click Preview again.</p>');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(entry.html);
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\nMartin Pošta portfolio — admin tool\nOpen: http://localhost:${PORT}\nSite root: ${ROOT}\n(Ctrl+C to stop)\n`);
});
