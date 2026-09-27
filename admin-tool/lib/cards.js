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
function encodeEntities(s) {
  return s.replace(/&/g, '&amp;');
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

    const thumbMatch = /<div class="thumb ([^"]+)">([\s\S]*?)<\/div>/.exec(body);
    let thumb = null;
    if (thumbMatch) {
      const cls = thumbMatch[1];
      const thumbInner = thumbMatch[2];
      const img = /<img\s+src="([^"]+)"\s+alt="([^"]*)"/.exec(thumbInner);
      const icon = /<use\s+href="#([^"]+)"/.exec(thumbInner);
      if (cls === 'photo' && img) {
        thumb = { type: 'photo', src: img[1], alt: decodeEntities(img[2]) };
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
        video: attrs['data-video'] || '',
        link: attrs['data-link'] || '',
        linkLabel: attrs['data-link-label'] || '',
        pin: attrs['data-pin'] || ''
      };
    } else if ((attrs.href || '').startsWith('/projects/')) {
      interaction = { type: 'page', href: attrs.href };
    } else {
      interaction = { type: 'link', href: attrs.href || '' };
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
    return `<div class="thumb photo"><img src="${thumb.src}" alt="${encodeEntities(thumb.alt || '')}" loading="lazy"></div>`;
  }
  return `<div class="thumb ${thumb.class}"><svg><use href="#${thumb.icon}"/></svg></div>`;
}

function renderCard(card) {
  const lines = [];
  lines.push(`      <!-- ${card.title} -->`);
  let openTag;
  if (card.interaction.type === 'lightbox') {
    const it = card.interaction;
    const parts = [`data-cat="${card.category}"`, 'data-lightbox'];
    if (it.pin) parts.push(`data-pin="${it.pin}"`);
    parts.push(`\n        data-title="${encodeEntities(it.title)}"`);
    parts.push(`data-desc="${encodeEntities(it.desc)}"`);
    parts.push(`data-video="${it.video}"`);
    if (it.link || it.linkLabel) {
      parts.push(`data-link="${it.link}" data-link-label="${encodeEntities(it.linkLabel)}"`);
    }
    openTag = `<a class="card" ${parts.join(' ')}>`;
  } else if (card.interaction.type === 'page') {
    openTag = `<a class="card" data-cat="${card.category}" href="${card.interaction.href}">`;
  } else {
    openTag = `<a class="card" data-cat="${card.category}" href="${card.interaction.href}" target="_blank" rel="noopener">`;
  }
  lines.push(`      ${openTag}`);
  lines.push(`        <div class="tape"></div><div class="cat-flag">${encodeEntities(card.flag)}</div>`);
  lines.push(`        ${renderThumb(card.thumb)}`);
  lines.push(`        <h3>${encodeEntities(card.title)}</h3>`);
  lines.push(`        <div class="role">${encodeEntities(card.role)}</div>`);
  lines.push('      </a>');
  return lines.join('\n');
}

function renderGrid(cards) {
  return '<div class="grid">\n\n' + cards.map(renderCard).join('\n\n') + '\n\n    </div>';
}

module.exports = { findGridBlock, parseCards, renderCard, renderGrid, slugify };
