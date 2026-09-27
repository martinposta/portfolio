'use strict';
// Safety-net utility: if site/index.html ever gets hand-edited directly
// (bypassing the admin tool), run this to re-read its <div class="grid">
// block and overwrite content/projects.json to match again. Run from the
// admin folder:
//
//   node tools/resync-from-html.js
//
// It does NOT touch index.html — only content/projects.json. Drafts are never
// in the HTML, so the ones already in projects.json are kept (appended at the
// end, since their old position cannot be recovered from the HTML).
const fs = require('fs');
const path = require('path');
const { findGridBlock, parseCards } = require('../lib/cards');

const REPO = path.join(__dirname, '..', '..');
const INDEX_FILE = path.join(REPO, 'site', 'index.html');
const DATA_FILE = path.join(REPO, 'content', 'projects.json');

const html = fs.readFileSync(INDEX_FILE, 'utf8');
const { innerStart, innerEnd } = findGridBlock(html);
const cards = parseCards(html.slice(innerStart, innerEnd));

const old = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
// keep ids stable for cards that were already there, matched by title
const byTitle = new Map(old.filter((c) => c.visible !== false).map((c) => [c.title, c.id]));
cards.forEach((c) => { if (byTitle.has(c.title)) c.id = byTitle.get(c.title); });
const drafts = old.filter((c) => c.visible === false);

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.writeFileSync(DATA_FILE, JSON.stringify(cards.concat(drafts), null, 2) + '\n', 'utf8');
console.log(`Re-synced ${cards.length} cards from index.html into content/projects.json` +
  (drafts.length ? `, kept ${drafts.length} draft(s) at the end` : ''));
