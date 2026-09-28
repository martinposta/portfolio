'use strict';
// The parts every page shares — header, footer and the <head> tags for
// search engines and link previews — rendered from content/site.json and
// written INTO each page at publish time. They used to be fetched by
// include.js after load: invisible without JavaScript, to crawlers and to
// link previews, and the header popped in a moment after the page.
//
// Each block sits between markers, so it can be replaced again later:
//   <!-- ADMIN:META:START --> … <!-- ADMIN:META:END -->      (in <head>)
//   <!-- ADMIN:HEADER:START --> … <!-- ADMIN:HEADER:END -->
//   <!-- ADMIN:FOOTER:START --> … <!-- ADMIN:FOOTER:END -->

const { esc } = require('./esc');

const LINK = /^(https?:\/\/|\/|mailto:)/;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

function external(href) { return /^https?:\/\//.test(href); }
function target(href) { return external(href) || /\.pdf$/i.test(href) ? ' target="_blank" rel="noopener"' : ''; }

function renderHeader(site) {
  const h = site.header || {};
  const resume = h.resume && h.resume.href
    ? `\n      <a href="${esc(h.resume.href)}"${target(h.resume.href)}>${esc(h.resume.label || 'resume')}</a>` : '';
  const links = (h.links || []).filter((l) => l.label && l.href);
  const custom = links.length
    ? '\n      <span class="nav-sep">|</span>' + links.map((l) =>
      `\n      <a href="${esc(l.href)}"${target(l.href)}>${l.emoji ? esc(l.emoji) + ' ' : ''}${esc(l.label)}</a>`).join('')
    : '';
  return `<header>
  <div class="header-inner">
    <div class="logo">${esc((site.footer && site.footer.owner) || 'Martin Pošta')}</div>
    <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">☰</button>
    <nav>
      <a href="/index.html#reel">reel</a>
      <a href="/index.html#portfolio">portfolio</a>
      <a href="/index.html#contact">contact</a>${resume}${custom}
    </nav>
  </div>
</header>`;
}

// The address is stored reversed in the markup and turned around by
// include.js, so a scraper reading the HTML finds no email pattern in it.
function renderFooter(site, year) {
  const f = site.footer || {};
  const reversed = String(f.email || '').split('').reverse().join('');
  const links = (f.links || []).filter((l) => l.label && l.href).map((l) =>
    `\n          <a href="${esc(l.href)}"${target(l.href)}>${esc(l.label)}</a>`).join('');
  return `<footer id="contact">
  <div class="crumbs" style="top:18px;right:60px"></div>
  <div class="wrap">
    <div class="slate">
      <div>
        <div class="slate-label"><span class="tape-label">Contact</span></div>
        <span id="email-slot" data-e="${esc(reversed)}"></span>
      </div>
      <div>
        <div class="slate-label"><span class="tape-label">Links</span></div>
        <div class="foot-links">${links}
        </div>
      </div>
    </div>
    <div class="copyright">© ${year || new Date().getFullYear()} ${esc(f.owner || 'Martin Pošta')}.</div>
  </div>
</footer>`;
}

// page: { title, description, image, path } — all optional; the site's
// defaults fill the gaps. Absolute URLs, because link previews need them.
function renderMeta(site, page) {
  const m = site.meta || {};
  const base = String(m.url || '').replace(/\/$/, '');
  const abs = (u) => (!u ? '' : /^https?:/.test(u) ? u : base + u);
  const description = (page && page.description) || m.description || '';
  const image = abs((page && page.image) || m.image);
  const url = abs((page && page.path) || '/');
  const title = (page && page.title) || (site.footer && site.footer.owner) || '';
  return [
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : null,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<link rel="stylesheet" href="/assets/fonts.css">`
  ].filter(Boolean).join('\n');
}

function block(name, content) {
  return `<!-- ADMIN:${name}:START -->\n${content}\n<!-- ADMIN:${name}:END -->`;
}

// Replaces a marked block; on a page that still has the old fetched include
// (or the Google Fonts links, for META) it replaces that instead.
function put(html, name, content, fallback) {
  const start = `<!-- ADMIN:${name}:START -->`, end = `<!-- ADMIN:${name}:END -->`;
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i >= 0 && j > i) return html.slice(0, i) + block(name, content) + html.slice(j + end.length);
  if (fallback && fallback.test(html)) return html.replace(fallback, block(name, content));
  throw new Error(`no place for the ${name} block`);
}

const GOOGLE_FONTS = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/;

function applyChrome(html, site, page) {
  html = put(html, 'META', renderMeta(site, page), GOOGLE_FONTS);
  html = put(html, 'HEADER', renderHeader(site), /<div data-include="\/partials\/header\.html"><\/div>/);
  html = put(html, 'FOOTER', renderFooter(site), /<div data-include="\/partials\/footer\.html"><\/div>/);
  return html;
}

// Returns a readable message for the first problem, or null.
function validateSite(site, fileExists) {
  if (!site || typeof site !== 'object') return 'not a settings object';
  const h = site.header || {}, f = site.footer || {}, m = site.meta || {};
  if (h.resume && h.resume.href) {
    if (!LINK.test(h.resume.href)) return 'Resume: the link must start with https:// or /';
    if (h.resume.href.startsWith('/') && !fileExists(h.resume.href)) return `Resume: ${h.resume.href} does not exist on the site`;
  }
  for (const [where, list] of [['Header', h.links], ['Footer', f.links]]) {
    for (const l of list || []) {
      if (!String(l.label || '').trim()) return `${where}: a link has no text`;
      if (!LINK.test(l.href || '')) return `${where}: “${l.label}” needs a link starting with https:// or /`;
    }
  }
  if (!EMAIL.test(f.email || '')) return 'Footer: the contact email does not look like an address';
  if (!/^https:\/\/[^/]+$/.test(String(m.url || '').replace(/\/$/, ''))) return 'Sharing: the site address must look like https://martinposta.com';
  if (m.image && m.image.startsWith('/') && !fileExists(m.image)) return `Sharing: ${m.image} does not exist on the site`;
  return null;
}

module.exports = { renderHeader, renderFooter, renderMeta, applyChrome, validateSite };
