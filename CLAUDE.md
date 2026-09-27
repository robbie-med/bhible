# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BHible is a mobile-first PWA that tracks Bible reading (66-book Protestant canon, verse-level). It shows reading history as a GitHub-style heat map and has a stats dashboard. The UI supports English and Korean. It's deployed on GitHub Pages at `bhible.robbiemed.org` (see `CNAME`), served from the repo root of `main`.

## Development

There's no build step, package manager, linter or test suite. It's plain HTML/CSS/JS, loaded as ordered `<script>` tags (no modules, no bundler). The one generator is `python3 tools/build_text.py`. It rebuilds the offline Bible JSON in `data/text/` from checksum-pinned public-domain sources (KJV from layeh/kjv, 개역한글 from CrossWire KorRV via scrollmapper), cached in the gitignored `tools/.sources/`. It reads verse counts from `data/bible.js`, so every text file lines up with the heat map. Verses a translation omits become `""`. If you rebuild, bump `TEXT_CACHE` in both `sw.js` and `js/text.js`.

`python3 tools/build_creeds.py` rebuilds `data/creeds/` (index plus `<id>.<lang>.json`) from a pinned Creeds.json commit (public-domain English). Korean versions are hand-placed files in `tools/creeds_ko/<id>.json` with the same shape. It also rewrites the `// creeds:begin … creeds:end` precache block in `sw.js`, so don't edit that block by hand.

To run it locally, serve the repo root over HTTP. You need a real server, not `file://`, because the service worker and IndexedDB need it. Port **3606** is registered to bhible in `/home/user/Projects/PORTS.md`. Don't pick another port:

```bash
python3 -m http.server 3606 --bind 127.0.0.1
```

**Service worker caching:** `sw.js` serves same-origin assets stale-while-revalidate, so a deploy shows up on the second launch. Bump `CACHE_NAME` (`bhible-vN`) when shipping changes that must land together or in the precache list. If you add a new app-shell file, add it to `ASSETS`. Bible text (`/data/text/`) is served cache-first from a separate `TEXT_CACHE` (`bhible-text-vN`), so app upgrades don't evict downloaded translations. Activate deletes only stale `bhible-v*` and `bhible-text-*` caches.

**Touch gestures:** gesture handling is load-bearing, and scrolling must never select anything. Chapter cells open on `click`, which browsers suppress after a scroll; holding still for 600ms marks the whole chapter read. Verse cells: tap toggles, a swipe scrolls, and a 250ms hold then drag selects a range (`touchmove` only calls `preventDefault` once a drag is active). All grid listeners are delegated and bound once, outside the render functions. Don't add per-cell listeners inside `render*()`.

## Architecture

Script load order in `index.html` matters. Each file publishes a global that later files use:

1. **`data/bible.js`**: `BIBLE_DATA`. It's static canon data. Each book is `{ name, abbr, relightAbbr, testament: 'OT'|'NT', category, chapters: [versesPerChapter...] }`. The `abbr` field (e.g. `Gen`, `Exod`) is the canonical book ID used everywhere, including storage keys. This file also holds the **external reader registry** (`readers`: relight, hangl, stepbible_klb, stepbible_hkjv), each with `getUrl(bookAbbr, chapter, verse)`. `getRelightUrl()` is a legacy name. It now dispatches to whichever reader the user picked (`localStorage['bhible-reader']`). To add a reader, add an entry to `readers` and a matching button in `#reader-options` in `index.html`.
2. **`js/storage.js`**: `storage`, a singleton `BibleStorage`. It uses IndexedDB (db `bhible`, store `readings`). Each read event is its own record `{ verseKey: "Gen:1:1", book, chapter, verse, timestamp }`, so re-reading a verse adds a new row. On startup, all records load into an in-memory `cache` (`verseKey → [timestamps]`), plus a `byBook` index (`book → Set(verseKey)`) that per-book and per-chapter queries use. Route cache writes through `_cacheAdd`/`_cacheRemove` so both stay in sync. Day-based stats (streaks, per-date counts) use local calendar days via `localDateKey()`, never UTC. `logReading()` in `app.js` writes one timestamp per reading event, and that timestamp is how Undo (`storage.unmarkRead`) finds the rows to delete. Every query method (`getVerseCount`, `getBookHeat`, `getStats`, streaks, etc.) reads the cache synchronously. Only `markRead` / `importData` / `exportData` touch IndexedDB. Callers must `await storage.ready` first. A second store, `sessions` (DB v2), holds one row per "Mark as Read" action. It's keyed by that same timestamp and holds the verses plus the reading context: `place` (home/church), `sermonRole` (main/support), `sermonDate`, and `sermonMain` (the linked main session's timestamp). `storage.getSermons()` groups supporting texts under their main text. Readings logged before v2 have no session row. Export/import use a JSON envelope `{ version: 2, exportDate, readings: [...], sessions: [...] }`. v1 files, which have no sessions, still import. Import supports `merge` (append) and `replace` modes.
3. **`js/text.js`**: `BibleText`, which loads `data/text/<kjv|krv>/<Book>.json` (arrays of chapters of verse strings), memoized per book. `download(trans)` pre-fills `TEXT_CACHE` with all 66 books. The built-in reader in `app.js` (`renderReader`/`paintReader`) is the default reader (`bhible-reader` = `builtin`). It shares `state.selectedVerses` with the verse grid, crosses book boundaries with prev/next, and uses `history.pushState` so the phone's Back button closes it. Translation pref is `bhible-text` (`kjv`/`krv`/`both`); by default it follows the UI language.
4. **`js/i18n.js`**: `I18N`. `t(key, params)` looks up strings with `{param}` interpolation and falls back to English. It also has localized book names/abbreviations and category/day names. Static markup uses `data-i18n="key"` attributes, which `applyStaticI18n()` in `app.js` fills in. When you add UI text, add the key to both the `en` and `ko` string tables.
5. **`js/app.js`**: the whole UI, inside one async IIFE that awaits `storage.ready`.
   - **Navigation** is a manual stack (`state.navStack` of `'books' | 'chapters' | 'verses'`) within the Heat Map tab. `updateView()` toggles visibility of the three grids. Nothing uses routing or URLs.
   - **Heat coloring** buckets `count / maxCount` into 5 levels, mapped to the CSS vars `--heat-0..4`. `getHeatRGB` duplicates those colors as raw RGB for canvas drawing, so update both if you change the palette.
   - **Verse selection** uses tap, drag-select (touch and mouse), and long-press on a chapter to mark the whole chapter read.
   - **Dashboard** is rendered as an HTML string from `storage.getStats()`.
   - **Confessions tab** (`renderCreeds`/`renderCreedDoc`) renders three document shapes: creed `paragraphs`, confession `chapters[].sections[]`, and catechism `questions[]`. Heidelberg questions carry `ld` (Lord's Day). Footnote markers `[k]` in the text map to `proofs[k]`, a list of OSIS refs. `parseOsisRef` and `openPassage` open a proof in the reader with its verses pre-selected. The shared header's back button is routed by the active tab, and `updateView()` leaves the header alone unless the Heat Map tab is active.
   - User preferences live in `localStorage`: `bhible-theme`, `bhible-lang`, `bhible-reader`, `bhible-text`. Theme is applied as `data-theme` on `<html>`, and `css/app.css` overrides variables under `[data-theme="light"]`.
