# BHible - Bible Reading Heat Map

A mobile-first Progressive Web App that tracks Bible reading with a GitHub-style heat map visualization. Protestant canon (66 books), granular to the verse level.

## Features

- **Heat Map View** - Books displayed as blocks proportional to verse count, colored by reading frequency
- **Drill-down Navigation** - Testament → Book → Chapter → Verses
- **Verse Selection** - Tap to select, drag to select ranges, long-press chapter to mark all verses
- **Reading Log** - All readings stored locally in IndexedDB with timestamps
- **Dashboard** - Progress by testament/category, time-of-day charts, streak tracking
- **Dark/Light Mode** - Respects system preference, toggleable
- **Export/Import** - JSON backup of all reading data
- **Relight Integration** - Direct links to read passages on relight.app
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
- PWA manifest for installability