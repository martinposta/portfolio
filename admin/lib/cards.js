'use strict';
// Shared logic for parsing the <div class="grid">...</div> block out of
// index.html into structured card objects, and rendering card objects
// back into the exact same HTML markup style.

function slugify(title) {
  let s = title.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'item';
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
// Escapes everything that can break out of text or a double-quoted
// attribute. It used to escape only "&", so a description containing a
// double quote silently cut the attribute (and the text) short.
function encodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Find `<div class="grid">` ... matching `</div>` via depth counting.
function findGridBlock(html) {
  const startMarker = '<div class="grid">';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) throw new Error('grid div not found');
  const innerStart = startIdx + startMarker.length;
  const tagRe = /<div\b|<\/div>/g;
  tagRe.lastIndex = innerStart;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0] === '</div>') {
      depth--;
      if (depth === 0) {
        return { start: startIdx, innerStart, innerEnd: m.index, end: m.index + m[0].length };
      }
    } else {
      depth++;
    }
  }
  throw new Error('matching close for grid div not found');
}

function parseAttrs(tagSrc) {
  const attrs = {};
  const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagSrc))) attrs[m[1]] = m[2];
  attrs.__lightbox = /\bdata-lightbox\b(?!\s*=)/.test(tagSrc);
  return attrs;
}

function parseCards(inner) {
  const cardRe = /<a\s+class="card"([^>]*)>([\s\S]*?)<\/a>/g;
  const cards = [];
  let m;
  while ((m = cardRe.exec(inner))) {
    const attrs = parseAttrs(m[1]);
    const body = m[2];

    const flagMatch = /<div class="cat-flag">([^<]*)<\/div>/.exec(body);
    const flag = flagMatch ? decodeEntities(flagMatch[1]) : '';

    const thumbMatch = /<div class="thumb ([^"]+)"(?: data-loop="([^"]*)")?>([\s\S]*?)<\/div>/.exec(body);
    let thumb = null;
    if (thumbMatch) {
      const cls = thumbMatch[1];
      const thumbInner = thumbMatch[3];
      const img = /<img\s+src="([^"]+)"\s+alt="([^"]*)"/.exec(thumbInner);
      const icon = /<use\s+href="#([^"]+)"/.exec(thumbInner);
      if (cls === 'photo' && img) {
        thumb = { type: 'photo', src: decodeEntities(img[1]), alt: decodeEntities(img[2]) };
        if (thumbMatch[2]) thumb.loop = decodeEntities(thumbMatch[2]);
      } else if (icon) {
        thumb = { type: 'icon', class: cls, icon: icon[1] };
      }
    }

    const h3Match = /<h3>([^<]*)<\/h3>/.exec(body);
    const title = h3Match ? decodeEntities(h3Match[1]) : '';

    const roleMatch = /<div class="role">([\s\S]*?)<\/div>/.exec(body);
    const role = roleMatch ? decodeEntities(roleMatch[1].trim()) : '';

    let interaction;
    if (attrs.__lightbox) {
      interaction = {
        type: 'lightbox',
        title: attrs['data-title'] ? decodeEntities(attrs['data-title']) : '',
        desc: attrs['data-desc'] ? decodeEntities(attrs['data-desc']) : '',
        video: decodeEntities(attrs['data-video'] || ''),
        link: decodeEntities(attrs['data-link'] || ''),
        linkLabel: decodeEntities(attrs['data-link-label'] || ''),
        pin: attrs['data-pin'] || ''
      };
    } else if ((attrs.href || '').startsWith('/projects/')) {
      interaction = { type: 'page', href: decodeEntities(attrs.href) };
    } else {
      interaction = { type: 'link', href: decodeEntities(attrs.href || '') };
    }

    const card = {
      id: slugify(title),
      title,
      role,
      category: attrs['data-cat'] || '',
      flag,
      thumb,
      interaction
    };
    cards.push(card);
  }
  // de-dupe ids
  const seen = {};
  for (const c of cards) {
    if (seen[c.id]) {
      seen[c.id]++;
      c.id = c.id + '-' + seen[c.id];
    } else {
      seen[c.id] = 1;
    }
  }
  return cards;
}

function renderThumb(thumb) {
  if (!thumb) return '<div class="thumb"></div>';
  if (thumb.type === 'photo') {
    const loop = thumb.loop ? ` data-loop="${encodeEntities(thumb.loop)}"` : '';
    return `<div class="thumb photo"${loop}><img src="${encodeEntities(thumb.src)}" alt="${encodeEntities(thumb.alt || '')}" loading="lazy"></div>`;
  }
  return `<div class="thumb ${thumb.class}"><svg><use href="#${thumb.icon}"/></svg></div>`;
}

function renderCard(card, opts) {
  const lines = [];
  // Preview only: a draft is shown greyed and dashed so it can be checked in
  // place. The published page never contains drafts at all.
  const cls = opts && opts.draft
    ? 'card" style="opacity:.45;outline:2px dashed #b23a2e;outline-offset:4px'
    : 'card';
  // "--" would end the comment early
  lines.push(`      <!-- ${String(card.title).replace(/--/g, '- -')} -->`);
  let openTag;
  if (card.interaction.type === 'lightbox') {
    const it = card.interaction;
    const parts = [`data-cat="${card.category}"`, 'data-lightbox'];
    if (it.pin) parts.push(`data-pin="${it.pin}"`);
    parts.push(`\n        data-title="${encodeEntities(it.title)}"`);
    parts.push(`data-desc="${encodeEntities(it.desc)}"`);
    parts.push(`data-video="${encodeEntities(it.video)}"`);
    if (it.link || it.linkLabel) {
      parts.push(`data-link="${encodeEntities(it.link)}" data-link-label="${encodeEntities(it.linkLabel)}"`);
    }
    // no href, so role + tabindex make it reachable and announced as a button
    openTag = `<a class="${cls}" role="button" tabindex="0" ${parts.join(' ')}>`;
  } else if (card.interaction.type === 'page') {
    openTag = `<a class="${cls}" data-cat="${card.category}" href="${encodeEntities(card.interaction.href)}">`;
  } else {
    openTag = `<a class="${cls}" data-cat="${card.category}" href="${encodeEntities(card.interaction.href)}" target="_blank" rel="noopener">`;
  }
  lines.push(`      ${openTag}`);
  lines.push(`        <div class="tape"></div><div class="cat-flag">${encodeEntities(card.flag)}</div>`);
  lines.push(`        ${renderThumb(card.thumb)}`);
  lines.push(`        <h3>${encodeEntities(card.title)}</h3>`);
  lines.push(`        <div class="role">${encodeEntities(card.role)}</div>`);
  lines.push('      </a>');
  return lines.join('\n');
}

// A card with visible === false is a draft: it stays in projects.json (and
// so in git) but is left out of the HTML entirely — hiding it with CSS would
// still ship it in the page source. {preview:true} renders drafts greyed.
function renderGrid(cards, opts) {
  const preview = !!(opts && opts.preview);
  const shown = cards.filter((c) => preview || c.visible !== false);
  return '<div class="grid">\n\n' +
    shown.map((c) => renderCard(c, { draft: c.visible === false })).join('\n\n') +
    '\n\n    </div>';
}

module.exports = { findGridBlock, parseCards, renderCard, renderGrid, slugify };
