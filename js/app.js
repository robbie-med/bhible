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
    context: { setting: null, place: null, sermonRole: null }
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
    textOptions: $('#text-options'),
    downloadOptions: $('#download-options'),
    readerPanel: $('#reader-panel'),
    readerTitle: $('#reader-title'),
    readerBody: $('#reader-body'),
    readerTrans: $('#reader-trans'),
    readerPrev: $('#reader-prev'),
    readerNext: $('#reader-next'),
    readerClose: $('#reader-close'),
    readerMark: $('#reader-mark'),
    legend: $('#legend'),
    testamentBtns: $$('.testament-btn'),
    tabs: $$('.tab'),
    pages: $$('.page'),
    dashboardContent: $('#dashboard-content'),
    content: $('#content'),
    creedsContent: $('#creeds-content'),
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
    if ($('#page-creeds').classList.contains('active')) {
      renderCreeds();
    }
    if (readerIsOpen()) paintReader();
  }

  // ===== Reader Setting =====
  function getReader() {
    return localStorage.getItem('bhible-reader') || 'builtin';
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
    updateDownloadButtons();
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
    // Offline text
    const textPref = getTextPref();
    dom.textOptions.querySelectorAll('.setting-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === textPref);
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
    refreshCurrentView();
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

    if (!$('#page-heatmap').classList.contains('active')) return;
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
    if (readerIsOpen()) paintReader();
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

  // ===== Built-in reader =====
  // Shows the current chapter from the offline text. Selection is shared with the verse grid.
  function getTextPref() {
    return localStorage.getItem('bhible-text') || (I18N.lang === 'ko' ? 'krv' : 'kjv');
  }

  function setTextPref(val) {
    localStorage.setItem('bhible-text', val);
    updateSettingsHighlights();
    if (readerIsOpen()) renderReader(false);
  }

  function readerIsOpen() {
    return !dom.readerPanel.classList.contains('hidden');
  }

  function openReader() {
    dom.readerPanel.classList.remove('hidden');
    history.pushState({ reader: true }, ''); // so the phone's Back button closes the reader
    renderReader(true);
  }

  function closeReader() {
    if (history.state && history.state.reader) history.back(); // popstate hides the panel
    else dom.readerPanel.classList.add('hidden');
  }

  window.addEventListener('popstate', () => {
    if (readerIsOpen()) dom.readerPanel.classList.add('hidden');
  });

  let readerRenderId = 0;
  async function renderReader(scrollToSelection) {
    const renderId = ++readerRenderId;
    const abbr = state.currentBook, ch = state.currentChapter;
    const pref = getTextPref();
    const transList = pref === 'both' ? ['kjv', 'krv'] : [pref];

    dom.readerTitle.textContent = `${I18N.bookName(abbr)} ${ch}`;
    dom.readerTrans.textContent = pref === 'both' ? 'KJV · 한글' : BibleText.translations[pref].name;
    dom.readerPrev.disabled = !neighborChapter(-1);
    dom.readerNext.disabled = !neighborChapter(1);
    updateReaderMark();

    let texts;
    try {
      texts = await Promise.all(transList.map(tr => BibleText.chapter(tr, abbr, ch)));
    } catch (err) {
      if (renderId !== readerRenderId) return;
      const msg = document.createElement('p');
      msg.className = 'reader-error';
      msg.textContent = t('textUnavailable');
      dom.readerBody.replaceChildren(msg);
      return;
    }
    if (renderId !== readerRenderId) return; // user already moved on

    const frag = document.createDocumentFragment();
    texts[0].forEach((_, i) => {
      const p = document.createElement('p');
      p.className = 'rv';
      p.dataset.verse = i + 1;
      const num = document.createElement('sup');
      num.textContent = i + 1;
      p.appendChild(num);
      texts.forEach((chapterText, j) => {
        const span = document.createElement('span');
        span.className = j === 0 ? 'rv-text' : 'rv-text rv-alt';
        span.lang = BibleText.translations[transList[j]].lang;
        span.textContent = chapterText[i] || '—'; // omitted/merged in this translation
        p.appendChild(span);
      });
      frag.appendChild(p);
    });
    dom.readerBody.replaceChildren(frag);
    paintReader();

    const first = state.selectedVerses.size ? Math.min(...state.selectedVerses) : null;
    const target = scrollToSelection && first && dom.readerBody.querySelector(`[data-verse="${first}"]`);
    if (target) target.scrollIntoView({ block: 'center' });
    else dom.readerBody.scrollTop = 0;
  }

  // Update selected/read highlighting in place (keeps scroll position)
  function paintReader() {
    dom.readerBody.querySelectorAll('.rv').forEach(p => {
      const v = parseInt(p.dataset.verse);
      p.classList.toggle('selected', state.selectedVerses.has(v));
      p.classList.toggle('read', storage.getVerseCount(state.currentBook, state.currentChapter, v) > 0);
    });
    updateReaderMark();
  }

  function updateReaderMark() {
    const n = state.selectedVerses.size;
    dom.readerMark.textContent = n > 0 ? t('markNVersesAsRead', { n, s: n > 1 ? 's' : '' }) : t('markChapterRead');
  }

  // Previous/next chapter, crossing book boundaries; null at Genesis 1 / Revelation 22
  function neighborChapter(delta) {
    const books = BIBLE_DATA.books;
    let bi = books.findIndex(b => b.abbr === state.currentBook);
    let ch = state.currentChapter + delta;
    if (ch < 1) {
      if (--bi < 0) return null;
      ch = books[bi].chapters.length;
    } else if (ch > books[bi].chapters.length) {
      if (++bi >= books.length) return null;
      ch = 1;
    }
    return { book: books[bi].abbr, chapter: ch };
  }

  function goToChapter(target) {
    if (!target) return;
    state.currentBook = target.book;
    state.currentChapter = target.chapter;
    state.selectedVerses.clear();
    state.currentTestament = BIBLE_DATA.getBook(target.book).testament;
    dom.testamentBtns.forEach(b => b.classList.toggle('active', b.dataset.testament === state.currentTestament));
    renderChapterGrid();
    renderVerseGrid();
    updateView();
    renderReader(false);
  }

  dom.readerLink.addEventListener('click', (e) => {
    if (getReader() !== 'builtin') return; // external readers open in a new tab
    e.preventDefault();
    openReader();
  });
  dom.readerClose.addEventListener('click', closeReader);
  dom.readerPrev.addEventListener('click', () => goToChapter(neighborChapter(-1)));
  dom.readerNext.addEventListener('click', () => goToChapter(neighborChapter(1)));
  dom.readerTrans.addEventListener('click', () => {
    const order = ['kjv', 'krv', 'both'];
    setTextPref(order[(order.indexOf(getTextPref()) + 1) % order.length]);
  });
  // Tap a verse to (de)select it; click never fires after a scroll
  dom.readerBody.addEventListener('click', (e) => {
    const p = e.target.closest('.rv');
    if (!p) return;
    const v = parseInt(p.dataset.verse);
    if (state.selectedVerses.has(v)) state.selectedVerses.delete(v);
    else state.selectedVerses.add(v);
    paintSelection();
  });
  dom.readerMark.addEventListener('click', async () => {
    if (state.selectedVerses.size === 0) {
      const book = BIBLE_DATA.getBook(state.currentBook);
      for (let v = 1; v <= book.chapters[state.currentChapter - 1]; v++) state.selectedVerses.add(v);
    }
    await markSelectedAsRead();
  });
  document.addEventListener('keydown', (e) => {
    if (!readerIsOpen()) return;
    if (e.key === 'Escape') closeReader();
    else if (e.key === 'ArrowLeft') goToChapter(neighborChapter(-1));
    else if (e.key === 'ArrowRight') goToChapter(neighborChapter(1));
  });

  // ===== Offline download =====
  async function updateDownloadButtons() {
    for (const btn of dom.downloadOptions.querySelectorAll('[data-dl]')) {
      if (btn.dataset.busy) continue;
      const name = BibleText.translations[btn.dataset.dl].name;
      const done = (await BibleText.downloadedCount(btn.dataset.dl)) >= BIBLE_DATA.books.length;
      btn.textContent = t(done ? 'downloadedTrans' : 'downloadTrans', { name });
      btn.classList.toggle('active', done);
    }
  }

  dom.downloadOptions.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-dl]');
    if (!btn || btn.dataset.busy) return;
    const trans = btn.dataset.dl;
    const name = BibleText.translations[trans].name;
    btn.dataset.busy = '1';
    // Ask the browser not to evict the offline Bible (and reading log) under storage pressure
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    try {
      await BibleText.download(trans, (done, total) => {
        btn.textContent = t('downloadingTrans', { name, done, total });
      });
      showToast(t('downloadedTrans', { name }));
    } catch (err) {
      showToast(t('downloadFailed'));
    }
    delete btn.dataset.busy;
    updateDownloadButtons();
  });

  dom.textOptions.querySelectorAll('.setting-opt').forEach(btn => {
    btn.addEventListener('click', () => setTextPref(btn.dataset.val));
  });

  // ===== Confessions & creeds =====
  // data/creeds/index.json + <id>.<lang>.json, built by tools/build_creeds.py
  const creeds = { index: null, docs: {}, docId: null, lang: 'en' };
  const esc = (str) => String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function fetchJSON(url) {
    return fetch(url).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
  }

  function loadCreedDoc(id, lang) {
    const key = `${id}.${lang}`;
    if (!creeds.docs[key]) {
      creeds.docs[key] = fetchJSON(`data/creeds/${key}.json`).catch(err => {
        delete creeds.docs[key];
        throw err;
      });
    }
    return creeds.docs[key];
  }

  function creedMeta(id) {
    return creeds.index && creeds.index.find(d => d.id === id);
  }

  function creedTitle(meta) {
    return meta.title[I18N.lang] || meta.title.en;
  }

  function showCreedError() {
    dom.creedsContent.innerHTML = `<p class="reader-error">${esc(t('textUnavailable'))}</p>`;
  }

  async function renderCreeds() {
    try {
      if (!creeds.index) creeds.index = await fetchJSON('data/creeds/index.json');
    } catch (err) {
      return showCreedError();
    }
    if (creeds.docId) return renderCreedDoc();

    dom.backBtn.classList.add('hidden');
    dom.pageTitle.textContent = t('confessionsTab');
    let html = '';
    for (const [type, label] of [['creed', 'creeds'], ['confession', 'confessions'], ['catechism', 'catechisms'], ['early', 'earlyChurch']]) {
      html += `<div class="category-header">${esc(t(label))}</div><div class="creed-list">`;
      for (const d of creeds.index.filter(d => d.type === type)) {
        html += `<button class="creed-item" data-doc="${d.id}">
          <span class="creed-title">${esc(creedTitle(d))}</span>
          <span class="creed-year">${esc(d.year)}</span>
        </button>`;
      }
      html += `</div>`;
    }
    dom.creedsContent.innerHTML = html;
  }

  function openCreedDoc(id) {
    creeds.docId = id;
    creeds.lang = I18N.lang; // falls back to English with a notice if untranslated
    renderCreedDoc(true);
  }

  function closeCreedDoc() {
    saveCreedScroll();
    creeds.docId = null;
    renderCreeds();
    dom.content.scrollTop = 0;
  }

  function creedScrollKey() {
    return `bhible-creed-scroll-${creeds.docId}`;
  }

  function saveCreedScroll() {
    if (!creeds.docId) return;
    try { localStorage.setItem(creedScrollKey(), String(Math.round(dom.content.scrollTop))); } catch (e) {}
  }

  // Footnote markers "[k]" become superscripts (only shown with proofs on)
  function withMarkers(text) {
    return esc(text).replace(/\[(\d+)\]/g, '<sup class="fn">$1</sup>');
  }

  function proofsHtml(proofs) {
    const ids = Object.keys(proofs || {});
    if (ids.length === 0) return '';
    return `<div class="proofs">${ids.map(k => `<span class="proof-group"><sup>${esc(k)}</sup>${
      proofs[k].map(ref => {
        const label = refLabel(ref);
        return label ? `<button class="ref" data-ref="${esc(ref)}">${esc(label)}</button>` : '';
      }).join('')
    }</span>`).join('')}</div>`;
  }

  let creedRenderId = 0;
  async function renderCreedDoc(restoreScroll) {
    const renderId = ++creedRenderId;
    const meta = creedMeta(creeds.docId);
    const lang = meta.langs.includes(creeds.lang) ? creeds.lang : 'en';
    dom.backBtn.classList.remove('hidden');
    dom.pageTitle.textContent = creedTitle(meta);

    let doc;
    try {
      doc = await loadCreedDoc(meta.id, lang);
    } catch (err) {
      return showCreedError();
    }
    if (renderId !== creedRenderId) return;

    const showProofs = localStorage.getItem('bhible-proofs') === '1';
    const hasProofs = JSON.stringify(doc).includes('"proofs":{"');
    let html = `<div class="creed-toolbar">`;
    if (meta.langs.length > 1) {
      html += `<div class="seg">${meta.langs.map(l =>
        `<button class="seg-btn${l === lang ? ' active' : ''}" data-lang="${l}">${l === 'ko' ? '한국어' : 'EN'}</button>`).join('')}</div>`;
    }
    if (doc.questions) {
      html += `<label class="jump">${esc(t('jumpTo'))} <input type="number" inputmode="numeric" min="1" max="${doc.questions.length}" id="creed-jump" placeholder="#"></label>`;
    } else if (doc.chapters) {
      html += `<select id="creed-jump" class="jump-select" aria-label="${esc(t('jumpTo'))}">${doc.chapters.map(ch =>
        `<option value="${ch.n}">${esc(t('chapterN', { n: ch.n }))} ${esc(ch.title)}</option>`).join('')}</select>`;
    }
    if (hasProofs) {
      html += `<button class="toolbar-btn proofs-toggle${showProofs ? ' active' : ''}">${esc(t('proofs'))}</button>`;
    }
    html += `</div>`;
    if (lang !== creeds.lang) html += `<p class="creed-note">${esc(t('koUnavailable'))}</p>`;

    html += `<div class="creed-doc${showProofs ? ' show-proofs' : ''}" lang="${lang}">`;
    if (doc.paragraphs) {
      html += doc.paragraphs.map(p => `<p class="creed-para">${esc(p)}</p>`).join('');
    } else if (doc.chapters) {
      for (const ch of doc.chapters) {
        html += `<h3 class="cc-title" id="cc-${ch.n}">${esc(t('chapterN', { n: ch.n }))}<br>${esc(ch.title)}</h3>`;
        for (const sec of ch.sections) {
          html += `<div class="cs"><p><span class="cs-n">${sec.n}.</span> ${withMarkers(sec.text)}</p>${proofsHtml(sec.proofs)}</div>`;
        }
      }
    } else {
      for (const q of doc.questions) {
        if (q.ld) html += `<h3 class="cc-title">${esc(t('lordsDay', { n: q.ld }))}</h3>`;
        html += `<div class="cq" id="cq-${q.n}">
          <p class="cq-q"><span class="cq-n">${esc(t('questionAbbr'))} ${q.n}.</span> ${esc(q.q)}</p>
          <p class="cq-a"><span class="cq-n">${esc(t('answerAbbr'))}</span> ${withMarkers(q.a)}</p>
          ${proofsHtml(q.proofs)}
        </div>`;
      }
    }
    html += `</div>`;
    dom.creedsContent.innerHTML = html;

    if (restoreScroll) {
      let top = 0;
      try { top = parseInt(localStorage.getItem(creedScrollKey())) || 0; } catch (e) {}
      dom.content.scrollTop = top;
    }
  }

  let creedScrollTimer;
  dom.content.addEventListener('scroll', () => {
    if (!creeds.docId || !$('#page-creeds').classList.contains('active')) return;
    clearTimeout(creedScrollTimer);
    creedScrollTimer = setTimeout(saveCreedScroll, 300);
  }, { passive: true });

  dom.creedsContent.addEventListener('click', (e) => {
    const item = e.target.closest('.creed-item');
    if (item) return openCreedDoc(item.dataset.doc);
    const langBtn = e.target.closest('.seg-btn');
    if (langBtn) {
      creeds.lang = langBtn.dataset.lang;
      return renderCreedDoc(false);
    }
    if (e.target.closest('.proofs-toggle')) {
      const on = localStorage.getItem('bhible-proofs') !== '1';
      try { localStorage.setItem('bhible-proofs', on ? '1' : '0'); } catch (err) {}
      e.target.closest('.proofs-toggle').classList.toggle('active', on);
      dom.creedsContent.querySelector('.creed-doc').classList.toggle('show-proofs', on);
      return;
    }
    const ref = e.target.closest('.ref');
    if (ref) openPassage(ref.dataset.ref);
  });

  dom.creedsContent.addEventListener('change', (e) => {
    if (e.target.id !== 'creed-jump') return;
    const n = parseInt(e.target.value);
    const el = dom.creedsContent.querySelector(`#cq-${n}, #cc-${n}`);
    if (el) el.scrollIntoView({ block: 'start' });
    if (e.target.tagName === 'INPUT') e.target.blur();
  });

  // ===== Scripture references (OSIS, e.g. "Rom.11.36", "Ps.19.1-Ps.19.3", "Gen.1") =====
  function parseOsisRef(ref) {
    const [start, end] = ref.split('-');
    const m = start.match(/^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?$/);
    const book = m && BIBLE_DATA.getBook(m[1]);
    const chapter = m && parseInt(m[2]);
    const max = book && book.chapters[chapter - 1];
    if (!max) return null;
    const from = m[3] ? Math.min(parseInt(m[3]), max) : 1;
    let to = m[3] ? from : max;
    let endChapter = chapter, endVerse = null;
    const e = end && end.match(/(?:[1-3]?[A-Za-z]+\.)?(\d+)(?:\.(\d+))?$/);
    if (e) {
      endChapter = e[2] ? parseInt(e[1]) : chapter;
      endVerse = parseInt(e[2] || e[1]);
      to = endChapter === chapter ? Math.min(Math.max(endVerse, from), max) : max; // cross-chapter: rest of the first chapter
    }
    return { book: m[1], chapter, from, to, whole: !m[3], endChapter, endVerse };
  }

  function refLabel(ref) {
    const r = parseOsisRef(ref);
    if (!r) return null;
    const name = I18N.lang === 'ko' ? I18N.bookAbbr(r.book) : r.book;
    if (r.whole) return `${name} ${r.chapter}`;
    if (r.endChapter !== r.chapter) return `${name} ${r.chapter}:${r.from}–${r.endChapter}:${r.endVerse}`;
    return `${name} ${r.chapter}:${r.from}${r.to > r.from ? `–${r.to}` : ''}`;
  }

  // Open a passage in the chosen reader with its verses selected (ready to Mark as Read)
  function openPassage(ref) {
    const r = parseOsisRef(ref);
    if (!r) return;
    const readerId = getReader();
    if (readerId !== 'builtin') {
      window.open(BIBLE_DATA.getReaderUrl(readerId, r.book, r.chapter, r.whole ? null : r.from), '_blank', 'noopener');
      return;
    }
    state.currentBook = r.book;
    state.currentChapter = r.chapter;
    state.selectedVerses = r.whole ? new Set() : new Set(Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i));
    state.currentTestament = BIBLE_DATA.getBook(r.book).testament;
    dom.testamentBtns.forEach(b => b.classList.toggle('active', b.dataset.testament === state.currentTestament));
    state.navStack = ['books', 'chapters', 'verses'];
    renderChapterGrid();
    renderVerseGrid();
    updateView();
    openReader();
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
      const on = chip.dataset.setting ? chip.dataset.setting === ctx.setting
        : chip.dataset.place ? chip.dataset.place === ctx.place : chip.dataset.sermon === ctx.sermonRole;
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
    if (chip.dataset.setting) {
      ctx.setting = ctx.setting === chip.dataset.setting ? null : chip.dataset.setting;
    } else if (chip.dataset.place) {
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

    const context = { setting: state.context.setting, place: state.context.place, sermonRole: state.context.sermonRole };
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
      const { home, church, personal, family } = stats.placeCounts;
      if (home + church + personal + family > 0) {
        html += `<div class="dash-card">
          <h3>${t('whereRead')}</h3>
          <div class="stat-grid">
            <div class="stat-item"><div class="stat-value">${home}</div><div class="stat-label">${t('ctxHome')}</div></div>
            <div class="stat-item"><div class="stat-value">${church}</div><div class="stat-label">${t('ctxChurch')}</div></div>
            <div class="stat-item"><div class="stat-value">${personal}</div><div class="stat-label">${t('ctxPersonal')}</div></div>
            <div class="stat-item"><div class="stat-value">${family}</div><div class="stat-label">${t('ctxFamily')}</div></div>
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
      const filename = `bhible-export-${new Date().toISOString().slice(0, 10)}.json`;
      // Android app (WebView) can't download blobs; it offers a native save dialog instead
      if (window.BHibleAndroid) {
        window.BHibleAndroid.saveFile(filename, json);
        closeSettings();
        return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
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
    } else if (tabName === 'creeds') {
      renderCreeds();
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

  dom.backBtn.addEventListener('click', () => {
    if ($('#page-creeds').classList.contains('active')) closeCreedDoc();
    else navigateBack();
  });

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
