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
  projects/*.html   one page per project (hand-written today, generated later)
  assets/           notebook.css (whole design system), include.js
  partials/         header/footer, injected by include.js
  images/           thumbs/, projects/, texture/
  CNAME, posta_resume.pdf
content/     source data the admin edits (projects.json = gallery cards)
admin/       local Node admin tool (zero dependencies)
design/      working files that must not be published (style guide, .afpub)
```

Repo: `martinposta/portfolio` (public). Branches:
- `main` — this work. Created from `redesign`; history continues from it.
- `redesign` — what martinposta.com serves **today** (Pages source = this
  branch, legacy build). Uploaded through the GitHub web UI in July 2026.
- `gh-pages` — the old Bootstrap site. `master` — only the 2019 README.

Until the switch-over, pushing to `main` changes nothing on the live site.
The switch is: Pages source → GitHub Actions workflow that uploads `site/`.
`redesign` stays as the instant rollback.

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
  missing on all pages until 2026-09-27.

### Gallery cards (`content/projects.json` → `site/index.html`)

Each card is `link` (external, new tab), `page` (a `/projects/*.html`) or
`lightbox` (video + description + optional link, no separate page). Thumbs are
a photo in `images/thumbs/` or one of the inline SVG `<symbol>`s in
`index.html`. Do not hand-edit the grid block — use the admin, or run
`admin/tools/resync-from-html.js` afterwards.

## Admin tool (`admin/`)

`node admin/server.js` (or `start.command` / `start.bat`) → http://localhost:4173.
Preview renders unsaved edits into a copy of the homepage without writing;
Save writes `content/projects.json` and regenerates the grid block.
`admin/lib/cards.js` is the parser/renderer shared by save, preview and
resync. **Everything written into HTML goes through `encodeEntities`** —
until 2026-09-27 it escaped only `&`, and a `"` in a description silently cut
the attribute and the text short. Round trip of all 28 real cards verified
identical after the fix.

## Plan (agreed 2026-09-27)

1. ✅ Viewport meta, escaping, repo under git, folder split into site/content/admin.
2. GitHub Actions workflow publishing `site/`; switch Pages from `redesign`.
3. ✅ Admin ↔ git (2026-09-27, admin/lib/git.js): fetch + fast-forward pull on start, re-fetch before every
   save (refuse if `main` moved), commit + push on save, warn about files not
   in git. Drafts: `visible:false` cards are committed but never rendered into
   the HTML (hiding them with CSS would leave them in the page source). The
   repo is public, so drafts are visible on GitHub — accepted.
4. Admin: resize images in the browser (canvas → WebP) before upload, refuse
   silent overwrites, validate category / video links / page paths.
5. Project pages as block lists in `content/pages/*.json`, generated into
   `site/projects/*.html` (block types: text, heading, video, photos, buttons,
   credit card, doodle). Concept: https://claude.ai/artifact/3kHaqxoY8cHXLV2eqHT4FR
   (gallery concept: https://claude.ai/artifact/UVrxmPhpBE4NFG1cwrtUBK).
6. Animation: hover loops on cards, a flipbook/doodle system
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
- Claude Code sessions opened from another project keep that project's
  `.claude/launch.json` for the preview tool — open a session in this folder
  to use the `site`/`admin` configs.
