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
 * Then open: http://localhost:4173/admin/  (http://localhost:4173/ is the site)
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
const { renderPage, validatePage } = require('./lib/pages');

const REPO = path.join(__dirname, '..');
const ROOT = path.join(REPO, 'site');             // what GitHub Pages publishes
const DATA_FILE = path.join(REPO, 'content', 'projects.json');
const INDEX_FILE = path.join(ROOT, 'index.html');
const THUMBS_DIR = path.join(ROOT, 'images', 'thumbs');
const PAGES_DIR = path.join(REPO, 'content', 'pages');      // project pages, one JSON each
const PROJECTS_DIR = path.join(ROOT, 'projects');           // …generated into these HTML files
// Upload targets and what each accepts. Doodles may be animated (svg/gif/webm).
const UPLOADS = {
  thumbs: { dir: THUMBS_DIR, types: /\.(jpe?g|png|webp)$/i },
  projects: { dir: path.join(ROOT, 'images', 'projects'), types: /\.(jpe?g|png|webp)$/i },
  doodles: { dir: path.join(ROOT, 'images', 'doodles'), types: /\.(svg|png|webp|gif|webm|mp4)$/i }
};
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const git = makeGit(REPO);

const GRID_START = '<!-- ADMIN:GRID:START -->';
const GRID_END = '<!-- ADMIN:GRID:END -->';

const CATEGORIES = ['feature', 'vfx', 'games', 'shorts'];   // must match the tabs in index.html
const KINDS = ['link', 'page', 'lightbox'];
// What the lightbox iframe can play. The admin turns pasted page links into these.
const VIDEO_EMBED = /^https:\/\/(player\.vimeo\.com\/video\/\d+|www\.youtube(-nocookie)?\.com\/embed\/[\w-]{11})([?#].*)?$/;

// URL layout: the admin UI lives under /admin/, the API under /api/, previews
// under /preview/, and EVERYTHING ELSE is the site itself, served from site/.
// The site links root-relative (/index.html#portfolio, /projects/…), so the
// site must own the root: while the admin sat at / and /index.html, clicking
// the menu in a preview opened the admin instead of the homepage.

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
      const slug = (/^\/projects\/([\w-]+)\.html$/.exec(p) || [])[1];
      const page = slug && loadPage(slug);
      if (!page) return `${name}: project page ${p || '(empty)'} does not exist`;
      if (c.visible !== false && page.visible === false) return `${name}: it is live but its page “${page.title}” is a draft. Make the card a draft too, or publish the page first.`;
    }
    if (it.type === 'link' && !/^https?:\/\//.test(it.href || '')) return `${name}: the link must start with http:// or https://`;
    if (it.type === 'lightbox' && it.video && !VIDEO_EMBED.test(it.video)) return `${name}: the video must be a Vimeo or YouTube link (got ${it.video})`;
    if (it.type === 'lightbox' && it.link && !/^https?:\/\//.test(it.link)) return `${name}: the extra link must start with http:// or https://`;
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

function loadPage(slug) {
  const f = path.join(PAGES_DIR, slug + '.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
function loadPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  return fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(PAGES_DIR, f), 'utf8')));
}
function listFiles(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')).sort() : [];
}

// Checks a whole publish of pages against each other and against the gallery.
function validatePagesChange(changed, deleted) {
  const cards = loadCards();
  const linking = (slug) => cards.filter((c) => c.visible !== false && c.interaction && c.interaction.href === '/projects/' + slug + '.html').map((c) => c.title);
  const seen = new Set();
  for (const p of changed) {
    const err = validatePage(p);
    if (err) return err;
    if (seen.has(p.slug)) return `Two pages use the address ${p.slug}`;
    seen.add(p.slug);
    if (p.visible === false && linking(p.slug).length) return `“${p.title}” cannot become a draft: the live card ${linking(p.slug).join(', ')} opens it. Make the card a draft first.`;
  }
  for (const slug of deleted) {
    if (linking(slug).length) return `The page ${slug} cannot be deleted: the live card ${linking(slug).join(', ')} opens it.`;
  }
  return null;
}

// A draft page keeps its JSON but has no HTML, so it cannot be opened on the site.
function writePages(changed, deleted) {
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  for (const p of changed) {
    fs.writeFileSync(path.join(PAGES_DIR, p.slug + '.json'), JSON.stringify(p, null, 2) + '\n', 'utf8');
    const html = path.join(PROJECTS_DIR, p.slug + '.html');
    if (p.visible === false) fs.rmSync(html, { force: true });
    else fs.writeFileSync(html, renderPage(p), 'utf8');
  }
  for (const slug of deleted) {
    fs.rmSync(path.join(PAGES_DIR, slug + '.json'), { force: true });
    fs.rmSync(path.join(PROJECTS_DIR, slug + '.html'), { force: true });
  }
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

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webm': 'video/webm', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };

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
  const p = req.url.split('?')[0];
  if (p === '/admin') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
  if (p.startsWith('/admin/')) {
    const rest = p.slice('/admin'.length);
    return serveFrom(PUBLIC_DIR, rest === '/' ? '/index.html' : rest, res);
  }
  return serveFrom(ROOT, p === '/' ? '/index.html' : p, res);
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

    if (url === '/api/pages' && req.method === 'GET') {
      return send(res, 200, {
        pages: loadPages(),
        head: git.state().head,
        cards: loadCards().map((c) => ({ title: c.title, visible: c.visible !== false, href: c.interaction && c.interaction.href })),
        doodles: listFiles(UPLOADS.doodles.dir).map((f) => '/images/doodles/' + f)
      });
    }

    if (url === '/api/pages' && req.method === 'PUT') {
      return readJSON(res, req, ({ pages, deleted, message, head }) => {
        pages = Array.isArray(pages) ? pages : [];
        deleted = Array.isArray(deleted) ? deleted.filter((s) => /^[a-z0-9-]+$/.test(s)) : [];
        const problem = validatePagesChange(pages, deleted);
        if (problem) return send(res, 400, { error: problem });
        const result = git.publish({ message, expectHead: head, write: () => writePages(pages, deleted) });
        send(res, 200, Object.assign({ ok: true }, result, { repo: git.state() }));
      });
    }

    if (url === '/api/pages/preview' && req.method === 'POST') {
      return readJSON(res, req, (page) => {
        cleanupPreviews();
        const token = crypto.randomBytes(8).toString('hex');
        previews.set(token, { html: renderPage(page, { preview: true }), createdAt: Date.now() });
        send(res, 200, { ok: true, url: '/preview/' + token });
      });
    }

    if (url === '/api/push' && req.method === 'POST') {
      const err = git.push();
      return send(res, err ? 500 : 200, err ? { error: err } : { ok: true, repo: git.state() });
    }

    if ((url === '/api/upload' || url === '/api/upload-thumb') && req.method === 'POST') {
      return readJSON(res, req, ({ filename, dataBase64, overwrite, target }) => {
        if (!filename || !dataBase64) return send(res, 400, { error: 'missing filename or dataBase64' });
        const up = UPLOADS[target || 'thumbs'];
        if (!up) return send(res, 400, { error: 'unknown upload target' });
        const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        if (!up.types.test(safeName)) return send(res, 400, { error: `${target || 'thumbs'} accepts ${String(up.types).match(/\((.*)\)/)[1].replace(/\|/g, ', ').replace('jpe?g', 'jpg')} files` });
        const dest = path.join(up.dir, safeName);
        const webPath = '/' + path.relative(ROOT, dest).split(path.sep).join('/');
        // An upload with the name of an existing file used to replace it
        // silently — and with it the thumbnail of whichever card used it.
        if (fs.existsSync(dest) && !overwrite) {
          const users = loadCards().filter((c) => c.thumb && c.thumb.src === webPath).map((c) => c.title)
            .concat(loadPages().filter((p) => JSON.stringify(p.blocks).includes('"' + webPath + '"')).map((p) => 'page ' + p.title));
          return send(res, 409, { error: `${safeName} already exists` + (users.length ? ` (used by ${users.join(', ')})` : ''), code: 'exists' });
        }
        fs.mkdirSync(up.dir, { recursive: true });
        fs.writeFileSync(dest, Buffer.from(dataBase64.replace(/^data:[^,]+,/, ''), 'base64'));
        send(res, 200, { ok: true, path: webPath });
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
  console.log(`\nMartin Pošta portfolio — admin tool\nOpen: http://localhost:${PORT}/admin/  (the site itself: http://localhost:${PORT}/)\nRepo: ${REPO}\n(Ctrl+C to stop)\n`);
});
