// ============================================
// BHible - Main Application
// ============================================

(async function() {
  'use strict';

  // Wait for storage to be ready
  await storage.ready;

  // ===== State =====
  const state = {
    currentTestament: 'OT',
    currentBook: null,
    currentChapter: null,
    selectedVerses: new Set(),
    navStack: [], // ['books', 'chapters', 'verses']
    // Reading context for the next "Mark as Read". place sticks until changed; sermonRole resets after each log.
    context: { place: null, sermonRole: null }
  };

  // ===== Shorthand =====
  const t = (key, params) => I18N.t(key, params);

  // ===== DOM Refs =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    backBtn: $('#back-btn'),
    pageTitle: $('#page-title'),
    settingsBtn: $('#settings-btn'),
    settingsPanel: $('#settings-panel'),
    settingsOverlay: $('#settings-overlay'),
    settingsClose: $('#settings-close'),
    langOptions: $('#lang-options'),
    readerOptions: $('#reader-options'),
    themeOptions: $('#theme-options'),
    menuExport: $('#menu-export'),
    menuImport: $('#menu-import'),
    importFile: $('#import-file'),
    bookGrid: $('#book-grid'),
    chapterView: $('#chapter-view'),
    chapterGrid: $('#chapter-grid'),
    verseView: $('#verse-view'),
    verseGrid: $('#verse-grid'),
    verseToolbar: $('#verse-toolbar'),
    selectAllBtn: $('#select-all-verses'),
    deselectAllBtn: $('#deselect-all-verses'),
    readerLink: $('#reader-link'),
    markReadBtn: $('#mark-read-btn'),
    contextBar: $('#context-bar'),
    sermonDetails: $('#sermon-details'),
    sermonDate: $('#sermon-date'),
    sermonMainSelect: $('#sermon-main-select'),
    legend: $('#legend'),
    testamentBtns: $$('.testament-btn'),
    tabs: $$('.tab'),
    pages: $$('.page'),
    dashboardContent: $('#dashboard-content'),
    toast: $('#toast')
  };

  // ===== Theme =====
  function initTheme() {
    const saved = localStorage.getItem('bhible-theme');
    const theme = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(theme);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bhible-theme', theme);
  }

  // ===== Language =====
  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
  }

  function setLang(code) {
    I18N.lang = code;
    applyStaticI18n();
    refreshCurrentView();
    updateSettingsHighlights();
  }

  function refreshCurrentView() {
    const view = state.navStack[state.navStack.length - 1] || 'books';
    updateView();
    if (view === 'books') {
      renderBookGrid();
    } else if (view === 'chapters') {
      renderChapterGrid();
    } else if (view === 'verses') {
      renderVerseGrid();
    }
    if ($('#page-dashboard').classList.contains('active')) {
      renderDashboard();
      dom.pageTitle.textContent = t('dashboard');
    }
  }

  // ===== Reader Setting =====
  function getReader() {
    return localStorage.getItem('bhible-reader') || 'relight';
  }

  function setReader(id) {
    localStorage.setItem('bhible-reader', id);
    updateSettingsHighlights();
    if (state.currentBook) updateMarkBtn();
  }

  // ===== Settings Panel =====
  function openSettings() {
    dom.settingsOverlay.classList.remove('hidden');
    dom.settingsPanel.classList.remove('hidden');
    // Trigger reflow then add open class for animation
    dom.settingsPanel.offsetHeight;
    dom.settingsPanel.classList.add('open');
    updateSettingsHighlights();
  }

  function closeSettings() {
    dom.settingsPanel.classList.remove('open');
    setTimeout(() => {
      dom.settingsPanel.classList.add('hidden');
      dom.settingsOverlay.classList.add('hidden');
    }, 250);
  }

  function updateSettingsHighlights() {
    // Language
    dom.langOptions.querySelectorAll('.setting-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === I18N.lang);
    });
    // Reader
    const readerId = getReader();
    dom.readerOptions.querySelectorAll('.setting-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === readerId);
    });
    // Theme
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    dom.themeOptions.querySelectorAll('.setting-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === theme);
    });
  }

  // ===== Toast =====
  let toastTimeout;
  function hideToast() {
    dom.toast.classList.remove('show');
    toastTimeout = setTimeout(() => dom.toast.classList.add('hidden'), 300);
  }

  // action: optional { label, onClick } rendered as a button (e.g. Undo)
  function showToast(msg, action) {
    dom.toast.textContent = msg;
    dom.toast.classList.toggle('has-action', !!action);
    if (action) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        clearTimeout(toastTimeout);
        hideToast();
        action.onClick();
      }, { once: true });
      dom.toast.appendChild(btn);
    }
    dom.toast.classList.remove('hidden');
    dom.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(hideToast, action ? 5000 : 2200);
  }

  // ===== Navigation =====
  function navigateTo(view) {
    state.navStack.push(view);
    updateView();
  }

  function navigateBack() {
    state.navStack.pop();
    const view = state.navStack[state.navStack.length - 1] || 'books';
    if (view === 'books') {
      state.currentBook = null;
      state.currentChapter = null;
      state.selectedVerses.clear();
    } else if (view === 'chapters') {
      state.currentChapter = null;
      state.selectedVerses.clear();
    }
    updateView();
  }

  function updateView() {
    const view = state.navStack[state.navStack.length - 1] || 'books';
    const showBooks = view === 'books';
    const showChapters = view === 'chapters';
    const showVerses = view === 'verses';

    dom.bookGrid.classList.toggle('hidden', !showBooks);
    dom.chapterView.classList.toggle('hidden', !showChapters);
    dom.verseView.classList.toggle('hidden', !showVerses);
    dom.legend.classList.toggle('hidden', !showBooks);

    // Testament toggle only visible in book view
    $('#testament-toggle').classList.toggle('hidden', !showBooks);

    dom.backBtn.classList.toggle('hidden', showBooks);

    if (showBooks) {
      dom.pageTitle.textContent = t('appName');
    } else if (showChapters) {
      dom.pageTitle.textContent = I18N.bookName(state.currentBook);
    } else if (showVerses) {
      dom.pageTitle.textContent = `${I18N.bookName(state.currentBook)} ${state.currentChapter}`;
    }
  }

  // ===== Heat Color =====
  function getHeatLevel(count, maxCount) {
    if (count === 0) return 0;
    if (maxCount === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.25) return 0.25;
    if (ratio <= 0.5) return 0.5;
    if (ratio <= 0.75) return 0.75;
    return 1;
  }

  function getHeatColor(heat) {
    if (heat === 0) return 'var(--heat-0)';
    if (heat <= 0.25) return 'var(--heat-1)';
    if (heat <= 0.5) return 'var(--heat-2)';
    if (heat <= 0.75) return 'var(--heat-3)';
    return 'var(--heat-4)';
  }

  // ===== Heat color as raw RGB (for canvas) =====
  function getHeatRGB(count, maxCount) {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const colors = theme === 'light'
      ? [[235,237,240],[155,233,168],[64,196,99],[48,161,78],[33,110,57]]
      : [[22,27,34],[14,68,41],[0,109,50],[38,166,65],[57,211,83]];
    if (count === 0) return colors[0];
    if (maxCount === 0) return colors[0];
    const ratio = count / maxCount;
    if (ratio <= 0.25) return colors[1];
    if (ratio <= 0.5) return colors[2];
    if (ratio <= 0.75) return colors[3];
    return colors[4];
  }

  // ===== Book Grid =====
  function renderBookGrid() {
    dom.bookGrid.innerHTML = '';
    const testament = state.currentTestament;
    const categories = BIBLE_DATA.categories[testament];

    // Global max verse read count for this testament (for heat scaling)
    const globalMaxCount = Math.max(storage.getMaxCountByTestament(testament), 1);

    // Cell size for the tiny verse pixels
    const CELL_PX = 3;

    for (const [category, bookAbbrs] of Object.entries(categories)) {
      const section = document.createElement('div');
      section.className = 'category-section';

      const header = document.createElement('div');
      header.className = 'category-header';
      header.textContent = I18N.categoryName(category);
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'category-grid';

      for (const abbr of bookAbbrs) {
        const book = BIBLE_DATA.getBook(abbr);
        if (!book) continue;

        const totalVerses = book.chapters.reduce((a, b) => a + b, 0);
        const versesRead = storage.getBookVersesRead(abbr);

        // Calculate grid layout: roughly square
        const cols = Math.ceil(Math.sqrt(totalVerses));
        const rows = Math.ceil(totalVerses / cols);
        const canvasW = cols * CELL_PX;
        const canvasH = rows * CELL_PX;

        // Ensure minimum block size for touch (48px)
        const blockW = Math.max(canvasW + 4, 48); // 4px padding
        const blockH = Math.max(canvasH + 16, 48); // 16px for label

        const block = document.createElement('div');
        block.className = 'book-block' + (blockW >= 60 ? ' large-block' : '');
        block.style.width = blockW + 'px';
        block.style.height = blockH + 'px';

        // Canvas for the verse heat map
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        canvas.style.width = canvasW + 'px';
        canvas.style.height = canvasH + 'px';
        const ctx = canvas.getContext('2d');

        // Draw each verse as a tiny cell
        const verseCounts = storage.getBookVerseCountsFlat(abbr);
        let prevColor = '';
        for (let i = 0; i < verseCounts.length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const rgb = getHeatRGB(verseCounts[i], globalMaxCount);
          const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          if (color !== prevColor) { ctx.fillStyle = color; prevColor = color; }
          ctx.fillRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
        }

        block.appendChild(canvas);

        const label = document.createElement('span');
        label.className = 'book-label';
        label.textContent = I18N.bookAbbr(abbr);
        block.appendChild(label);

        block.title = `${I18N.bookName(abbr)}: ${versesRead}/${totalVerses}`;

        block.addEventListener('click', () => {
          state.currentBook = abbr;
          navigateTo('chapters');
          renderChapterGrid();
        });

        grid.appendChild(block);
      }

      section.appendChild(grid);
      dom.bookGrid.appendChild(section);
    }
  }

  // ===== Chapter Grid =====
  function renderChapterGrid() {
    dom.chapterGrid.innerHTML = '';
    const book = BIBLE_DATA.getBook(state.currentBook);
    if (!book) return;

    const maxHeat = Math.max(
      ...book.chapters.map((_, i) => {
        const versesInChapter = book.chapters[i];
        const versesRead = storage.getChapterVersesRead(state.currentBook, i + 1).size;
        return versesRead / versesInChapter;
      }),
      0.001
    );

    book.chapters.forEach((verseCount, i) => {
      const chNum = i + 1;
      const versesRead = storage.getChapterVersesRead(state.currentBook, chNum);
      const completionRatio = versesRead.size / verseCount;
      const heatLevel = getHeatLevel(completionRatio, maxHeat);

      const cell = document.createElement('div');
      cell.className = 'chapter-cell' + (heatLevel === 0 ? ' unread' : '');
      cell.style.background = getHeatColor(heatLevel);

      const num = document.createElement('span');
      num.className = 'chapter-num';
      num.textContent = chNum;
      cell.appendChild(num);

      if (versesRead.size > 0) {
        const progress = document.createElement('span');
        progress.className = 'chapter-progress';
        progress.textContent = `${versesRead.size}/${verseCount}`;
        cell.appendChild(progress);
      }

      cell.dataset.chapter = chNum;

      dom.chapterGrid.appendChild(cell);
    });

    dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook);
  }

  // ===== Chapter gestures (delegated, bound once) =====
  // Tap = open chapter (via click, which browsers suppress after a scroll).
  // Hold still for LONG_PRESS_MS = mark whole chapter read (with undo).
  const LONG_PRESS_MS = 600;
  const MOVE_TOLERANCE_PX = 10;
  const chapterPress = { timer: null, fired: false, x: 0, y: 0 };

  function startChapterPress(cell, x, y) {
    clearTimeout(chapterPress.timer);
    chapterPress.fired = false;
    chapterPress.x = x;
    chapterPress.y = y;
    chapterPress.timer = setTimeout(() => {
      chapterPress.fired = true;
      markChapterRead(parseInt(cell.dataset.chapter));
    }, LONG_PRESS_MS);
  }

  function cancelChapterPress() {
    clearTimeout(chapterPress.timer);
  }

  function movedTooFar(x, y, origin) {
    return Math.abs(x - origin.x) > MOVE_TOLERANCE_PX || Math.abs(y - origin.y) > MOVE_TOLERANCE_PX;
  }

  async function markChapterRead(chNum) {
    const book = BIBLE_DATA.getBook(state.currentBook);
    const verses = [];
    for (let v = 1; v <= book.chapters[chNum - 1]; v++) {
      verses.push({ book: state.currentBook, chapter: chNum, verse: v });
    }
    await logReading(verses, t('chapterMarkedRead', { book: I18N.bookName(state.currentBook), ch: chNum }));
    if (navigator.vibrate) navigator.vibrate(50);
  }

  dom.chapterGrid.addEventListener('touchstart', (e) => {
    const cell = e.target.closest('.chapter-cell');
    if (!cell || e.touches.length > 1) return cancelChapterPress();
    startChapterPress(cell, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  dom.chapterGrid.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if (movedTooFar(touch.clientX, touch.clientY, chapterPress)) cancelChapterPress();
  }, { passive: true });
  dom.chapterGrid.addEventListener('touchend', (e) => {
    cancelChapterPress();
    if (chapterPress.fired) e.preventDefault(); // swallow the click that would open the chapter
  });
  dom.chapterGrid.addEventListener('touchcancel', cancelChapterPress);
  dom.chapterGrid.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.chapter-cell');
    if (cell && e.button === 0) startChapterPress(cell, e.clientX, e.clientY);
  });
  dom.chapterGrid.addEventListener('mousemove', (e) => {
    if (movedTooFar(e.clientX, e.clientY, chapterPress)) cancelChapterPress();
  });
  dom.chapterGrid.addEventListener('mouseup', cancelChapterPress);
  dom.chapterGrid.addEventListener('mouseleave', cancelChapterPress);
  dom.chapterGrid.addEventListener('contextmenu', (e) => e.preventDefault());
  dom.chapterGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.chapter-cell');
    if (!cell || chapterPress.fired) return;
    state.currentChapter = parseInt(cell.dataset.chapter);
    state.selectedVerses.clear();
    navigateTo('verses');
    renderVerseGrid();
  });

  // ===== Verse selection =====
  function updateMarkBtn() {
    const n = state.selectedVerses.size;
    dom.markReadBtn.disabled = n === 0;
    if (n > 0) {
      dom.markReadBtn.textContent = t('markNVersesAsRead', { n, s: n > 1 ? 's' : '' });
      dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter, Math.min(...state.selectedVerses));
    } else {
      dom.markReadBtn.textContent = t('markAsRead');
      dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter);
    }
  }

  function paintSelection() {
    dom.verseGrid.querySelectorAll('.verse-cell').forEach(c => {
      c.classList.toggle('selected', state.selectedVerses.has(parseInt(c.dataset.verse)));
    });
    updateMarkBtn();
  }

  // Drag-select: selection = snapshot at drag start, with anchor..current range selected/deselected.
  // Filling the whole range means fast drags can't skip cells.
  const drag = { active: false, mode: null, anchor: null, snapshot: null };

  function beginDrag(verseNum) {
    drag.active = true;
    drag.anchor = verseNum;
    drag.mode = state.selectedVerses.has(verseNum) ? 'deselect' : 'select';
    drag.snapshot = new Set(state.selectedVerses);
    dragTo(verseNum);
  }

  function dragTo(verseNum) {
    if (!drag.active || verseNum == null) return;
    const next = new Set(drag.snapshot);
    const lo = Math.min(drag.anchor, verseNum), hi = Math.max(drag.anchor, verseNum);
    for (let v = lo; v <= hi; v++) {
      if (drag.mode === 'select') next.add(v); else next.delete(v);
    }
    state.selectedVerses = next;
    paintSelection();
  }

  function endDrag() {
    drag.active = false;
  }

  function verseAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest('#verse-grid .verse-cell');
    return cell ? parseInt(cell.dataset.verse) : null;
  }

  // Touch: tap toggles one verse; a swipe scrolls the page; hold briefly then drag to select a range.
  const VERSE_HOLD_MS = 250;
  const verseTouch = { timer: null, verse: null, x: 0, y: 0, scrolling: false };

  dom.verseGrid.addEventListener('touchstart', (e) => {
    const cell = e.target.closest('.verse-cell');
    clearTimeout(verseTouch.timer);
    if (!cell || e.touches.length > 1) { verseTouch.verse = null; return; }
    verseTouch.verse = parseInt(cell.dataset.verse);
    verseTouch.x = e.touches[0].clientX;
    verseTouch.y = e.touches[0].clientY;
    verseTouch.scrolling = false;
    verseTouch.timer = setTimeout(() => {
      beginDrag(verseTouch.verse);
      if (navigator.vibrate) navigator.vibrate(15);
    }, VERSE_HOLD_MS);
  }, { passive: true });

  dom.verseGrid.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if (drag.active) {
      e.preventDefault(); // we own this gesture now: no scrolling while range-selecting
      dragTo(verseAt(touch.clientX, touch.clientY));
    } else if (movedTooFar(touch.clientX, touch.clientY, verseTouch)) {
      clearTimeout(verseTouch.timer);
      verseTouch.scrolling = true;
    }
  }, { passive: false });

  dom.verseGrid.addEventListener('touchend', (e) => {
    clearTimeout(verseTouch.timer);
    if (verseTouch.verse == null) return;
    if (!drag.active && !verseTouch.scrolling) {
      beginDrag(verseTouch.verse); // a tap is a one-cell drag
    }
    endDrag();
    verseTouch.verse = null;
    e.preventDefault(); // suppress emulated mouse events, which would toggle again
  });

  dom.verseGrid.addEventListener('touchcancel', () => {
    clearTimeout(verseTouch.timer);
    verseTouch.verse = null;
    endDrag();
  });

  // Mouse: press and drag selects immediately (no scroll conflict with a wheel)
  dom.verseGrid.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.verse-cell');
    if (!cell || e.button !== 0) return;
    beginDrag(parseInt(cell.dataset.verse));
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (drag.active) dragTo(verseAt(e.clientX, e.clientY));
  });
  document.addEventListener('mouseup', endDrag);
  dom.verseGrid.addEventListener('contextmenu', (e) => e.preventDefault());

  // ===== Verse Grid =====
  function renderVerseGrid() {
    dom.verseGrid.innerHTML = '';
    const book = BIBLE_DATA.getBook(state.currentBook);
    if (!book) return;

    const verseCount = book.chapters[state.currentChapter - 1];
    const maxCount = Math.max(
      ...Array.from({ length: verseCount }, (_, i) =>
        storage.getVerseCount(state.currentBook, state.currentChapter, i + 1)
      ),
      0.001
    );

    dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter);

    for (let v = 1; v <= verseCount; v++) {
      const readCount = storage.getVerseCount(state.currentBook, state.currentChapter, v);
      const heatLevel = getHeatLevel(readCount, maxCount);

      const cell = document.createElement('div');
      cell.className = 'verse-cell' + (heatLevel === 0 ? ' unread' : '');
      if (state.selectedVerses.has(v)) cell.classList.add('selected');
      cell.dataset.verse = v;
      cell.style.background = getHeatColor(heatLevel);

      cell.textContent = v;

      if (readCount > 0) {
        const dot = document.createElement('span');
        dot.className = 'read-dot';
        dot.title = t('readNTimes', { n: readCount, s: readCount > 1 ? 's' : '' });
        cell.appendChild(dot);
      }

      dom.verseGrid.appendChild(cell);
    }

    updateMarkBtn();
  }

  // ===== Passage references =====
  // "Romans 8:28–39", "Romans 8:1, 3–5", or "Romans 8" for a whole chapter
  function formatRef(bookAbbr, chapter, verses) {
    const name = I18N.bookName(bookAbbr);
    const book = BIBLE_DATA.getBook(bookAbbr);
    const sorted = [...verses].sort((a, b) => a - b);
    if (book && sorted.length === book.chapters[chapter - 1]) return `${name} ${chapter}`;
    const parts = [];
    for (let i = 0; i < sorted.length; i++) {
      const start = sorted[i];
      while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
      parts.push(start === sorted[i] ? `${start}` : `${start}–${sorted[i]}`);
    }
    return `${name} ${chapter}:${parts.join(', ')}`;
  }

  // ===== Reading context =====
  function updateContextBar() {
    const ctx = state.context;
    dom.contextBar.querySelectorAll('.ctx-chip').forEach(chip => {
      const on = chip.dataset.place ? chip.dataset.place === ctx.place : chip.dataset.sermon === ctx.sermonRole;
      chip.classList.toggle('active', on);
    });
    dom.sermonDetails.classList.toggle('hidden', !ctx.sermonRole);
    dom.sermonMainSelect.classList.toggle('hidden', ctx.sermonRole !== 'support');
    if (ctx.sermonRole && !dom.sermonDate.value) dom.sermonDate.value = localDateKey(Date.now());
    if (ctx.sermonRole === 'support') fillSermonMainSelect();
  }

  // Offer recent sermon main texts; default to the one on the chosen sermon date, else the latest
  function fillSermonMainSelect() {
    const sermons = storage.getSermons().slice(0, 12);
    const date = dom.sermonDate.value;
    const match = sermons.find(se => se.sermonDate === date) || sermons[0];
    dom.sermonMainSelect.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = t('noMainText');
    dom.sermonMainSelect.appendChild(none);
    for (const se of sermons) {
      const opt = document.createElement('option');
      opt.value = se.timestamp;
      opt.textContent = `${se.sermonDate} · ${formatRef(se.book, se.chapter, se.verses)}`;
      dom.sermonMainSelect.appendChild(opt);
    }
    dom.sermonMainSelect.value = match ? String(match.timestamp) : '';
  }

  dom.contextBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.ctx-chip');
    if (!chip) return;
    const ctx = state.context;
    if (chip.dataset.place) {
      ctx.place = ctx.place === chip.dataset.place ? null : chip.dataset.place;
    } else {
      ctx.sermonRole = ctx.sermonRole === chip.dataset.sermon ? null : chip.dataset.sermon;
    }
    updateContextBar();
  });

  dom.sermonDate.addEventListener('change', () => {
    if (state.context.sermonRole === 'support') fillSermonMainSelect();
  });

  // ===== Mark Read =====
  // Save a reading, then re-render and offer undo
  async function logReading(verses, message, context = {}) {
    const timestamp = Date.now();
    await storage.markRead(verses, timestamp, context);
    refreshCurrentView();
    showToast(message, {
      label: t('undo'),
      onClick: async () => {
        await storage.unmarkRead(verses, timestamp);
        refreshCurrentView();
        showToast(t('undone'));
      }
    });
  }

  async function markSelectedAsRead() {
    if (state.selectedVerses.size === 0) return;

    const verses = [...state.selectedVerses].sort((a, b) => a - b).map(v => ({
      book: state.currentBook,
      chapter: state.currentChapter,
      verse: v
    }));
    state.selectedVerses.clear();

    const context = { place: state.context.place, sermonRole: state.context.sermonRole };
    if (context.sermonRole) {
      context.sermonDate = dom.sermonDate.value || localDateKey(Date.now());
      if (context.sermonRole === 'support') context.sermonMain = Number(dom.sermonMainSelect.value) || null;
    }
    state.context.sermonRole = null;
    updateContextBar();

    const count = verses.length;
    await logReading(verses, t('versesLogged', {
      n: count, s: count > 1 ? 's' : '',
      book: I18N.bookName(state.currentBook),
      ch: state.currentChapter
    }), context);

    if (navigator.vibrate) navigator.vibrate(30);
  }

  // ===== Dashboard =====
  function renderDashboard() {
    const stats = storage.getStats();
    const dayNames = I18N.dayNames();

    let html = '';

    // Overview
    html += `<div class="dash-card">
      <h3>${t('overview')}</h3>
      <div class="stat-grid">
        <div class="stat-item"><div class="stat-value">${stats.percentComplete}%</div><div class="stat-label">${t('complete')}</div></div>
        <div class="stat-item"><div class="stat-value">${stats.uniqueVerses.toLocaleString()}</div><div class="stat-label">${t('ofNVerses', { n: stats.totalBibleVerses.toLocaleString() })}</div></div>
        <div class="stat-item"><div class="stat-value">${stats.currentStreak}</div><div class="stat-label">${t('currentStreak')}</div></div>
        <div class="stat-item"><div class="stat-value">${stats.longestStreak}</div><div class="stat-label">${t('longestStreak')}</div></div>
      </div>
    </div>`;

    // Testament Progress
    const otPct = stats.otTotal > 0 ? ((stats.otVerses / stats.otTotal) * 100).toFixed(1) : '0.0';
    const ntPct = stats.ntTotal > 0 ? ((stats.ntVerses / stats.ntTotal) * 100).toFixed(1) : '0.0';
    html += `<div class="dash-card">
      <h3>${t('testamentProgress')}</h3>
      <div class="progress-row">
        <span class="progress-label">${t('oldTestament')}</span>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${otPct}%"></div></div>
        <span class="progress-pct">${otPct}%</span>
      </div>
      <div class="progress-row">
        <span class="progress-label">${t('newTestament')}</span>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${ntPct}%"></div></div>
        <span class="progress-pct">${ntPct}%</span>
      </div>
    </div>`;

    // Category Progress
    html += `<div class="dash-card"><h3>${t('categoryProgress')}</h3>`;
    for (const [cat, data] of Object.entries(stats.categoryStats)) {
      const pct = data.total > 0 ? ((data.read / data.total) * 100).toFixed(1) : '0.0';
      html += `<div class="progress-row">
        <span class="progress-label">${I18N.categoryName(cat)}</span>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <span class="progress-pct">${pct}%</span>
      </div>`;
    }
    html += `</div>`;

    // Time of Day
    if (stats.totalReadings > 0) {
      const maxHour = Math.max(...stats.hourCounts, 1);
      html += `<div class="dash-card"><h3>${t('readingTimeOfDay')}</h3><div class="hour-chart">`;
      for (let h = 0; h < 24; h++) {
        const pct = (stats.hourCounts[h] / maxHour) * 100;
        const showLabel = h % 4 === 0;
        html += `<div class="hour-bar-wrap">
          <div class="hour-bar" style="height:${Math.max(pct, 2)}%"></div>
          ${showLabel ? `<span class="hour-label">${h}</span>` : '<span class="hour-label"></span>'}
        </div>`;
      }
      html += `</div></div>`;

      // Day of Week
      const maxDay = Math.max(...stats.dayCounts, 1);
      html += `<div class="dash-card"><h3>${t('dayOfWeek')}</h3><div class="day-chart">`;
      for (let d = 0; d < 7; d++) {
        const intensity = stats.dayCounts[d] / maxDay;
        const bg = getHeatColor(intensity > 0 ? Math.max(intensity, 0.25) : 0);
        html += `<div class="day-item">
          <div class="day-circle" style="background:${bg};${intensity > 0 ? 'text-shadow:0 1px 2px rgba(0,0,0,0.5)' : 'color:var(--text-secondary)'}">
            ${stats.dayCounts[d]}
          </div>
          <span class="day-label">${dayNames[d]}</span>
        </div>`;
      }
      html += `</div></div>`;

      // Monthly Activity
      const months = Object.entries(stats.daysPerMonth).sort().reverse().slice(0, 12);
      if (months.length > 0) {
        html += `<div class="dash-card"><h3>${t('daysActivePerMonth')}</h3><div class="months-grid">`;
        for (const [month, days] of months) {
          const [y, m] = month.split('-');
          const locale = I18N.lang === 'ko' ? 'ko-KR' : 'default';
          const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString(locale, { month: 'short', year: '2-digit' });
          html += `<div class="month-item">
            <div class="month-name">${monthName}</div>
            <div class="month-days">${days}</div>
            <div class="month-suffix">${t('days')}</div>
          </div>`;
        }
        html += `</div></div>`;
      }

      // Sermons
      const sermons = storage.getSermons().slice(0, 10);
      if (sermons.length > 0) {
        html += `<div class="dash-card"><h3>${t('sermons')}</h3><div class="sermon-list">`;
        for (const se of sermons) {
          html += `<div class="sermon-item">
            <div class="sermon-date">${se.sermonDate}</div>
            <div class="sermon-main">${formatRef(se.book, se.chapter, se.verses)}</div>
            ${se.supporting.map(sup => `<div class="sermon-support">↳ ${formatRef(sup.book, sup.chapter, sup.verses)}</div>`).join('')}
          </div>`;
        }
        html += `</div></div>`;
      }

      // Where
      const { home, church } = stats.placeCounts;
      if (home + church > 0) {
        html += `<div class="dash-card">
          <h3>${t('whereRead')}</h3>
          <div class="stat-grid">
            <div class="stat-item"><div class="stat-value">${home}</div><div class="stat-label">${t('ctxHome')}</div></div>
            <div class="stat-item"><div class="stat-value">${church}</div><div class="stat-label">${t('ctxChurch')}</div></div>
          </div>
        </div>`;
      }

      // Milestones
      html += `<div class="dash-card">
        <h3>${t('milestones')}</h3>
        <div class="stat-grid">
          <div class="stat-item"><div class="stat-value" style="font-size:14px">${stats.firstReading}</div><div class="stat-label">${t('firstReading')}</div></div>
          <div class="stat-item"><div class="stat-value" style="font-size:14px">${stats.lastReading}</div><div class="stat-label">${t('lastReading')}</div></div>
          <div class="stat-item"><div class="stat-value">${stats.totalReadings.toLocaleString()}</div><div class="stat-label">${t('totalVerseReads')}</div></div>
          <div class="stat-item"><div class="stat-value">${stats.uniqueVerses.toLocaleString()}</div><div class="stat-label">${t('uniqueVerses')}</div></div>
        </div>
      </div>`;
    } else {
      html += `<div class="empty-state">
        <h3>${t('noReadingsYet')}</h3>
        <p>${t('noReadingsDesc')}</p>
      </div>`;
    }

    dom.dashboardContent.innerHTML = html;
  }

  // ===== Export/Import =====
  async function exportData() {
    try {
      const json = await storage.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bhible-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(t('dataExported'));
    } catch (err) {
      showToast(t('exportFailed', { err: err.message }));
    }
    closeSettings();
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const count = data.readings ? data.readings.length : 0;

      if (confirm(t('importConfirm', { n: count.toLocaleString() }))) {
        const { added } = await storage.importData(text, 'merge');
        showToast(t('nReadingsImported', { n: added.toLocaleString() }));
        refreshCurrentView();
      }
    } catch (err) {
      showToast(t('importFailed', { err: err.message }));
    }
    closeSettings();
  }

  // ===== Tab Switching =====
  function switchTab(tabName) {
    dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    dom.pages.forEach(p => p.classList.toggle('active', p.id === `page-${tabName}`));
    dom.pages.forEach(p => p.classList.toggle('hidden', p.id !== `page-${tabName}`));

    if (tabName === 'dashboard') {
      renderDashboard();
      dom.backBtn.classList.add('hidden');
      dom.pageTitle.textContent = t('dashboard');
    } else {
      state.navStack = ['books'];
      state.currentBook = null;
      state.currentChapter = null;
      state.selectedVerses.clear();
      updateView();
      renderBookGrid();
    }
  }

  // ===== Event Listeners =====

  // Settings panel
  dom.settingsBtn.addEventListener('click', openSettings);
  dom.settingsClose.addEventListener('click', closeSettings);
  dom.settingsOverlay.addEventListener('click', closeSettings);

  // Language options
  dom.langOptions.querySelectorAll('.setting-opt').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.val));
  });

  // Reader options
  dom.readerOptions.querySelectorAll('.setting-opt').forEach(btn => {
    btn.addEventListener('click', () => setReader(btn.dataset.val));
  });

  // Theme options
  dom.themeOptions.querySelectorAll('.setting-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.val);
      updateSettingsHighlights();
      renderBookGrid();
    });
  });

  // Data export/import
  dom.menuExport.addEventListener('click', exportData);
  dom.menuImport.addEventListener('click', () => dom.importFile.click());
  dom.importFile.addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  dom.backBtn.addEventListener('click', navigateBack);

  dom.testamentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTestament = btn.dataset.testament;
      dom.testamentBtns.forEach(b => b.classList.toggle('active', b === btn));
      renderBookGrid();
    });
  });

  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  dom.selectAllBtn.addEventListener('click', () => {
    const book = BIBLE_DATA.getBook(state.currentBook);
    if (!book) return;
    const verseCount = book.chapters[state.currentChapter - 1];
    for (let v = 1; v <= verseCount; v++) {
      state.selectedVerses.add(v);
    }
    paintSelection();
  });

  dom.deselectAllBtn.addEventListener('click', () => {
    state.selectedVerses.clear();
    paintSelection();
  });

  dom.markReadBtn.addEventListener('click', markSelectedAsRead);

  // ===== Service Worker =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // ===== Init =====
  I18N.init();
  applyStaticI18n();
  initTheme();
  updateSettingsHighlights();
  updateContextBar();
  state.navStack = ['books'];
  renderBookGrid();

})();
