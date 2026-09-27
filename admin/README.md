# Portfolio admin tool

A small local tool for editing the gallery on martinposta.com without hand-editing HTML.

## Run it

- **Mac:** double-click **start.command**.
- **Windows:** double-click **start.bat**.

Either opens http://localhost:4173 in your browser automatically. Close the
terminal window (or press Ctrl+C in it) to stop the server when you're done.

No `npm install` needed — the whole tool is plain Node.js, zero dependencies.
(Requires Node.js, which is already installed on this Mac.)

## What it does

- Reads/writes **content/projects.json** — this is the source of truth for
  every card in the "Portfolio" gallery on the homepage (title, category,
  role text, thumbnail, and what happens when you click it: external link,
  a project page, or the lightbox with video + description).
- **Preview** renders your *unsaved* edits into a full copy of the real
  page — real `notebook.css`, real header/footer, real thumbnails — with a
  red "PREVIEW" banner, and opens it in a new tab. **Nothing is written to
  disk.** Use this to visually check a change before publishing it.
- **Save & publish to index.html** writes `content/projects.json` *and*
  regenerates the `<div class="grid">…</div>` block inside `site/index.html`
  to match — everything else on the page (hero, header/footer, lightbox
  markup, script tags) is left completely untouched.
- Both files are in git, so every earlier version can be recovered from the
  history. (The old `backup/` folder of timestamped copies is gone.)
- Uploading a new thumbnail image writes it straight into
  `site/images/thumbs/` and fills in its path for you.

## Adding a new project

1. Click **+ Add new card**.
2. Fill in the title, role/credit line, category and flag label.
3. Pick a thumbnail (upload a photo, or pick one of the icon glyphs used for
   the studio-project cards like "Little Flames Rising" or "Control").
4. Pick what happens when the card is clicked:
   - **External link** — for anything that already has its own page
     (IMDb, Steam, a studio site…).
   - **Dedicated project page** — if you've already written a
     `/projects/xxx.html` page for it (copy an existing one as a starting
     point — they all use the same header/footer/notebook.css include).
   - **Lightbox** — fills in the popup with a video embed + description
     right on the homepage, no separate page needed.
5. Click **Preview** to check it looks right, then **Save & publish** when
   you're happy with the whole list.

## If index.html ever gets hand-edited directly

Run `node tools/resync-from-html.js` (from this `admin` folder) to
re-read the grid out of `index.html` and overwrite `content/projects.json` to
match again. It only touches the JSON file, never `index.html`.

## Notes / limits (first version)

- Reordering is drag-and-drop by the ⠿ handle; the order in the list is the
  order the cards appear on the site.
- This tool only manages the homepage gallery grid. The individual
  `/projects/*.html` pages are still hand-written HTML — same as before.
- Thumbnails are used as-is (no automatic resizing yet); keep new uploads
  roughly the same size as the existing `*_thumb.jpg` files for a consistent
  grid.
- No authentication — fine on localhost. If this is ever moved to Proxmox
  for remote access, add a login/shared-secret layer in front of it first.
