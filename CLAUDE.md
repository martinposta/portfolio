# martinposta.com — project notes for Claude Code

Portfolio site for Martin Pošta (character animator / rigger / indie game
developer, Prague). Hand-built "notebook / exposure sheet" themed static
site. **The published site is static — no framework, no bundler.** The admin
tool generates parts of the HTML and commits the result; GitHub Pages serves
the files as they are.

## Repository layout

```
site/        everything GitHub Pages publishes — nothing else goes live
  index.html        homepage; the gallery grid between ADMIN:GRID markers is generated
  projects/*.html   one page per project, GENERATED from content/pages/*.json
  images/doodles/   drawings for the doodle block (svg/png/gif/webm)
  assets/           notebook.css (whole design system), include.js
  partials/         header/footer, injected by include.js
  images/           thumbs/, projects/, texture/
  CNAME, posta_resume.pdf
content/     source data the admin edits: projects.json (gallery cards),
             pages/<slug>.json (project pages as block lists)
admin/       local Node admin tool (zero dependencies)
design/      working files that must not be published (style guide, .afpub)
```

Repo: `martinposta/portfolio` (public, default branch `main`). Branches:
- `main` — the site. Created from `redesign`; history continues from it.
  **Every push to main that touches `site/` goes live** (~1 min):
  `.github/workflows/pages.yml` uploads `site/` and nothing else.
- `redesign` — what Pages served until 2026-09-27 (uploaded through the
  GitHub web UI in July). Kept as the rollback: Settings → Pages → source
  "Deploy from a branch: redesign". The `github-pages` environment allows
  deploys from `main` and `redesign` only.
- `gh-pages` — the old Bootstrap site. `master` — only the 2019 README.

Cloudflare sits in front of the domain and caches pages for ~10 minutes, so
a fresh deploy can take that long to show without a cache-busting `?v=`.

## Site architecture

- `assets/notebook.css` — the entire design system (typewriter/handwritten
  fonts, spiral-notebook motifs, coffee-stain textures, tape/pin variants,
  lightbox, gallery card/thumb styles). Every page links this one file.
- `assets/include.js` — (1) `data-include` fetch-based header/footer
  injection, (2) the shared lightbox driven by each card's `data-*`
  attributes, (3) obfuscated email + mobile menu toggle.
- Project pages share one template: header include → `.back-link` → `.hero`
  with `.project-meta` tape-labels → `.prose` → `.screen`/`.reel-card` video
  or photo frames (`.pin-2/3/4` vary paper colour/rotation) → footer include.
- Every page needs `<meta name="viewport">` — without it phones render the
  980 px desktop layout and the 640 px media queries never fire. It was
  missing on all pages until 2026-09-27, so the phone rules at the end of
  `notebook.css` are new and were measured, not assumed: 2 gallery columns
  below 760 px, narrower spine/gutters below 640 px.
- **Decorations that hang past the edge (coffee ring, crumbs) widen the page
  on a phone.** They are clipped with `overflow-x:clip` on `.wrap`/`footer`
  below 1240 px. Clipping `html` or `body` does not work: the phone sizes
  its layout viewport to the content on load (innerWidth 499 on a 375
  screen) before that applies. How to check: every page in a 375 px iframe,
  compare `scrollWidth` with `innerWidth`.

### Gallery cards (`content/projects.json` → `site/index.html`)

Each card is `link` (external, new tab), `page` (a `/projects/*.html`) or
`lightbox` (video + description + optional link, no separate page). Thumbs are
a photo in `images/thumbs/` or one of the inline SVG `<symbol>`s in
`index.html`. Do not hand-edit the grid block — use the admin, or run
`admin/tools/resync-from-html.js` afterwards.

## Admin tool (`admin/`)

`node admin/server.js` (or `start.command` / `start.bat`) → http://localhost:4173/admin/.
Preview renders unsaved edits into a copy of the homepage without writing;
Save writes `content/projects.json` and regenerates the grid block.
`admin/lib/cards.js` is the parser/renderer shared by save, preview and
resync. **Everything written into HTML goes through `encodeEntities`** —
until 2026-09-27 it escaped only `&`, and a `"` in a description silently cut
the attribute and the text short. Round trip of all 28 real cards verified
identical after the fix.

## Plan (agreed 2026-09-27)

1. ✅ Viewport meta, escaping, repo under git, folder split into site/content/admin.
2. ✅ GitHub Actions workflow publishing `site/`; Pages switched from `redesign` (2026-09-27).
3. ✅ Admin ↔ git (2026-09-27, admin/lib/git.js): fetch + fast-forward pull on start, re-fetch before every
   save (refuse if `main` moved), commit + push on save, warn about files not
   in git. Drafts: `visible:false` cards are committed but never rendered into
   the HTML (hiding them with CSS would leave them in the page source). The
   repo is public, so drafts are visible on GitHub — accepted.
4. ✅ Admin: thumbnails resized in the browser (shorter side 600 px, WebP;
   JPEG where the browser cannot encode WebP), uploads never silently
   overwrite, server validates category / links / page paths / icons / video
   links, pasted Vimeo/YouTube page links become player URLs.
5. ✅ (branch pages-editor, awaiting Martin's review) Project pages as block lists in `content/pages/*.json`, generated into
   `site/projects/*.html` (block types: text, heading, video, photos, buttons,
   credit card, doodle). Concept: https://claude.ai/artifact/3kHaqxoY8cHXLV2eqHT4FR
   (gallery concept: https://claude.ai/artifact/UVrxmPhpBE4NFG1cwrtUBK).
6. ✅ (branch animations, awaiting review) Animation: hover loops on cards, a flipbook/doodle system
   (`images/doodles/`, SVG/PNG/WebM, static or animated), cards reshuffling
   with overshoot on tab change, pencil-drawn heading underlines, lightbox
   landing like a pinned sheet. All respect `prefers-reduced-motion`.
7. Bake header/footer into the HTML at publish time, meta/OG tags,
   self-hosted fonts.
8. Windows + Proxmox copies of the admin (deploy key, Tailscale) — last.

## Local preview

`.claude/launch.json` has `site` (python static server on :8000, serving
`site/` as the web root, so root-relative links work) and `admin` (:4173).
`include.js` needs http(s), not `file://`.

## Admin ↔ git (how it behaves)

- `POST /api/sync` on open: fetch, `merge --ff-only` when only behind. Diverged,
  wrong branch or a failed pull are shown as a red bar, never auto-resolved.
- `PUT /api/projects {cards, message, head}`: fetch again; refuse (409, nothing
  written) when origin/main moved **or** this copy's HEAD differs from `head`
  (the commit the page loaded at — catches a second tab). Then write, commit
  `site/` + `content/`, push. A failed push keeps the commit; the page offers
  "Push now". Verified against a throwaway bare remote: two copies, stale
  head, offline publish + retry.
- The server listens on 127.0.0.1 (`HOST` overrides) because there is no login.
- HTTPS for martinposta.com is Cloudflare's job, not GitHub's: DNS is proxied
  through Cloudflare, so GitHub never gets a certificate and its
  "Enforce HTTPS" switch cannot be turned on. The http→https redirect is
  Cloudflare's "Always Use HTTPS" (owner's dashboard).
- The Browser preview tool reads `.claude/launch.json` from the folder the
  Claude Code session **started** in, even after the session moves. Started
  from TheBook it only saw TheBook's configs; the portfolio ones were added
  there temporarily for testing and removed again. Start sessions for this
  project in this folder.
- Testing the admin in the browser works on the real repo: never click
  Publish there while testing, it pushes to main and goes live. Test publish
  flows against a throwaway clone (`git clone --bare . /tmp/x.git`, clone
  that, run `PORT=4199 node admin/server.js` inside it).
- **Every clone needs `git config user.email 33331553+martinposta@users.noreply.github.com`.**
  The GitHub account blocks pushes that would publish the private address
  (GH007), and the admin's publish would fail on its push step. Set on the
  Mac 2026-09-27; do the same on the Windows and Proxmox copies.

## Project pages (`admin/lib/pages.js`, admin tab "Project pages")

- `content/pages/<slug>.json` → `site/projects/<slug>.html`. **Never hand-edit
  the HTML**: the next publish of that page overwrites it (the file says so
  in a comment). Blocks: text (normal / tight = one line per paragraph /
  muted), heading, video, photos, buttons, credit, doodle.
- The renderer writes the markup the pages were hand-written with; the
  inline styles each page carried became classes in `notebook.css` (section
  "generated project pages"). Converting the seven pages kept every URL and
  sentence; page heights changed by 0–4 %.
- Paper "auto" hands out pin 1→2→3→4 in turn per page; an explicit choice does
  not advance the sequence. The converted pages carry their original pins.
- Inline text: `*italic*`, `[label](https://…)`; everything else is escaped.
- Draft page (`visible:false`): JSON committed, HTML removed/not written. The
  server refuses a live card pointing at a draft page, making a page a draft
  or deleting it while a live card opens it, and any video that is not a
  Vimeo/YouTube player URL. Address (slug) is locked after first publish.
- The preview is `renderPage(page, {preview:true})`, which keeps
  `data-block` markers so clicking in the preview selects the block.
- Uploads: `POST /api/upload {target: thumbs|projects|doodles}`. Thumbs are
  shrunk to a 600 px shorter side, project photos to a 1600 px longer side,
  doodles are uploaded untouched (they may be animated).
- **Branch switcher** (topbar "Branch", `POST /api/checkout`): lets Martin look
  at a review branch (e.g. `animations`) as the local site at
  http://localhost:4173/ without a terminal. Refuses with any uncommitted
  file. Only offers branches whose own `admin/public/common.js` contains the
  switcher: the admin UI is served from the checked-out files, so switching
  to a branch without it (the old `redesign`, or a branch cut before
  2026-09-28) would leave no way back. **Create review branches from a main
  that has the switcher.** The running server keeps its in-memory code; a
  branch that changes `admin/server.js` needs a restart to see those changes.

## Motion (`site/assets/include.js`, end of file)

- All of it is decoration on a page that is complete without it, and all of
  it is skipped under `prefers-reduced-motion`.
- Movement uses the individual `translate`/`scale`/`rotate` properties via
  the Web Animations API, **never `transform`**: cards, papers and the
  lightbox already carry their tilt in `transform`, and animating it would
  flatten them (verified: a card keeps its -1.4° after the filter animation).
- Category tabs are `<button>`s now (they were `<div>`s, unreachable by
  keyboard). Filtering is FLIP: measure, toggle display, measure, animate the
  difference with an overshoot; newly shown cards pop in staggered.
- Section headings get an SVG pencil line (`pathLength="1"`, dashoffset 1→0)
  when 80 % visible. IntersectionObserver does not fire while the Browser
  pane is hidden — take a screenshot before measuring.
- Lightbox cards have no href, so the renderer gives them `role="button"
  tabindex="0"`; Enter/Space open them, focus goes to × and back to the card.
- Hover loops: `thumb.loop` (`/images/loops/*.webm|mp4`) renders as
  `data-loop` on the thumb; the `<video>` is created on first hover only and
  never on touch screens. Uploaded untouched from the card editor.
