// include.js
// The header and footer are written into every page by the admin (from
// content/site.json); this script only brings them to life: the contact
// email, the mobile menu, the lightbox and the motion.
// (It used to fetch the header and footer from /partials after load.)

// Builds the contact email address at runtime instead of printing it as
// plain text in the HTML source. Not unbreakable — a scraper running a full
// headless browser that executes JS can still get it — but it stops
// plain-text scrapers and non-JS crawlers, which most bots (including most
// AI training crawlers, which typically fetch raw HTML only) rely on.
function revealEmail() {
  const slot = document.getElementById('email-slot');
  if (!slot || slot.dataset.filled) return;
  slot.dataset.filled = '1';
  // the footer carries the address reversed, so the page source holds no
  // recognisable email; the admin writes it from content/site.json
  const address = (slot.dataset.e || '').split('').reverse().join('');
  if (!address) return;
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
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); })
  );
}

// ---- Lightbox: video + description + links, driven entirely by data-*
// attributes on the triggering card. No video? It just hides that part.
// One place that puts a player into the lightbox (or removes it), and
// remembers which video it holds, so a warmed-up player is reused.
function setPlayer(wrap, video) {
  wrap.innerHTML = video ? '<iframe src="' + video + '" allow="autoplay; fullscreen" allowfullscreen></iframe>' : '';
  wrap.dataset.src = video || '';
}

// Warm-up: when the pointer rests on a lightbox card for a moment, the
// player starts loading in the still-hidden lightbox, so it is ready sooner
// after the click (measured: ~0.35 s of player start-up). The video itself
// is not downloaded until someone presses play. Pointer devices only.
function initLightboxWarmup() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const wrap = document.getElementById('lightbox-video-wrap');
  const overlay = document.getElementById('lightbox-overlay');
  if (!wrap || !overlay) return;
  let timer = null;
  document.querySelectorAll('[data-lightbox][data-video]').forEach((card) => {
    card.addEventListener('pointerenter', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const video = card.getAttribute('data-video');
        if (video && !overlay.classList.contains('open') && wrap.dataset.src !== video) setPlayer(wrap, video);
      }, 150);   // passing over the card while scrolling does not count
    });
    card.addEventListener('pointerleave', () => clearTimeout(timer));
  });
}

let lastTrigger = null;   // the card that opened the lightbox gets focus back on close

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
    // the player may already be loading since the pointer rested on the card
    if (videoWrap.dataset.src !== video) setPlayer(videoWrap, video);
  } else {
    videoWrap.style.display = 'none';
    setPlayer(videoWrap, '');
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
  lastTrigger = card;
  overlay.querySelector('.lightbox-close').focus({ preventScroll: true });
  landLightbox(overlay);
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  setPlayer(document.getElementById('lightbox-video-wrap'), ''); // stop playback
  if (lastTrigger) { lastTrigger.focus({ preventScroll: true }); lastTrigger = null; }
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
  // lightbox cards are role=button: Enter and Space open them like a click
  const card = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-lightbox]');
  if (card) { e.preventDefault(); openLightbox(card); }
});

document.addEventListener('DOMContentLoaded', () => {
  revealEmail();
  wireMenuToggle();
  initGalleryFilter();
  initPencilUnderlines();
  initHoverLoops();
  initLightboxWarmup();
});

// ---- Motion --------------------------------------------------------------
// Everything below is decoration on top of a page that is complete without
// it, and all of it steps aside for prefers-reduced-motion. Movement uses the
// individual translate/scale/rotate properties, never transform, because the
// cards and papers already carry their tilt in transform and must keep it.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Category tabs. Cards that stay visible glide from where they were to where
// they land, with a small overshoot; cards that appear pop in, staggered.
// (FLIP: measure, change the layout, measure again, animate the difference.)
function initGalleryFilter() {
  const tabs = [...document.querySelectorAll('.tabs .tab')];
  const cards = [...document.querySelectorAll('.grid .card')];
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => { t.classList.toggle('active', t === tab); t.setAttribute('aria-pressed', String(t === tab)); });
    const f = tab.dataset.filter;
    const before = new Map(cards.filter((c) => c.offsetParent).map((c) => [c, c.getBoundingClientRect()]));
    cards.forEach((c) => { c.getAnimations().forEach((a) => a.cancel()); c.style.display = (f === 'all' || c.dataset.cat === f) ? '' : 'none'; });
    if (reducedMotion()) return;
    let n = 0;
    cards.forEach((c) => {
      if (!c.offsetParent) return;
      const was = before.get(c), now = c.getBoundingClientRect();
      if (was) {
        const dx = was.left - now.left, dy = was.top - now.top;
        if (dx || dy) c.animate([{ translate: dx + 'px ' + dy + 'px' }, { translate: '0 0' }],
          { duration: 520, easing: 'cubic-bezier(.34,1.4,.64,1)' });
      } else {
        c.animate([{ opacity: 0, scale: '.86', translate: '0 16px' }, { opacity: 1, scale: '1', translate: '0 0' }],
          { duration: 420, delay: Math.min(n++, 8) * 45, easing: 'cubic-bezier(.34,1.5,.64,1)', fill: 'backwards' });
      }
    });
  }));
}

// A pencil stroke under each section heading, drawn when it scrolls into view.
function initPencilUnderlines() {
  const heads = [...document.querySelectorAll('.section-head h2')];
  heads.forEach((h, i) => {
    // three hand-drawn variants so neighbouring headings do not match
    const d = ['M2 6 C 40 2, 80 9, 120 5 S 180 3, 198 6', 'M2 5 C 50 8, 90 1, 140 6 S 185 7, 198 4', 'M3 7 C 30 3, 100 8, 150 4 S 190 5, 197 7'][i % 3];
    h.insertAdjacentHTML('beforeend', '<svg class="pencil-line" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="' + d + '"/></svg>');
  });
  if (reducedMotion() || !('IntersectionObserver' in window)) { heads.forEach((h) => h.classList.add('drawn')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('drawn'); io.unobserve(e.target); }
  }), { threshold: 0.8 });
  heads.forEach((h) => io.observe(h));
}

// The lightbox drops in like a sheet being pinned: from above and tilted,
// past its spot, and settles.
function landLightbox(overlay) {
  if (reducedMotion()) return;
  overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  overlay.querySelector('.lightbox-frame').animate([
    { opacity: 0, translate: '0 -70px', rotate: '-6deg', scale: '1.04' },
    { opacity: 1, translate: '0 8px', rotate: '1.4deg', scale: '1', offset: 0.65 },
    { translate: '0 -2px', rotate: '-.4deg', offset: 0.85 },
    { translate: '0 0', rotate: '0deg' }
  ], { duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)' });
}

// Hover loops: a card whose thumb has data-loop plays that short clip in
// place of the still while the pointer (or keyboard focus) is on it. The
// video is only created on the first hover, so the page loads no video, and
// nothing happens on touch screens, where there is no hover to end it.
function initHoverLoops() {
  if (reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.card .thumb[data-loop]').forEach((thumb) => {
    const card = thumb.closest('.card');
    let video = null;
    const start = () => {
      if (!video) {
        video = document.createElement('video');
        Object.assign(video, { src: thumb.dataset.loop, muted: true, loop: true, playsInline: true, preload: 'auto' });
        video.className = 'thumb-loop';
        video.setAttribute('aria-hidden', 'true');
        thumb.appendChild(video);
      }
      video.play().then(() => video.classList.add('on')).catch(() => {});
    };
    const stop = () => { if (video) { video.classList.remove('on'); video.pause(); } };
    card.addEventListener('mouseenter', start);
    card.addEventListener('focus', start);
    card.addEventListener('mouseleave', stop);
    card.addEventListener('blur', stop);
  });
}
