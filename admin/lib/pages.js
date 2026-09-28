'use strict';
// Project pages: content/pages/<slug>.json (a list of blocks) is the source,
// site/projects/<slug>.html is generated from it. The markup below is the
// same the pages were hand-written with, so notebook.css styles them as
// before; the few new classes (.link-row, .block-head, .prose.muted,
// .screen-frame.whole, .doodle) live in notebook.css under "generated
// project pages".

const BLOCK_TYPES = ['text', 'heading', 'video', 'photos', 'buttons', 'credit', 'doodle'];
const PAPERS = ['auto', '1', '2', '3', '4'];
const TAG_COLORS = ['black', 'red', 'blue'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VIDEO_EMBED = /^https:\/\/(player\.vimeo\.com\/video\/\d+|www\.youtube(-nocookie)?\.com\/embed\/[\w-]{11})([?#].*)?$/;
const LOCAL_IMAGE = /^\/images\/[\w./-]+\.(jpe?g|png|webp|gif|svg)$/i;
const DOODLE = /^\/images\/doodles\/[\w.-]+\.(svg|png|webp|gif|webm|mp4)$/i;

const { esc } = require('./esc');
const { renderHeader, renderFooter, renderMeta } = require('./chrome');

// Inline text: *italic* and [label](url). Everything else is escaped, so a
// stray < or " in the copy can never break the page.
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (m, label, url) =>
      `<a href="${url}"${/^https?:/.test(url.replace(/&amp;/g, '&')) ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function paragraphs(text, oneLineEach) {
  const parts = oneLineEach ? String(text || '').split('\n') : String(text || '').split(/\n\s*\n/);
  return parts.map((p) => p.trim()).filter(Boolean).map((p) => `<p>${inline(p).replace(/\n/g, '<br>')}</p>`);
}

// "auto" hands out the four papers in turn, so two frames in a row never
// look the same. An explicit choice does not advance the sequence.
function paperPicker() {
  let n = 0;
  return (p) => (p && p !== 'auto' ? String(p) : String((n++ % 4) + 1));
}

function screen(pin, flip, frame, caption, frameClass) {
  const cls = 'screen' + (pin === '1' ? '' : ' pin-' + pin);
  return [
    `  <div class="${cls}">`,
    `    <div class="paper-scrap"${flip ? ' style="transform:rotate(1.6deg)"' : ''}></div>`,
    `    <div class="reel-card${flip ? ' flip' : ''}">`,
    flip ? '      <div class="tape"></div>' : '      <div class="tape"></div>\n      <div class="tape right"></div>',
    `      <div class="screen-frame${frameClass || ''}">${frame}</div>`,
    caption ? `      <div class="reel-caption">${esc(caption)}</div>` : null,
    '    </div>',
    '  </div>'
  ].filter((l) => l !== null).join('\n');
}

function renderBlock(b, paper, i) {
  const at = ` data-block="${i}"`;
  switch (b.type) {
    case 'text': {
      const style = b.style === 'tight' ? ' tight' : b.style === 'muted' ? ' muted' : '';
      return `  <div class="prose${style}"${at}>\n    ${paragraphs(b.text, b.style === 'tight').join('\n    ')}\n  </div>`;
    }
    case 'heading':
      return `  <div class="section-head block-head"${at}><h2>${esc(b.text)}</h2></div>`;
    case 'video': {
      // no link yet (only possible in the preview, publishing refuses it): an
      // empty frame, not <iframe src="">, which loads the page into itself
      const frame = VIDEO_EMBED.test(b.url || '')
        ? `<iframe src="${esc(b.url)}" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>`
        : '';
      return screen(paper(b.paper), b.tilt === 'flip', frame, b.caption).replace('<div class="screen', `<div${at} class="screen`);
    }
    case 'photos': {
      const whole = b.fit === 'whole';
      const shots = (b.items || []).map((it) => screen(
        paper(it.paper || b.paper), false,
        `<img src="${esc(it.src)}" alt="${esc(it.alt)}" loading="lazy">`,
        it.caption, whole ? ' whole' : ''));
      return `  <div class="photo-set"${at}>\n${shots.join('\n')}\n  </div>`;
    }
    case 'buttons':
      return `  <div class="link-row"${at}>\n` + (b.items || []).map((x) =>
        `    <a class="tape-label blue" href="${esc(x.url)}"${/^https?:/.test(x.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(x.label)} ↗</a>`).join('\n') + '\n  </div>';
    case 'credit':
      return `  <div class="credit-card"${at}>\n    ${paragraphs(b.text).join('\n    ')}` +
        (b.highlight ? `\n    <div class="handwritten-highlight">${esc(b.highlight)}</div>` : '') + '\n  </div>';
    case 'doodle': {
      const src = esc(b.src);
      const media = /\.(webm|mp4)$/i.test(b.src)
        ? `<video src="${src}" autoplay muted loop playsinline aria-hidden="true"></video>`
        : `<img src="${src}" alt="" loading="lazy">`;
      return `  <div class="doodle doodle-${['left', 'right', 'center'].includes(b.side) ? b.side : 'right'}"${at} style="width:${Math.max(40, Math.min(480, Number(b.size) || 140))}px">${media}</div>`;
    }
  }
  return '';
}

// What a link preview shows for a page: its own description, else the
// first paragraph; its own image, else its first photo (else the site's).
function shareInfo(page) {
  const firstText = (page.blocks || []).find((b) => b.type === 'text' && b.style !== 'tight');
  const plain = firstText ? firstText.text.split(/\n\s*\n/)[0].replace(/\*|\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim() : '';
  const firstPhoto = (page.blocks || []).find((b) => b.type === 'photos' && (b.items || []).length);
  return {
    title: page.title + ' — Martin Pošta',
    description: page.description || (plain.length > 200 ? plain.slice(0, 197).replace(/\s+\S*$/, '') + '…' : plain),
    image: page.image || (firstPhoto ? firstPhoto.items[0].src : ''),
    path: '/projects/' + page.slug + '.html'
  };
}

// opts.site (content/site.json) supplies the header, footer and head tags.
// opts.preview keeps the data-block markers (the admin's preview uses them to
// select a block by clicking it); the published file does not need them.
function renderPage(page, opts) {
  const site = (opts && opts.site) || {};
  const paper = paperPicker();
  let body = (page.blocks || []).map((b, i) => renderBlock(b, paper, i)).join('\n\n');
  if (!(opts && opts.preview)) body = body.replace(/ data-block="\d+"/g, '');
  const tags = (page.tags || []).filter((t) => String(t.text || '').trim()).map((t) =>
    `      <span class="tape-label${t.color === 'red' ? ' accent' : t.color === 'blue' ? ' blue' : ''}">${esc(t.text)}</span>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} — Martin Pošta</title>
<!-- ADMIN:META:START -->
${renderMeta(site, shareInfo(page))}
<!-- ADMIN:META:END -->
<link rel="stylesheet" href="/assets/notebook.css">
</head>
<body class="project-page">
<!-- Generated by the admin from content/pages/${esc(page.slug)}.json. Edit it there: changes made here are overwritten on the next publish. -->

<div class="spine"></div>
<div class="margin-rule"></div>

<!-- ADMIN:HEADER:START -->
${renderHeader(site)}
<!-- ADMIN:HEADER:END -->

<div class="wrap">

  <div style="padding-top:40px">
    <a class="back-link" href="/index.html#portfolio">← back to portfolio</a>
  </div>

  <div class="hero" style="padding-top:0">
${page.coffee ? '    <div class="coffee-stain sm" style="top:-4px;right:-14px"></div>\n' : ''}    <h1 style="font-size:clamp(34px,6vw,54px)">${esc(page.title)}</h1>
    <div class="project-meta">
${tags}
    </div>
  </div>

${body}

  <div class="more-note">
    <a href="/index.html#portfolio">← back to the full portfolio</a>
  </div>

</div>

<!-- ADMIN:FOOTER:START -->
${renderFooter(site)}
<!-- ADMIN:FOOTER:END -->

<script src="/assets/include.js"></script>

</body>
</html>
`;
}

// Returns a readable message for the first problem, or null.
function validatePage(p) {
  if (!p || typeof p !== 'object') return 'not a page';
  const name = `Page “${p.title || p.slug || 'untitled'}”`;
  if (!SLUG.test(p.slug || '')) return `${name}: the address may only contain a-z, 0-9 and dashes`;
  if (!String(p.title || '').trim()) return `${name}: the title is empty`;
  for (const t of p.tags || []) if (!TAG_COLORS.includes(t.color)) return `${name}: unknown label colour ${t.color}`;
  if (p.image && !LOCAL_IMAGE.test(p.image)) return `${name}: the sharing image must be an uploaded image`;
  const blocks = p.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], where = `${name}, block ${i + 1} (${b && b.type})`;
    if (!b || !BLOCK_TYPES.includes(b.type)) return `${where}: unknown block type`;
    if (b.paper && !PAPERS.includes(String(b.paper))) return `${where}: unknown paper ${b.paper}`;
    if (b.type === 'video' && !VIDEO_EMBED.test(b.url || '')) return `${where}: the video must be a Vimeo or YouTube link`;
    if (b.type === 'photos') {
      if (!(b.items || []).length) return `${where}: add at least one photo`;
      for (const it of b.items) if (!LOCAL_IMAGE.test(it.src || '')) return `${where}: ${it.src || '(empty)'} is not an uploaded image`;
    }
    if (b.type === 'buttons') {
      for (const x of b.items || []) {
        if (!String(x.label || '').trim()) return `${where}: a button has no label`;
        if (!/^(https?:\/\/|\/)/.test(x.url || '')) return `${where}: button “${x.label}” needs a link starting with https:// or /`;
      }
    }
    if (b.type === 'doodle' && !DOODLE.test(b.src || '')) return `${where}: pick a drawing from images/doodles/`;
  }
  return null;
}

module.exports = { renderPage, validatePage, shareInfo, BLOCK_TYPES, SLUG, esc };
