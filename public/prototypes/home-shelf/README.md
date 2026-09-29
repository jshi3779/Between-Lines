# Home shelf prototype

A standalone, single-file HTML recreation of the **home / notebook shelf** screen from the
Collage Poetry Figma file (画板 `Screen / Shelfopen` / `Shelfopen2`, and the icon board at
node `123:1970`). It's independent of the Vite + React app in `src/` — open `index.html`
directly in a browser, no build step, no dependencies.

Lives under `public/` so it's carried into `dist/` untouched by the Vite build and served
live at `https://jshi3779.github.io/Between-Lines/prototypes/home-shelf/` alongside the
React app, without being part of it.

## What it covers

- The 3D "book browsing" shelf: tap a spine, or drag/flick the shelf, to turn a notebook
  from its leaning spine to a standing cover (the same effect referenced from
  https://codepen.io/jkantner/pen/xrRPRL, adapted to this app's book art).
- Two starting shelves (5 notebooks each) matching the Figma artwork exactly — spines,
  covers, lean angles and colours were extracted and straightened from the exported Figma
  assets, not hand-approximated.
- The bottom navigation bar (search / new notebook / capsules / settings), with the
  unselected (solid) and selected (ring) icon states from the icon board.
- A working "new notebook" flow: adding one fills the current shelf to 5, then opens a new
  shelf below it; every notebook (leaning or standing) sits exactly 10px above its shelf's
  line, and shelves are spaced so the next shelf's tallest point is exactly 35px below the
  previous shelf's standing line. Past two shelves, adding a notebook that starts a new
  shelf pages the view up by one shelf's height.
- The `851 GBai Marker` font and every image asset are embedded as data URIs, so the file
  has zero external dependencies and works fully offline.

## Status

This is a prototype/reference for the home screen only — it does not share state or code
with the `src/App.jsx` editor screens. If the home shelf gets rebuilt as a React component,
this file is the interaction/positioning spec to match (see the inline comments for the
exact geometry rules: `SHELF_GAP`, `LINE_GAP`, `BOT_STEP`, the `vext()` calibration for a
leaning book's true rendered height, etc).
