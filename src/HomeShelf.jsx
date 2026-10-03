import { useEffect, useRef } from "react";
import { IMG } from "./homeShelfAssets.js";
import "./home-shelf.css";
import { SAMPLE_CAPSULES } from "./sampleCapsules";
import { LIBRARY_KEY, SHELF_KEY, clearAllSaved, exportBackup, importBackup, loadJSON, notebookKey, removeSaved, saveJSON, storageUsage } from "./storage";

// Ported near-verbatim from public/prototypes/home-shelf/index.html (the standalone shelf
// prototype) so the hand-tuned physics/geometry (spring inertia, silhouette gap solving,
// vext() lean calibration) stays byte-for-byte identical instead of being re-derived. This
// effect mounts that vanilla-JS engine once and lets it run exactly as it did standalone; the
// only functional change from the prototype is in onBook() below, where the old placeholder
// toast ("Notebook opens here — editor is next") is replaced with the real onOpenNotebook call.
function initShelf(onOpenNotebookRef, signal) {
  const W = 173, P = 800, DUR = 1150, PX = 100, OMEGA = 9;
  const SP = { "green": { "phi": 3.3, "T": 54, "H": 250, "yc": 270.61, "col": "#317931" }, "pink": { "phi": -2.84, "T": 40, "H": 196, "yc": 296.85, "col": "#dc99ba" }, "navy": { "phi": 0, "T": 54, "H": 250, "yc": 272, "col": "#3a4f84" }, "dnavy": { "phi": -4.38, "T": 18, "H": 250, "yc": 273.01, "col": "#2c3159" }, "gray": { "phi": 5.38, "T": 54, "H": 250, "yc": 269.98, "col": "#595959" } }, SP2 = { "bpink": { "phi": 6.23, "T": 18, "H": 250, "yc": 574.76, "col": "#fba1ca", "tc": "#3a4f84", "title": "云朵溺水日记" }, "bnavy": { "phi": -7.9, "T": 54, "H": 199, "yc": 597.73, "col": "#3a4f84", "tc": "#ffce5d", "title": "所有钟表都停在雨里" }, "bgray": { "phi": -3.44, "T": 40, "H": 196, "yc": 601.5, "col": "#565656", "tc": "#a5a5a5", "title": "鲸鱼背着天空游" }, "borange": { "phi": 2.91, "T": 54, "H": 250, "yc": 573.79, "col": "#e8652c", "tc": "#fdfdfb", "title": "折光与失重" }, "bred": { "phi": -4.66, "T": 54, "H": 250, "yc": 573.22, "col": "#ed5256", "tc": "#be1d22", "title": "落笔为念" } };
  const $ = id => document.getElementById(id);
  const mod = (a, n) => ((a % n) + n) % n;
  const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;      // ease-in-out, slow-fast-slow like the reference video
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const escAttr = s => esc(s).replace(/"/g, '&quot;');
  const screen = $('screen'), shelvesWrap = $('shelvesWrap'), shelvesInner = $('shelvesInner');
  $('title').src = IMG.title; $('line1').src = IMG.line1; $('line2').src = IMG.line2;

  /* ---------- notebooks (numbers read from the Figma frames 1:323 / 1:342) ----------
     T x H = spine rectangle before rotation, phi = lean (deg, CSS clockwise), yc = rectangle centre y. */
  const TITLES = { green: '听风说路过人间', pink: '蓝是静止的火焰', navy: '扣指成诗', dnavy: '月亮裁缝铺', gray: '把黄昏折进信封' };
  const META = { green: { tc: '#fdfdfb' }, pink: { tc: '#b0497c' }, navy: { tc: '#ffce5d', cover: true }, dnavy: { tc: '#709dff' }, gray: { tc: '#fdfdfb' } };
  const TOP_BOOKS = ['green', 'pink', 'navy', 'dnavy', 'gray'].map(id => Object.assign({ id, sp: 'rect_' + id, title: TITLES[id] }, SP[id], META[id]));
  const BOT_BOOKS = ['bpink', 'bnavy', 'bgray', 'borange', 'bred'].map(id => Object.assign({ id, sp: 'rect2_' + id }, SP2[id]));

  /* ---------- geometry helpers ---------- */
  function prep(b) { const r = Math.abs(b.phi) * Math.PI / 180; b.bbox = b.T * Math.cos(r) + b.H * Math.sin(r); b.ex = b.bbox - b.T; return b; }   // width a leaning spine really occupies
  // silhouette of a book (closed = rotated rectangle, open = the cover), as left/right edge per screen row, measured from its bounding-box left
  function outline(b, open, BOT) {
    let pts;
    if (open) pts = [[0, BOT - b.H], [W, BOT - b.H], [W, BOT], [0, BOT]];
    else {
      const c = Math.cos(b.phi * Math.PI / 180), s = Math.sin(b.phi * Math.PI / 180), cx = b.bbox / 2;
      pts = [[-b.T / 2, -b.H / 2], [b.T / 2, -b.H / 2], [b.T / 2, b.H / 2], [-b.T / 2, b.H / 2]].map(([x, y]) => [cx + x * c - y * s, b.yc + x * s + y * c]);
    }
    const ys = pts.map(p => p[1]), y0 = Math.ceil(Math.min(...ys)), y1 = Math.floor(Math.max(...ys)), l = [], r = [];
    for (let y = y0; y <= y1; y++) {
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4];
        if ((ay <= y && y <= by) || (by <= y && y <= ay)) { if (ay === by) { lo = Math.min(lo, ax, bx); hi = Math.max(hi, ax, bx); } else { const x = ax + (bx - ax) * (y - ay) / (by - ay); lo = Math.min(lo, x); hi = Math.max(hi, x); } }
      }
      l.push(lo); r.push(hi);
    }
    return { y0, y1, l, r, width: open ? W : b.bbox };
  }
  // gap between two bounding boxes at which the silhouettes are exactly clr px apart at their closest row (clr = value measured in the Figma frames)
  function requiredGap(A, B, clr) {
    const y0 = Math.max(A.y0, B.y0), y1 = Math.min(A.y1, B.y1); let m = 1e9;
    for (let y = y0; y <= y1; y++) m = Math.min(m, (A.width - A.r[y - A.y0]) + B.l[y - B.y0]);
    return m === 1e9 ? -1e9 : clr - m;
  }

  /* silhouette-derived gaps for the current S.books; called at creation and again whenever a book is appended */
  function recomputeGaps(S) {
    const books = S.books, N = books.length, cfg = S.cfg, G = cfg.genericClr || 5;
    const op = books.map(b => outline(b, true, cfg.BOT)), cl = books.map(b => outline(b, false, cfg.BOT));
    const gc = [], gL = [], gR = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const cc = cfg.clr.closed[i], co = cfg.clr.openL[i], cr = cfg.clr.openR[i];
      gc[i] = requiredGap(cl[i], cl[j], cc === undefined ? G : cc);              // both closed
      gL[i] = requiredGap(op[i], cl[j], co === undefined ? G : co);              // left book open
      gR[i] = requiredGap(cl[i], op[j], cr === undefined ? G : cr);              // right book open
    }
    S.N = N; S.gc = gc; S.gL = gL; S.gR = gR;
  }

  /* ---------- one shelf = one independent carousel ----------
     pos is a float "book index": the book at distance d from pos is open by k*(1-d). k=0 means the whole shelf is closed.
     S.books can grow later (pushBook): recomputeGaps() + rebuild() pick the change up without disturbing pos/k. */
  function makeShelf(cfg) {
    const S = { cfg, books: cfg.books.map(prep), N: 0, row: cfg.row, pos: cfg.pos0, k: cfg.k0, kT: cfg.k0, A: cfg.pos0, anim: null, raf: 0, tPrev: 0, slots: new Map() };
    recomputeGaps(S);

    function coverHTML(b) {
      const trashBtn = `<button type="button" class="trashBtn" aria-label="删除「${escAttr(b.title)}」" style="${b.cover ? 'left:140.7px;top:224.4px;right:auto;bottom:auto' : ''}"><img class="trash" src="${IMG.trash}" alt=""></button>`;
      const editBtn = `<button type="button" class="editBtn" aria-label="编辑「${escAttr(b.title)}」">${b.cover ? '' : `<img class="sl" src="${IMG.sliders}" alt="">`}</button>`;
      if (b.cover) return `<img class="cimg" src="${IMG.cover}" alt="${escAttr(b.title)}">${editBtn}${trashBtn}`;
      const fs = Math.min(20, Math.floor(1420 / [...b.title].length) / 10);   // long titles shrink to fit the cover
      const artStyle = b.coverImg ? `background-image:url(${b.coverImg});background-size:cover;background-position:center;` : '';
      return `<div class="ccss" style="--c:${b.col};--tc:${b.tc}"><div class="art" style="${artStyle}"></div>${editBtn}` +
        `<div class="ttl" style="font-size:${fs}px">${esc(b.title)}</div><div class="dots"><i></i><i></i><i></i></div></div>${trashBtn}`;
    }
    function makeSlot(v) {
      const b = S.books[mod(v, S.N)], H = b.H, el = document.createElement('div');
      el.className = 'bk'; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', b.title);
      el.style.top = '0px'; el.style.width = W + 'px'; el.style.height = H + 'px';
      const cv = b.cover ? 'left:-2.25px;top:-3.35px;width:176.9px;height:256.7px;' : 'left:-0.6px;top:0;width:' + (W + 0.6) + 'px;height:' + H + 'px;';
      const spineFace = b.sp ? `background-image:url(${IMG[b.sp]});` : `background:${b.col};`;
      const spineInner = b.cover ? `<img class="str" src="${IMG.string}" alt="">` : (b.sp ? '' : `<div class="spineTxt"><span style="color:${b.tc}">${esc(b.title)}</span></div>`);
      el.innerHTML =
        `<div class="face back" style="width:${W}px;height:${H}px;background:${b.col};transform:translateZ(${-b.T}px) rotateY(180deg)"></div>` +
        `<div class="face spine" style="left:${-b.T / 2}px;width:${b.T}px;height:${H}px;${spineFace}transform:translateZ(${-b.T / 2}px) rotateY(-90deg)">${spineInner}</div>` +
        `<div class="face cover" style="${cv}">${coverHTML(b)}</div>`;
      el.addEventListener('click', () => onBook(S, v, b));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBook(S, v, b); } });
      const trashBtn = el.querySelector('.trashBtn'), editBtn = el.querySelector('.editBtn');
      trashBtn.addEventListener('click', e => { e.stopPropagation(); confirmDelete(S, v); });
      editBtn.addEventListener('click', e => { e.stopPropagation(); openEdit(S, v); });
      S.row.appendChild(el);
      S.slots.set(v, { v, b, el, o: 0, trash: trashBtn, edit: editBtn });
    }
    function ensure() {
      if (S.N >= 5) {                                        // roomy buffer: smooth crossfade well before slots are destroyed
        for (let v = S.A - 7; v <= S.A + 7; v++) if (!S.slots.has(v)) makeSlot(v);
        for (const [v, s] of S.slots) if (Math.abs(v - S.A) > 9) { s.el.remove(); S.slots.delete(v); }
      } else {                                              // fewer than 5 books: a wide buffer would show the same book twice (circular wrap)
        const w = S.N; let lo = S.A - Math.floor((w - 1) / 2), hi = lo + w - 1;
        lo = Math.min(lo, S.A - 1); hi = Math.max(hi, S.A + 1);      // render() always needs slots A-1..A+1 (floor(pos)/floor(pos)+1 fall in this range for any pos rounding to A)
        for (let v = lo; v <= hi; v++) if (!S.slots.has(v)) makeSlot(v);
        for (const [v, s] of S.slots) if (v < lo || v > hi) { s.el.remove(); S.slots.delete(v); }
      }
    }
    function rebuild() { for (const s of S.slots.values()) s.el.remove(); S.slots.clear(); ensure(); render(); }   // new slots get no transform until a render runs; callers that don't already goTo() need this
    function render() {
      const a = Math.round(S.pos); if (a !== S.A) { S.A = a; ensure(); }
      const fl = Math.floor(S.pos), f = S.pos - fl;
      const vs = [...S.slots.keys()].sort((x, y) => x - y);
      for (const v of vs) { const s = S.slots.get(v), d = Math.abs(S.pos - v); s.o = S.k * (d < 1 ? 1 - d : 0); s.vis = Math.max(0, Math.min(1, 3 - d)); }   // only the five books around pos are shown
      if (S.N < 3) {                                          // 1-2 books: the A-1..A+1 crash guard can put the SAME book in two slots — show only the nearer copy
        const nearest = new Map();
        for (const v of vs) { const id = mod(v, S.N), d = Math.abs(S.pos - v), cur = nearest.get(id); if (!cur || d < cur.d) nearest.set(id, { v, d }); }
        const keep = new Set([...nearest.values()].map(o => o.v));
        for (const v of vs) if (!keep.has(v)) S.slots.get(v).vis = 0;
      }
      const rel = new Map(); let x = 0;
      for (const v of vs) {
        const s = S.slots.get(v), b = s.b, th = (1 - s.o) * Math.PI / 2, sin = Math.sin(th), cos = Math.cos(th);
        const w = W * cos + b.T * sin + b.ex * (1 - s.o);                       // footprint of the box turned by th, plus the width of its lean
        rel.set(v, { x, w, th, sin });
        const nx = S.slots.get(v + 1), gi = mod(v, S.N);
        x += w + S.gc[gi] + (S.gL[gi] - S.gc[gi]) * s.o + (S.gR[gi] - S.gc[gi]) * (nx ? nx.o : 0);
      }
      const cA = rel.get(fl), cB = rel.get(fl + 1), base = rel.get(a - 2) || cA;   // fewer than 5 books: no a-2 slot, but k=1 always there so this term is moot
      const c = (1 - f) * (cA.x + cA.w / 2) + f * (cB.x + cB.w / 2);                 // the two books around pos share the centre
      const shift = S.k * (cfg.CX - c) + (1 - S.k) * (cfg.X0 - base.x);          // open: selected book centred; closed: Figma's resting row
      for (const v of vs) {
        const s = S.slots.get(v), r = rel.get(v), b = s.b;
        const pe = b.phi * (1 - s.o), pr = pe * Math.PI / 180;                  // lean fades out as the book opens
        const ox = r.x + shift + b.T * r.sin * Math.cos(pr) + (b.H / 2) * Math.abs(Math.sin(pr));
        const yc = b.yc * (1 - s.o) + (cfg.BOT - b.H / 2) * s.o;                  // an open book stands on the shelf line
        s.el.style.transform = `translate3d(${ox.toFixed(2)}px,${(yc - b.H / 2).toFixed(2)}px,0) perspective(${P}px) rotateZ(${pe.toFixed(3)}deg) rotateY(${(r.th * 180 / Math.PI).toFixed(2)}deg)`;
        s.el.style.zIndex = String(1 + Math.round(s.o * 10));
        s.el.style.opacity = s.vis.toFixed(3);
        s.el.style.pointerEvents = s.vis > 0.05 ? 'auto' : 'none';
        const bo = String(Math.pow(s.o, 6)), reach = s.o > 0.6 ? 'auto' : 'none';
        s.trash.style.opacity = bo; s.trash.style.pointerEvents = reach;
        s.edit.style.opacity = bo; s.edit.style.pointerEvents = reach;
      }
    }
    function tick(now) {
      S.raf = 0;
      const dt = S.tPrev ? Math.min(0.05, (now - S.tPrev) / 1000) : 0.016; S.tPrev = now;
      const an = S.anim;
      if (an) {
        if (an.type === 'tween') {                                      // click / key / wheel: ease-in-out like the reference video
          const p = Math.max(0, Math.min(1, (now - an.t0) / an.dur));
          S.pos = an.p0 + (an.target - an.p0) * ease(p);
          if (p >= 1) { S.pos = an.target; S.anim = null; }
        } else {                                                      // flick: critically damped spring carrying the release velocity
          const t = Math.max(0, (now - an.t0) / 1000), e = Math.exp(-OMEGA * t);
          S.pos = an.target + (an.a + (an.v0 + OMEGA * an.a) * t) * e;
          if (t > 1.6 || (t > 0.25 && Math.abs(S.pos - an.target) < 0.0008)) { S.pos = an.target; S.anim = null; }
        }
      }
      if (S.k !== S.kT) { S.k += (S.kT - S.k) * (1 - Math.exp(-dt * 6)); if (Math.abs(S.kT - S.k) < 0.002) S.k = S.kT; }   // a closed shelf "wakes up" on first touch
      render();
      if (S.anim || S.k !== S.kT) kick(); else S.tPrev = 0;
    }
    function kick() { if (!S.raf) S.raf = requestAnimationFrame(tick); }
    function cur() { return S.anim ? S.anim.target : Math.round(S.pos); }        // where the shelf is heading
    function goTo(target) {
      target = Math.round(target); S.kT = 1;
      if (S.anim && S.anim.target === target) { kick(); return; }
      if (!S.anim && Math.abs(S.pos - target) < 1e-4) { kick(); return; }
      const d = Math.abs(target - S.pos);
      S.anim = { type: 'tween', p0: S.pos, target, t0: performance.now(), dur: Math.min(2300, DUR + 260 * Math.max(0, d - 1)) };
      kick();
    }
    function pushBook(spec) { if (spec.yc === undefined) spec.yc = cfg.BOT - vext(spec.T, spec.H, spec.phi) / 2; S.books.push(prep(spec)); recomputeGaps(S); rebuild(); }   // leaning bottom = standing bottom = BOT, so it's always exactly LINE_GAP from the line, closed or open
    function removeBook(v) {                                // false if refused (a shelf never drops below its last notebook)
      if (S.books.length <= 1) return false;
      const idx = mod(v, S.N);
      S.books.splice(idx, 1);
      S.cfg.clr = { closed: [], openL: [], openR: [] };              // the Figma-measured per-pair clearances no longer line up once the book count changes
      recomputeGaps(S);
      S.anim = null; S.pos = Math.min(idx, S.books.length - 1); S.A = Math.round(S.pos);
      rebuild();
      return true;
    }
    Object.assign(S, { ensure, render, kick, cur, goTo, rebuild, pushBook, removeBook });
    if (S.N > 0) { ensure(); render(); }   // a freshly-created empty shelf (N=0) has nothing to lay out yet; pushBook()+goTo() render it once a book exists
    return S;
  }

  /* every shelf's tallest possible book is 250 (the tallest in TOP_BOOKS/BOT_BOOKS/SIZE_POOL) — fixing the gap between
     a shelf's standing line and the next shelf's highest point at SHELF_GAP means consecutive BOT values step by BOT_STEP */
  const SHELF_GAP = 35, MAX_H = 250, BOT_STEP = SHELF_GAP + MAX_H, LINE_GAP = 10;
  // the true on-screen vertical extent of a leaning book, calibrated against all 10 books' actual rendered bounds.
  // rotateY(90deg) is applied before rotateZ(phi) in the transform chain, so the spine's thickness (T) rotates into
  // depth first and contributes nothing to the projected height — only H*cos(phi) remains (confirmed to 0.01px on
  // all 10 existing books; a flat T*sin(phi) 2D estimate, used earlier, overshoots by exactly that much).
  const vext = (T, H, phi) => H * Math.cos(Math.abs(phi) * Math.PI / 180);
  // pin every book's leaning ("closed") lowest point to the SAME y as its standing ("open") lowest point (=BOT), so the
  // 10px book-to-line gap holds whether it's leaning or standing, and it can never touch the line either way
  const TOP_BOT = 397, BOTTOM_BOT = 397 + BOT_STEP;

  /* ---------- saved shelves: which notebooks each shelf holds, their titles, and user-made notebooks' looks ---------- */
  const saved = loadJSON(SHELF_KEY);
  const FIGMA_BOOKS = Object.fromEntries(TOP_BOOKS.concat(BOT_BOOKS).map(b => [b.id, b]));
  const restoreBook = s => FIGMA_BOOKS[s.id]
    ? Object.assign(FIGMA_BOOKS[s.id], { title: s.title || FIGMA_BOOKS[s.id].title })
    : { id: s.id, T: s.T, H: s.H, phi: s.phi, col: s.col, tc: s.tc, title: s.title, coverImg: s.coverImg || null };
  const savedShelves = Array.isArray(saved?.shelves) ? saved.shelves.map(list => (Array.isArray(list) ? list.filter(s => s && s.id).map(restoreBook) : [])) : [];
  const shelfBooks = (index, original) => (savedShelves[index]?.length ? savedShelves[index] : original);
  const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id);
  const topBooks = shelfBooks(0, TOP_BOOKS), botBooks = shelfBooks(1, BOT_BOOKS);
  for (const b of topBooks) b.yc = TOP_BOT - vext(b.T, b.H, b.phi) / 2;
  for (const b of botBooks) b.yc = BOTTOM_BOT - vext(b.T, b.H, b.phi) / 2;
  const noClr = () => ({ closed: [], openL: [], openR: [] });   // the Figma-measured clearances only fit the original line-up
  const TOP = makeShelf({
    row: $('row'), books: topBooks, BOT: TOP_BOT, CX: 197.5, X0: 0, pos0: Math.min(2, topBooks.length - 1), k0: 1,
    clr: sameIds(topBooks, TOP_BOOKS) ? { closed: [3, 9, 4, 3, 6], openL: [3, 9, 1, 3, 6], openR: [3, 15, 4, 3, 6] } : noClr()
  });   // closest silhouette distance per neighbouring pair, measured in Figma
  const BOTTOM = makeShelf({
    row: $('row2'), books: botBooks, BOT: BOTTOM_BOT, CX: 197.5, X0: 10.92, pos0: Math.min(2, botBooks.length - 1), k0: 0,
    clr: sameIds(botBooks, BOT_BOOKS) ? { closed: [11, 15, 3, 5, 6], openL: [11, 15, 3, 5, 6], openR: [11, 15, 3, 5, 6] } : noClr()
  });
  let activeShelf = TOP;

  /* ---------- growing past 5 notebooks: a shelf holds at most 5, then a new one appears below (page scrolls) ----------
     lastBOT is the most recently placed shelf's BOT; each new one steps another BOT_STEP down, so the 35px gap holds
     everywhere (exactly, when a shelf's tallest book is the pool maximum of 250; a bit more when it happens to be shorter).
     Range boundaries sit at the midpoint between consecutive BOTs. contentH is padded past the newest boundary so it can
     always be scrolled flush under the header — otherwise the scroll clamps short and the shelf's title/trash falls
     behind the nav backing. */
  const midBoundary = BOTTOM.cfg.BOT - BOT_STEP / 2;          // between TOP and BOTTOM
  let lastBOT = BOTTOM.cfg.BOT, contentH = 812;
  let shelfRanges = [{ start: 115, end: midBoundary, S: TOP }, { start: midBoundary, end: Infinity, S: BOTTOM }];   // content-Y bands used to route touches/scroll to a shelf
  const extraShelves = [];
  const extraNodes = [];                                    // row/line DOM nodes createShelf() appends, so cleanup can remove them
  const NEW_PALETTE = [{ col: '#3d8a4f', tc: '#fdfdfb' }, { col: '#c8577a', tc: '#fdfdfb' }, { col: '#3a4f84', tc: '#ffce5d' },
  { col: '#e0632c', tc: '#fdfdfb' }, { col: '#6a6a6a', tc: '#fdfdfb' }, { col: '#8a5cb0', tc: '#fdfdfb' }, { col: '#1f9c96', tc: '#fdfdfb' }];
  const SIZE_POOL = TOP_BOOKS.concat(BOT_BOOKS).map(b => ({ T: b.T, H: b.H }));   // a new notebook's size is drawn from the 10 that already exist
  let newBookSeq = Number(saved?.newBookSeq) || 0;
  function persistShelf() {
    const shelves = [TOP, BOTTOM, ...extraShelves].map(S => S.books.map(b => (FIGMA_BOOKS[b.id]
      ? { id: b.id, title: b.title }
      : { id: b.id, title: b.title, T: b.T, H: b.H, phi: b.phi, col: b.col, tc: b.tc, coverImg: b.coverImg || null })));
    if (!saveJSON(SHELF_KEY, { version: 1, newBookSeq, shelves })) toast('保存失败：浏览器存储空间不足');
  }
  function renameNotebook(id, title) {
    for (const S of [TOP, BOTTOM, ...extraShelves]) {
      const b = S.books.find(x => x.id === id);
      if (b && title && b.title !== title) { b.title = title; S.rebuild(); persistShelf(); }
    }
  }
  function makeNewBookSpec() {
    const p = NEW_PALETTE[newBookSeq % NEW_PALETTE.length];
    const sz = SIZE_POOL[Math.floor(Math.random() * SIZE_POOL.length)];
    newBookSeq++;
    const phi = Math.round((Math.random() * 8 - 4) * 10) / 10;              // a gentle random lean, in the spirit of the hand-placed Figma spines
    return { id: 'new' + newBookSeq, T: sz.T, H: sz.H, phi, col: p.col, tc: p.tc, title: '未命名诗本' + (newBookSeq > 1 ? ' ' + newBookSeq : '') };
  }
  function createShelf() {
    const BOT = lastBOT + BOT_STEP, lineY = BOT + LINE_GAP, boundary = lastBOT + BOT_STEP / 2;
    const row = document.createElement('div'); row.id = 'row' + (extraShelves.length + 3); row.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    const line = document.createElement('img'); line.className = 'abs'; line.alt = ''; line.src = IMG.line2;
    line.style.cssText = 'left:0;top:' + lineY + 'px;width:375px;height:11.3px;pointer-events:none';
    shelvesInner.appendChild(row); shelvesInner.appendChild(line);
    extraNodes.push(row, line);
    shelfRanges[shelfRanges.length - 1].end = boundary;                 // the previous shelf's band now stops where this one's begins
    lastBOT = BOT;
    contentH = Math.max(BOT + SHELF_GAP, boundary + 697);                  // padded so THIS shelf can scroll flush to y=115 (screen height 812 minus the header's 115)
    shelvesInner.style.height = contentH + 'px';
    const S = makeShelf({ row, books: [], BOT, CX: 197.5, X0: 0, pos0: 0, k0: 1, genericClr: 5, clr: { closed: [], openL: [], openR: [] } });
    extraShelves.push(S); shelfRanges.push({ start: boundary, end: Infinity, S });
    return S;
  }
  function addNotebook() {
    const last = extraShelves[extraShelves.length - 1];
    const isNewShelf = !last || last.books.length >= 5;
    const target = isNewShelf ? createShelf() : last;
    const spec = makeNewBookSpec();
    target.pushBook(spec);
    activeShelf = target; target.goTo(target.books.length - 1);           // open the notebook just added
    const shelfNo = extraShelves.indexOf(target) + 3;                     // shelves 1 and 2 are the original two
    toast((isNewShelf ? '新建第 ' + shelfNo + ' 层书架 · ' : '已加入第 ' + shelfNo + ' 层书架 · ') + spec.title);
    if (isNewShelf) shelvesWrap.scrollBy({ top: BOT_STEP, behavior: 'smooth' });   // the page now exceeds 2 shelves: page up by exactly one shelf's worth
    persistShelf();
  }
  for (const list of savedShelves.slice(2)) {                // shelves the user grew last time
    if (!list.length) continue;
    const S = createShelf();
    for (const b of list) S.pushBook(b);
  }

  /* ---------- input ---------- */
  let toastT;
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1500); }

  /* ---------- delete-confirm / edit-notebook modal (shared; only one can be open) ---------- */
  const modalRoot = $('modalRoot');
  let onModalClose = null;                                   // e.g. un-press the search tab, however the modal is dismissed
  // the search / time / settings panels wear the editor's paper sheet and its × (outside the card, so a re-render keeps it)
  function addSheetClose() {
    const card = modalRoot.querySelector('.modalCard'), wrap = document.createElement('div'), x = document.createElement('button');
    wrap.className = 'sheetWrap'; card.before(wrap); wrap.appendChild(card);
    x.type = 'button'; x.className = 'sheetClose'; x.setAttribute('aria-label', '关闭'); x.textContent = '×';
    x.addEventListener('click', closeModal); wrap.appendChild(x);
  }
  function closeModal() {
    modalRoot.innerHTML = ''; modalRoot.style.pointerEvents = 'none';
    const done = onModalClose; onModalClose = null; if (done) done();
  }

  /* ---------- search: filter every notebook on every shelf by title; picking one opens it ---------- */
  function allNotebooks() {
    return [TOP, BOTTOM, ...extraShelves].flatMap((S, shelfIndex) => S.books.map((b, i) => ({ S, b, i, shelfNo: shelfIndex + 1 })));
  }
  function openFromSearch({ S, b, i }, page) {
    closeModal();
    // stand the book up and bring its shelf into view, so the shelf shows it when the user comes back
    const N = S.books.length, v = i + N * Math.round((S.pos - i) / N);
    activeShelf = S; S.goTo(v);
    shelvesWrap.scrollTop = Math.max(0, S.cfg.BOT - TOP_BOT);  // instant: the shelf is hidden as the editor opens
    onOpenNotebookRef.current(b, page);
  }
  function openSearch(navButton) {
    modalRoot.style.pointerEvents = 'auto';
    modalRoot.innerHTML = `<div class="modalBack searchBack"><div class="modalCard searchCard" role="dialog" aria-label="搜索笔记本">
      <h3>搜索笔记本</h3>
      <label class="sheetSearch"><input class="searchInput" type="search" placeholder="输入笔记本的名字…" aria-label="搜索笔记本" autocomplete="off"></label>
      <div class="searchResults" role="list"></div>
    </div></div>`;
    addSheetClose();
    onModalClose = () => navButton.setAttribute('aria-pressed', 'false');
    const back = modalRoot.querySelector('.modalBack'), input = modalRoot.querySelector('.searchInput'), list = modalRoot.querySelector('.searchResults');
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    function render() {
      const q = input.value.trim().toLowerCase();
      const hits = allNotebooks().filter(n => n.b.title.toLowerCase().includes(q));
      list.innerHTML = hits.length
        ? hits.map((n, k) => `<button type="button" class="searchHit" role="listitem" data-k="${k}"><i style="background:${n.b.col}"></i><span>${esc(n.b.title)}</span><small>第 ${n.shelfNo} 层</small></button>`).join('')
        : `<p class="searchEmpty">没有找到「${esc(input.value.trim())}」</p>`;
      list.querySelectorAll('.searchHit').forEach(btn => btn.addEventListener('click', () => openFromSearch(hits[Number(btn.dataset.k)])));
    }
    input.addEventListener('input', render);
    input.addEventListener('keydown', e => {                   // Enter opens the first match
      if (e.key !== 'Enter') return;
      const first = list.querySelector('.searchHit'); if (first) first.click();
    });
    render(); input.focus();
  }
  /* ---------- time tab: every notebook's time capsules (sealed in the editor's page overview), soonest first ---------- */
  const daysUntil = key => {
    const [y, m, d] = key.split('-').map(Number), now = new Date();
    return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  };
  const openLabel = days => days <= 0 ? '已开启' : days < 14 ? days + '天后开启' : days < 60 ? Math.round(days / 7) + '周后开启' : days < 360 ? Math.round(days / 30) + '个月后开启' : Math.round(days / 365) + '年后开启';
  function openCapsules(navButton) {
    const items = allNotebooks().flatMap(n => ((loadJSON(notebookKey(n.b.id)) ?? { capsules: SAMPLE_CAPSULES[n.b.id] }).capsules ?? []).filter(c => c && c.openAt && c.spreads?.length).map(c => {
      const spreads = [...c.spreads].sort((a, b) => a - b), [, m, d] = c.openAt.split('-').map(Number);
      return { n, c, days: daysUntil(c.openAt), page: spreads[0], pages: '第 ' + spreads.map(s => s + '–' + (s + 1)).join('、') + ' 页', date: m + '月' + d + '日' };
    })).sort((a, b) => (a.days <= 0) - (b.days <= 0) || (a.days > 0 ? a.days - b.days : b.days - a.days));   // still sealed first, soonest to open on top; opened ones after, newest first
    modalRoot.style.pointerEvents = 'auto';
    modalRoot.innerHTML = `<div class="modalBack searchBack"><div class="modalCard searchCard capsuleListCard" role="dialog" aria-label="时间胶囊">
      <h3>时间胶囊</h3>
      <div class="searchResults" role="list">${items.length
        ? items.map((x, k) => `<button type="button" class="searchHit capsuleHit${x.days <= 0 ? ' isOpen' : ''}" role="listitem" data-k="${k}"><i style="background:${x.n.b.col}"></i>
            <span><b>${esc(x.n.b.title)}</b><small>${x.pages} · ${x.date}开启</small></span><em>${openLabel(x.days)}</em></button>`).join('')
        : `<p class="searchEmpty">还没有时间胶囊<br>在笔记本的页面总览里选几页封存起来</p>`}</div>
    </div></div>`;
    addSheetClose();
    onModalClose = () => navButton.setAttribute('aria-pressed', 'false');
    const back = modalRoot.querySelector('.modalBack');
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    modalRoot.querySelectorAll('.capsuleHit').forEach(btn => btn.addEventListener('click', () => {
      const x = items[Number(btn.dataset.k)];
      openFromSearch(x.n, x.page);
    }));
  }
  /* ---------- settings tab: what's saved on this device, backup / restore, reset ---------- */
  const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  function hiddenLibraryCount() {
    const h = loadJSON(LIBRARY_KEY)?.hiddenLibrary;
    return h ? ['sentences', 'words', 'photos'].reduce((sum, k) => sum + (h[k]?.length ?? 0), 0) : 0;
  }
  function settingsConfirm(title, body, action, onConfirm) {           // swaps the settings card for a confirm step
    const card = modalRoot.querySelector('.settingsCard');
    card.innerHTML = `<h3>${esc(title)}</h3><p>${esc(body)}</p>
      <div class="modalBtns"><button type="button" class="mCancel">取消</button><button type="button" class="mDanger">${esc(action)}</button></div>`;
    card.querySelector('.mCancel').addEventListener('click', () => renderSettings(card));
    card.querySelector('.mDanger').addEventListener('click', async e => { e.currentTarget.disabled = true; await onConfirm(); });
  }
  function renderSettings(card) {
    const hidden = hiddenLibraryCount();
    card.innerHTML = `<h3>设置</h3>
      <section class="setSec">
        <h4>保存</h4>
        <p>所有内容都会自动保存在这台设备的浏览器里，不会上传。换设备或清理浏览器前，先导出一份备份。</p>
        <p class="setUsage">书架上 ${allNotebooks().length} 本笔记本 · <span>正在统计…</span></p>
        <div class="setBtns"><button type="button" class="setBtn isDark" data-act="export">导出备份</button><button type="button" class="setBtn" data-act="import">导入备份</button></div>
        <input type="file" accept="application/json,.json" class="setFile" hidden>
      </section>
      <section class="setSec">
        <h4>词库</h4>
        <p>${hidden ? `已删除 ${hidden} 个自带的句卡、词卡或图片。` : '自带的句卡、词卡和图片都还在。'}</p>
        <div class="setBtns"><button type="button" class="setBtn" data-act="restore" ${hidden ? '' : 'disabled'}>恢复自带内容</button></div>
      </section>
      <section class="setSec">
        <h4>重置</h4>
        <p>删除所有笔记本、句卡、图片和录音，回到第一次打开的样子。</p>
        <div class="setBtns"><button type="button" class="setBtn isDanger" data-act="clear">清除所有数据</button></div>
      </section>
      <p class="setAbout">Between Lines · 拼贴诗笔记本</p>`;
    storageUsage().then(u => {
      const span = card.querySelector('.setUsage span');
      if (span) span.textContent = `文字 ${fmtBytes(u.json)} · 图片和录音 ${u.mediaCount} 个，${fmtBytes(u.media)}`;
    });
    const fileInput = card.querySelector('.setFile');
    card.querySelector('[data-act="export"]').addEventListener('click', async e => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = '正在打包…';
      try {
        const backup = await exportBackup();
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
        const d = new Date(), a = document.createElement('a');
        a.href = url; a.download = `between-lines-备份-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('备份已导出');
      } catch { toast('导出失败，请再试一次'); }
      btn.disabled = false; btn.textContent = '导出备份';
    });
    card.querySelector('[data-act="import"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0]; fileInput.value = ''; if (!file) return;
      let backup;
      try { backup = JSON.parse(await file.text()); if (backup?.app !== 'between-lines') throw 0; }
      catch { toast('这不是 Between Lines 的备份文件'); return; }
      settingsConfirm('导入这份备份？', '现在保存的所有内容会被备份里的内容替换。', '导入', async () => {
        try { await importBackup(backup); window.location.reload(); }
        catch { toast('导入失败：浏览器存储空间不足'); renderSettings(card); }
      });
    });
    card.querySelector('[data-act="restore"]').addEventListener('click', () => {
      const lib = loadJSON(LIBRARY_KEY) ?? {};
      saveJSON(LIBRARY_KEY, { ...lib, hiddenLibrary: { sentences: [], words: [], photos: [] } });
      toast('自带内容已恢复'); renderSettings(card);
    });
    card.querySelector('[data-act="clear"]').addEventListener('click', () => settingsConfirm('清除所有数据？', '所有笔记本、句卡、图片和录音都会被删除，无法恢复。建议先导出备份。', '全部清除', async () => {
      await clearAllSaved(); window.location.reload();
    }));
  }
  function openSettings(navButton) {
    modalRoot.style.pointerEvents = 'auto';
    modalRoot.innerHTML = `<div class="modalBack searchBack"><div class="modalCard searchCard settingsCard" role="dialog" aria-label="设置"></div></div>`;
    addSheetClose();
    onModalClose = () => navButton.setAttribute('aria-pressed', 'false');
    const back = modalRoot.querySelector('.modalBack');
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    renderSettings(modalRoot.querySelector('.settingsCard'));
  }
  function confirmDelete(S, v) {
    const b = S.books[mod(v, S.N)];
    modalRoot.style.pointerEvents = 'auto';
    modalRoot.innerHTML = `<div class="modalBack"><div class="modalCard">
      <h3>删除「${esc(b.title)}」？</h3>
      <p>删除后无法恢复。</p>
      <div class="modalBtns"><button type="button" class="mCancel">取消</button><button type="button" class="mDanger">删除</button></div>
    </div></div>`;
    const back = modalRoot.querySelector('.modalBack');
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    modalRoot.querySelector('.mCancel').addEventListener('click', closeModal);
    modalRoot.querySelector('.mDanger').addEventListener('click', () => {
      const ok = S.removeBook(v); closeModal();
      if (ok) { removeSaved(notebookKey(b.id)); persistShelf(); }
      toast(ok ? '已删除「' + b.title + '」' : '每层至少保留 1 本笔记本');
    });
  }
  // downscale/re-encode an uploaded image client-side so a phone-camera photo doesn't bloat the page; returns a data URI
  function loadCoverFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('bad image'));
        img.onload = () => {
          const MAX = 640, s = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function openEdit(S, v) {
    const b = S.books[mod(v, S.N)];
    if (b.sp || b.cover) { toast('这本笔记本的美术来自设计稿，暂不支持编辑'); return; }
    modalRoot.style.pointerEvents = 'auto';
    const swatches = NEW_PALETTE.map(p => `<button type="button" class="swatch" data-col="${p.col}" data-tc="${p.tc}" style="background:${p.col}"></button>`).join('');
    modalRoot.innerHTML = `<div class="modalBack"><div class="modalCard">
      <h3>编辑笔记本</h3>
      <label class="mLabel">名字</label>
      <input class="mInput" type="text" maxlength="12" value="${escAttr(b.title)}">
      <label class="mLabel">颜色</label>
      <div class="swatches">${swatches}</div>
      <label class="mLabel">封面图片</label>
      <div class="coverPick">
        <div class="coverPreview"></div>
        <div class="coverPickBtns">
          <button type="button" class="mUpload">上传图片</button>
          <button type="button" class="mRemoveCover" hidden>移除图片</button>
          <input type="file" accept="image/*" class="mFile" hidden>
        </div>
      </div>
      <div class="modalBtns"><button type="button" class="mCancel">取消</button><button type="button" class="mSave">保存</button></div>
    </div></div>`;
    let chosen = { col: b.col, tc: b.tc }, coverImg = b.coverImg || null;
    const preview = modalRoot.querySelector('.coverPreview'), removeBtn = modalRoot.querySelector('.mRemoveCover');
    function paintPreview() {
      preview.style.backgroundImage = coverImg ? `url(${coverImg})` : '';
      preview.classList.toggle('empty', !coverImg);
      removeBtn.hidden = !coverImg;
    }
    paintPreview();
    const back = modalRoot.querySelector('.modalBack');
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    modalRoot.querySelector('.mCancel').addEventListener('click', closeModal);
    modalRoot.querySelectorAll('.swatch').forEach(sw => {
      if (sw.dataset.col.toLowerCase() === b.col.toLowerCase()) sw.classList.add('on');
      sw.addEventListener('click', () => { modalRoot.querySelectorAll('.swatch').forEach(x => x.classList.remove('on')); sw.classList.add('on'); chosen = { col: sw.dataset.col, tc: sw.dataset.tc }; });
    });
    const fileInput = modalRoot.querySelector('.mFile');
    modalRoot.querySelector('.mUpload').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0]; fileInput.value = ''; if (!file) return;
      if (!file.type.startsWith('image/')) { toast('请选择图片文件'); return; }
      try { coverImg = await loadCoverFile(file); paintPreview(); }
      catch { toast('图片读取失败，换一张试试'); }
    });
    removeBtn.addEventListener('click', () => { coverImg = null; paintPreview(); });
    const input = modalRoot.querySelector('.mInput');
    modalRoot.querySelector('.mSave').addEventListener('click', () => {
      const t = input.value.trim();
      b.title = t || b.title; b.col = chosen.col; b.tc = chosen.tc; b.coverImg = coverImg;
      S.rebuild(); closeModal(); persistShelf(); toast('已保存');
    });
  }

  let suppressClick = false, drag = null;
  // The only functional change from the prototype: an already-open, already-centred book used to
  // just show a placeholder toast ("Notebook opens here — editor is next"); it now hands the clicked
  // notebook's data up to the React side via onOpenNotebookRef, which switches to the editor screen.
  function onBook(S, v, b) {
    activeShelf = S;
    if (suppressClick) return;
    if (S.k > 0.98 && !S.anim && Math.abs(S.pos - v) < 0.02) onOpenNotebookRef.current(b); else S.goTo(v);
  }
  $('bell').addEventListener('click', () => toast('No new notifications'), { signal });
  window.addEventListener('keydown', e => {
    if (modalRoot.firstChild) { if (e.key === 'Escape') closeModal(); return; }   // typing in the edit dialog must not also move a shelf
    const S = activeShelf;
    if (e.key === 'ArrowRight') S.goTo(S.cur() + 1);
    if (e.key === 'ArrowLeft') S.goTo(S.cur() - 1);
  }, { signal });
  const shelfAt = cy => { for (const r of shelfRanges) if (cy >= r.start && cy < r.end) return r.S; return null; };   // which shelf a touch belongs to
  const screenY = e => { const r = screen.getBoundingClientRect(); return (e.clientY - r.top) / (r.height / 812); };
  const contentY = e => screenY(e) + shelvesWrap.scrollTop;                       // screenY plus how far the shelves have scrolled

  /* drag a shelf: it follows the finger 1:1, then a flick carries on with inertia and settles on a book */
  const DEAD = 6;
  screen.addEventListener('dragstart', e => e.preventDefault(), { signal });
  screen.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('#bell') || modalRoot.firstChild) return;
    const S = shelfAt(contentY(e)); if (!S) return;
    drag = { S, x: e.clientX, pos0: S.pos, moved: false, scale: screen.getBoundingClientRect().width / 375, samples: [[e.timeStamp, e.clientX]] };
  }, { signal });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const S = drag.S, dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) <= DEAD * drag.scale) return;
      drag.moved = true; S.anim = null; S.kT = 1; activeShelf = S;             // grab the shelf, even mid-animation
      drag.x = e.clientX; drag.pos0 = S.pos; drag.samples = [[e.timeStamp, e.clientX]];
      screen.classList.add('dragging'); S.kick(); return;
    }
    S.pos = drag.pos0 - (e.clientX - drag.x) / (PX * drag.scale);               // finger left -> shelf moves left -> higher index
    const s = drag.samples; s.push([e.timeStamp, e.clientX]);
    while (s.length > 2 && e.timeStamp - s[0][0] > 120) s.shift();
    S.kick();
  }, { signal });
  function endDrag(e) {
    if (!drag) return;
    const d = drag, S = d.S; drag = null; screen.classList.remove('dragging');
    if (!d.moved) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const s = d.samples, last = s[s.length - 1], first = s[0];
    let v = 0; const dt = last[0] - first[0];
    if (dt > 8 && (e.timeStamp - last[0]) < 90) v = (last[1] - first[1]) / dt / d.scale;   // px per ms; ~0 if the finger rested before lifting
    v = Math.max(-4, Math.min(4, v));
    const vb = -v / PX * 1000, base = Math.round(S.pos);                       // books per second
    const target = Math.max(base - 5, Math.min(base + 5, Math.round(S.pos + vb * 0.30)));   // project ~300ms of momentum, capped at 5 books
    S.anim = { type: 'spring', target, a: S.pos - target, v0: vb, t0: performance.now() };
    S.kick();
  }
  window.addEventListener('pointerup', endDrag, { signal });
  window.addEventListener('pointercancel', endDrag, { signal });

  // trackpad / mouse-wheel sideways scroll
  let wheelAcc = 0, wheelLock = 0;
  screen.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;                 // leave vertical scrolling alone
    const S = shelfAt(contentY(e)); if (!S) return;
    e.preventDefault();
    const now = performance.now(); if (now < wheelLock) return;
    wheelAcc += e.deltaX;
    if (Math.abs(wheelAcc) >= 40) { activeShelf = S; S.goTo(S.cur() + (wheelAcc > 0 ? 1 : -1)); wheelAcc = 0; wheelLock = now + 420; }
  }, { passive: false, signal });

  /* ---------- bottom navigation (icon positions from Figma frame 1:342: x = 33, 119, 205, 291, y = 731, 51px each) ----------
     L / T = how far the brush disc sticks out left / above the 51px layer box, so the exported picture lands exactly where Figma draws it. */
  const NAV = [
    { k: 'search', label: '搜索', x: 33, L: 2.38, T: 1.50, w: 54.75, h: 54.25, tab: true },
    { k: 'nb', label: '新建笔记本', x: 119, L: 1.56, T: 2.38, w: 54.25, h: 54.75, tab: false },   // Icon/NotebookAdd — a momentary action, not a page tab
    { k: 'clock', label: '时间', x: 205, L: 1.14, T: 1.56, w: 54.75, h: 54.25, tab: true },
    { k: 'gear', label: '设置', x: 291, L: 1.14, T: 1.56, w: 54.75, h: 54.25, tab: true }
  ];
  const navEl = $('nav');
  const navBtns = NAV.map(n => {
    const b = document.createElement('button');
    b.className = 'nv'; b.style.left = n.x + 'px'; b.setAttribute('aria-label', n.label); b.setAttribute('aria-pressed', 'false');
    const pos = 'left:' + (-n.L) + 'px;top:' + (-n.T) + 'px;width:' + n.w + 'px;height:' + n.h + 'px';
    b.innerHTML = '<img class="off" src="' + IMG['nav_' + n.k + '_u'] + '" style="' + pos + '" alt=""><img class="on" src="' + IMG['nav_' + n.k + '_s'] + '" style="' + pos + '" alt="">';
    b.addEventListener('click', () => {
      if (n.tab) {
        navBtns.forEach(x => { if (x.dataset.tab === '1') x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        if (n.k === 'search') openSearch(b);
        else if (n.k === 'clock') openCapsules(b);
        else if (n.k === 'gear') openSettings(b);
        else toast(n.label + ' — 对应页面下一步做');
      } else {                                            // "add notebook": flash the highlighted state, then release; the tab selection is untouched
        if (b.dataset.busy) return;                      // guards against a double-tap / "ghost click" adding more than one notebook
        b.dataset.busy = '1'; setTimeout(() => { delete b.dataset.busy; }, 900);
        b.setAttribute('aria-pressed', 'true');
        setTimeout(() => b.setAttribute('aria-pressed', 'false'), 260);
        addNotebook();
      }
    });
    if (n.tab) b.dataset.tab = '1';
    navEl.appendChild(b); return b;
  });

  return { TOP, BOTTOM, extraShelves, extraNodes, navEl, modalRoot, renameNotebook, getToastTimer: () => toastT };
}

export default function HomeShelf({ onOpenNotebook, apiRef }) {
  const onOpenNotebookRef = useRef(onOpenNotebook);
  onOpenNotebookRef.current = onOpenNotebook;

  useEffect(() => {
    const controller = new AbortController();
    const handles = initShelf(onOpenNotebookRef, controller.signal);
    if (apiRef) apiRef.current = { renameNotebook: handles.renameNotebook };
    return () => {
      controller.abort();
      if (apiRef) apiRef.current = null;
      [handles.TOP, handles.BOTTOM, ...handles.extraShelves].forEach((S) => {
        if (S.raf) cancelAnimationFrame(S.raf);
      });
      clearTimeout(handles.getToastTimer());
      handles.TOP.row.innerHTML = "";
      handles.BOTTOM.row.innerHTML = "";
      handles.navEl.innerHTML = "";
      handles.modalRoot.innerHTML = "";
      handles.extraNodes.forEach((node) => node.remove());
    };
  }, []);

  return (
    <main className="prototype-stage" aria-label="书架">
      <div className="screen app-screen" id="screen">
        <div id="shelvesWrap">
          <div id="shelvesInner">
            <img className="abs" id="line2" alt="" />
            <div id="row2"></div>
            <img className="abs" id="line1" alt="" />
            <div id="row"></div>
          </div>
        </div>
        <div className="hdrBack"></div>
        <img className="abs" id="title" alt="Between Lines — My Notebooks" />
        <button className="abs" id="bell" aria-label="Notifications"></button>
        <div className="navBack"></div>
        <div id="nav"></div>
        <div className="toast" id="toast"></div>
        <div id="modalRoot"></div>
      </div>
    </main>
  );
}
