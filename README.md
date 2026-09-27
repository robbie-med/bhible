# BHible - Bible Reading Heat Map

A mobile-first Progressive Web App that tracks Bible reading with a GitHub-style heat map visualization. Protestant canon (66 books), granular to the verse level.
<img width="1005" height="885" alt="bh2" src="https://github.com/user-attachments/assets/fbab8f0d-9494-4352-a88f-c55036df1818" />
<img width="1008" height="895" alt="bh1" src="https://github.com/user-attachments/assets/cfb45b38-2d69-41f8-8e1d-6ec89efa089d" />

## Features

- **Heat Map View** - Books displayed as blocks proportional to verse count, colored by reading frequency
- **Drill-down Navigation** - Testament → Book → Chapter → Verses
- **Verse Selection** - Tap to select, drag to select ranges, long-press chapter to mark all verses
- **Reading Log** - All readings stored locally in IndexedDB with timestamps
- **Dashboard** - Progress by testament/category, time-of-day charts, streak tracking
- **Dark/Light Mode** - Respects system preference, toggleable
- **Export/Import** - JSON backup of all reading data
- **Built-in Offline Bible** - KJV and 개역한글 (public domain), alone or side by side; download either for fully offline reading
- **Reading Context** - Tag readings as home/church, log sermon main texts with a date, and link supporting texts to them
- **External Readers** - Relight, Hangl, or STEP Bible instead of the built-in reader
- **Installable PWA** - Works offline, install to home screen

## Deployment (GitHub Pages)

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to the branch containing these files (root `/`)
4. The app will be available at `https://<username>.github.io/bhible/`

## Tech Stack

- Vanilla HTML/CSS/JS (no build step)
- IndexedDB for local storage
- Service Worker for offline support
- `tools/build_text.py` regenerates `data/text/` (offline Bible JSON) from checksum-pinned sources
- PWA manifest for installability
