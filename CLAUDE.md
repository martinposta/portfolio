# martinposta.com — project notes for Claude Code

Portfolio site for Martin Pošta (character animator / rigger / indie game
developer, Prague). Redesign from an old Bootstrap site to a hand-built
"notebook / exposure sheet" themed static site. **Static only — no build
step, no Jekyll, no framework.** Hosted on GitHub Pages with a custom
domain (see `CNAME.txt`).

## Architecture

- `index.html` — homepage: hero, embedded showreel, and the `#portfolio`
  gallery grid (category tabs + cards).
- `assets/notebook.css` — the entire design system (typewriter/handwritten
  fonts, spiral-notebook motifs, coffee-stain textures, tape/pin variants,
  lightbox, gallery card/thumb styles). Every page links this one file.
- `assets/include.js` — three jobs: (1) `data-include="/partials/x.html"`
  fetch-based header/footer injection so nav edits happen in one place, (2)
  the shared lightbox (`openLightbox`/`closeLightbox`, driven by each
  card's `data-*` attributes), (3) obfuscated-email + mobile menu toggle.
- `partials/header.html`, `partials/footer.html` — injected on every page.
- `projects/*.html` — one hand-written page per project that has a
  dedicated page (as opposed to an external link or a lightbox). All follow
  the same template: header include → `.back-link` → `.hero` with
  `.project-meta` tape-labels → `.prose` → one or more `.screen`/`.reel-card`
  video embeds (`.pin-2/3/4` classes vary the paper color/rotation) → footer
  include. Copy an existing one as a starting point for a new page.
- `data/projects.json` — **source of truth for the homepage gallery grid**
  (see Admin tool below). Do not hand-edit `index.html`'s grid directly
  once this exists — use the admin tool so the two stay in sync.

### Gallery card interaction types (`data/projects.json` → rendered into
`index.html`'s `<!-- ADMIN:GRID:START -->…<!-- ADMIN:GRID:END -->` block)

Each card is one of:
- **`link`** — external link (IMDb, Steam, a studio site…), opens in a new tab.
- **`page`** — links to one of the `/projects/*.html` pages above.
- **`lightbox`** — opens the shared lightbox with a video embed + description
  + optional link button, no separate page needed.

Thumbnails are either a real photo (`/images/thumbs/*.jpg`) or, for the
handful of studio/dev projects without a still (Little Flames Rising,
Control), one of the SVG icon symbols defined inline in `index.html`.

## Admin tool (`admin-tool/`)

A local, zero-dependency Node.js app (built-ins only — **no `npm install`
needed**) for editing the gallery without hand-editing HTML. Mirrors the
pattern of Martin's other local tools (e.g. the civitai-viewer randomizer):
double-click a launcher, use a localhost UI.

**Run it:** double-click `admin-tool/start.command` (Mac) or
`admin-tool/start.bat` (Windows), or `node admin-tool/server.js`. Opens
http://localhost:4173.

- **Reload from disk** — re-reads `data/projects.json`.
- **Preview** — POSTs the current *unsaved* edits to `/api/preview`, which
  renders them into a full copy of `index.html` (served with a red "PREVIEW
  — unsaved changes" banner) using the real `notebook.css`/thumbnails/
  header/footer, and opens it in a new tab. **Nothing is written to disk.**
  Use this before publishing to visually check a change.
- **Save & publish to index.html** — writes `data/projects.json`, backs up
  the current `index.html` into `backup/` (timestamped), then regenerates
  the grid block in `index.html` in place. Everything outside that block
  (hero, header/footer includes, script tags, lightbox markup) is left
  untouched.
- **+ Add new card** / edit / delete / drag-to-reorder (⠿ handle) for each
  card; thumbnail upload writes straight into `images/thumbs/`.
- `admin-tool/lib/cards.js` — the parser/renderer shared by save & preview
  (regex-based, tag-depth-aware, no HTML parser dependency).
- `admin-tool/tools/resync-from-html.js` — safety net: if `index.html` is
  ever hand-edited directly, run `node tools/resync-from-html.js` (from
  `admin-tool/`) to re-derive `data/projects.json` from it again.

The parser/renderer round-trip was verified against the real `index.html`
(28 cards) before this was wired up — round-trips structurally exactly,
modulo a couple of cosmetically-empty `data-link=""` attributes that have
zero behavioral difference.

## Status (as of this session)

Done:
- Full redesign shipped locally: homepage gallery (28 cards across
  feature/vfx/games/shorts), 7 dedicated project pages, shared
  header/footer/lightbox/textures, English copy, mobile menu, obfuscated
  email, coffee-stain/photo texture, 4 lightbox/pin background variants.
- Gallery data extracted into `data/projects.json`; `index.html`'s grid is
  now generated from it via the admin tool (markers added on first Save).
- Admin tool v1 built: CRUD + drag reorder + thumbnail upload + Preview +
  Save & publish + Mac/Windows launchers, verified end-to-end against the
  real site files on this machine.
- Cleaned up leftover placeholder-note wrapper tags in `neil.html`,
  `plodymraku.html`, `figurespacing.html` now that their real
  behind-the-scenes photos are in place.

Not done yet / open threads:
- **GitHub Pages deployment**: current plan is a branch on the existing
  `martinposta/portfolio` repo (keep `main` live), switch Pages source once
  verified, and confirm a `CNAME` exists on that branch too. Not yet
  executed from a Claude Code session — this is Martin's own git/GitHub
  workflow.
- **Remote access for the admin tool**: Martin plans to eventually move
  this app to his Proxmox homelab for remote access instead of only
  localhost. Before exposing it beyond localhost: **it currently has zero
  authentication** — add at minimum a shared secret / basic auth in front
  of it (e.g. a reverse proxy) before it's reachable off the local machine.
  The server already binds to all interfaces by default, so no code change
  is required for reachability — only for auth.
- Thumbnail uploads are stored as-is (no auto-resize/compression yet).
- Reordering is a simple drag handle (no touch support yet).
- The individual `/projects/*.html` pages are still hand-written — the
  admin tool only manages the homepage gallery grid, not project pages.
