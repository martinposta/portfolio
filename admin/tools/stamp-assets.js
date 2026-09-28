'use strict';
// Adds a content fingerprint to every stylesheet and script a page links from
// /assets/ (notebook.css → notebook.css?v=3f2a91c0). Run by the Pages
// workflow on the copy of site/ it is about to publish, never on the repo.
//
// Why: Cloudflare tells browsers to keep /assets/* for 4 hours, so after a
// publish a returning visitor could get new HTML with an old stylesheet or
// script. A changed file now gets a new URL, so it is fetched at once; an
// unchanged one keeps its URL and stays cached.
//
//   node admin/tools/stamp-assets.js site
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(process.argv[2] || 'site');
const ASSET_REF = /((?:href|src)=")(\/assets\/[\w./-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")/g;

const hashes = new Map();
function hashOf(webPath) {
  if (!hashes.has(webPath)) {
    const file = path.join(root, webPath);
    hashes.set(webPath, fs.existsSync(file)
      ? crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 10)
      : null);
  }
  return hashes.get(webPath);
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? htmlFiles(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

let pages = 0, refs = 0;
for (const file of htmlFiles(root)) {
  const html = fs.readFileSync(file, 'utf8');
  const out = html.replace(ASSET_REF, (m, pre, ref, post) => {
    const h = hashOf(ref);
    if (!h) return m;          // missing file: leave the link alone
    refs++;
    return `${pre}${ref}?v=${h}${post}`;
  });
  if (out !== html) { fs.writeFileSync(file, out); pages++; }
}
console.log(`stamped ${refs} asset links in ${pages} pages:`);
for (const [ref, h] of hashes) console.log(`  ${ref}  ${h || '(missing)'}`);
