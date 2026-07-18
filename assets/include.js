// include.js
// Loads shared header/footer into any page that has the placeholders below,
// wires up the mobile menu, the video lightbox, and the obfuscated email.
//
// Usage on any page:
//   <div data-include="/partials/header.html"></div>
//   ...page content...
//   <div data-include="/partials/footer.html"></div>
//
// NOTE: fetch() needs http(s), not file://. Test locally with:
//   python -m http.server   (then open http://localhost:8000)

async function includeHTML(el) {
  const url = el.getAttribute('data-include');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    el.outerHTML = await res.text();
    // Elements inserted via outerHTML don't run their own <script> tags,
    // so anything the partial needs done in JS has to happen from here.
    revealEmail();
    wireMenuToggle();
  } catch (err) {
    console.error('include.js: failed to load', url, err);
  }
}

// Builds the contact email address at runtime instead of printing it as
// plain text in the HTML source. Not unbreakable — a scraper running a full
// headless browser that executes JS can still get it — but it stops
// plain-text scrapers and non-JS crawlers, which most bots (including most
// AI training crawlers, which typically fetch raw HTML only) rely on.
function revealEmail() {
  const slot = document.getElementById('email-slot');
  if (!slot || slot.dataset.filled) return;
  slot.dataset.filled = '1';
  const user = ['m4r', 'tinpo', 'sta'].join('');
  const domain = ['gm', 'ail'].join('') + '.' + 'com';
  const address = user + '@' + domain;
  const link = document.createElement('a');
  link.href = 'mailto:' + address;
  link.textContent = address;
  slot.appendChild(link);
}

// Mobile hamburger menu: toggles the off-canvas nav, closes it again
// whenever a link inside it is clicked.
function wireMenuToggle() {
  const btn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('nav');
  if (!btn || !nav || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => nav.classList.remove('open'))
  );
}

// ---- Lightbox: video + description + links, driven entirely by data-*
// attributes on the triggering card. No video? It just hides that part.
function openLightbox(card) {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  const title = card.getAttribute('data-title') || '';
  const desc = card.getAttribute('data-desc') || '';
  const video = card.getAttribute('data-video');
  const linkUrl = card.getAttribute('data-link');
  const linkLabel = card.getAttribute('data-link-label') || 'Link';

  // background variant — same idea as the .screen pin-2/3/4 classes,
  // set per-card with data-pin="2" (etc). No attribute = default look.
  const frame = overlay.querySelector('.lightbox-frame');
  if (frame) {
    frame.classList.remove('pin-2', 'pin-3', 'pin-4');
    const pin = card.getAttribute('data-pin');
    if (pin) frame.classList.add('pin-' + pin);
  }

  document.getElementById('lightbox-title').textContent = title;
  document.getElementById('lightbox-desc').textContent = desc;

  const videoWrap = document.getElementById('lightbox-video-wrap');
  if (video) {
    videoWrap.style.display = 'block';
    videoWrap.innerHTML = '<iframe src="' + video + '" allow="autoplay; fullscreen" allowfullscreen></iframe>';
  } else {
    videoWrap.style.display = 'none';
    videoWrap.innerHTML = '';
  }

  const linksWrap = document.getElementById('lightbox-links');
  linksWrap.innerHTML = '';
  if (linkUrl) {
    const a = document.createElement('a');
    a.href = linkUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'tape-label blue';
    a.textContent = linkLabel + ' ↗';
    linksWrap.appendChild(a);
  }

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.getElementById('lightbox-video-wrap').innerHTML = ''; // stop playback
}

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-lightbox]');
  if (card) {
    e.preventDefault();
    openLightbox(card);
    return;
  }
  if (e.target.closest('.lightbox-close') || e.target.id === 'lightbox-overlay' || e.target.classList.contains('lightbox-frame')) {
    closeLightbox();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-include]').forEach(includeHTML);
  wireMenuToggle(); // in case a page has a static (non-included) header
});
