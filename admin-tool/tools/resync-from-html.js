'use strict';
// Safety-net utility: if index.html ever gets hand-edited directly (bypassing
// the admin tool), run this to re-read its <div class="grid"> block and
// overwrite data/projects.json to match again. Run from the admin-tool folder:
//
//   node tools/resync-from-html.js
//
// It does NOT touch index.html — only data/projects.json.
const fs = require('fs');
const path = require('path');
const { findGridBlock, parseCards } = require('../lib/cards');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_FILE = path.join(ROOT, 'index.html');
const DATA_FILE = path.join(ROOT, 'data', 'projects.json');

const html = fs.readFileSync(INDEX_FILE, 'utf8');
const { innerStart, innerEnd } = findGridBlock(html);
const cards = parseCards(html.slice(innerStart, innerEnd));

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2), 'utf8');
console.log(`Re-synced ${cards.length} cards from index.html into data/projects.json`);
