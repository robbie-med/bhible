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
    navStack: [] // ['books', 'chapters', 'verses']
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
  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.remove('hidden');
    dom.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      dom.toast.classList.remove('show');
      setTimeout(() => dom.toast.classList.add('hidden'), 300);
    }, 2200);
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
      cell.className = 'chapter-cell';
      cell.style.background = getHeatColor(heatLevel);
      if (heatLevel === 0) cell.setAttribute('data-heat', '0');
      if (heatLevel === 0) {
        cell.style.border = '1px solid var(--border)';
        cell.style.color = 'var(--text-secondary)';
      } else {
        cell.style.color = 'var(--text-primary)';
        cell.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
      }

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

      // Long press to mark entire chapter, short tap to navigate
      let longPressTimer;
      let longPressFired = false;
      const startLongPress = (e) => {
        longPressFired = false;
        longPressTimer = setTimeout(async () => {
          longPressFired = true;
          const verses = [];
          for (let v = 1; v <= verseCount; v++) {
            verses.push({ book: state.currentBook, chapter: chNum, verse: v });
          }
          await storage.markRead(verses);
          showToast(t('chapterMarkedRead', { book: I18N.bookName(state.currentBook), ch: chNum }));
          renderChapterGrid();
          if (navigator.vibrate) navigator.vibrate(50);
        }, 600);
      };
      const cancelLongPress = () => clearTimeout(longPressTimer);

      cell.addEventListener('touchstart', (e) => {
        startLongPress(e);
      }, { passive: true });
      cell.addEventListener('touchend', (e) => {
        cancelLongPress();
        if (!longPressFired) {
          state.currentChapter = chNum;
          state.selectedVerses.clear();
          navigateTo('verses');
          renderVerseGrid();
        }
        e.preventDefault();
      });
      cell.addEventListener('touchmove', cancelLongPress);
      cell.addEventListener('mousedown', startLongPress);
      cell.addEventListener('mouseup', cancelLongPress);
      cell.addEventListener('mouseleave', cancelLongPress);

      cell.addEventListener('click', (e) => {
        if (longPressFired) return;
        state.currentChapter = chNum;
        state.selectedVerses.clear();
        navigateTo('verses');
        renderVerseGrid();
      });

      dom.chapterGrid.appendChild(cell);
    });

    dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook);
  }

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

    let isDragging = false;
    let dragMode = null;

    const updateMarkBtn = () => {
      dom.markReadBtn.disabled = state.selectedVerses.size === 0;
      if (state.selectedVerses.size > 0) {
        const s = state.selectedVerses.size > 1 ? 's' : '';
        dom.markReadBtn.textContent = t('markNVersesAsRead', { n: state.selectedVerses.size, s });
        const firstVerse = Math.min(...state.selectedVerses);
        dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter, firstVerse);
      } else {
        dom.markReadBtn.textContent = t('markAsRead');
        dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter);
      }
    };

    const toggleVerse = (verseNum, forceMode) => {
      const mode = forceMode || (state.selectedVerses.has(verseNum) ? 'deselect' : 'select');
      if (mode === 'select') {
        state.selectedVerses.add(verseNum);
      } else {
        state.selectedVerses.delete(verseNum);
      }
      const cell = dom.verseGrid.querySelector(`[data-verse="${verseNum}"]`);
      if (cell) cell.classList.toggle('selected', state.selectedVerses.has(verseNum));
      updateMarkBtn();
      return mode;
    };

    for (let v = 1; v <= verseCount; v++) {
      const readCount = storage.getVerseCount(state.currentBook, state.currentChapter, v);
      const heatLevel = getHeatLevel(readCount, maxCount);

      const cell = document.createElement('div');
      cell.className = 'verse-cell';
      cell.dataset.verse = v;
      cell.style.background = getHeatColor(heatLevel);
      if (heatLevel === 0) {
        cell.style.border = '2px solid var(--border)';
        cell.style.color = 'var(--text-secondary)';
      } else {
        cell.style.color = 'var(--text-primary)';
        cell.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
      }

      cell.textContent = v;

      if (readCount > 0) {
        const dot = document.createElement('span');
        dot.className = 'read-dot';
        dot.title = t('readNTimes', { n: readCount, s: readCount > 1 ? 's' : '' });
        cell.appendChild(dot);
      }

      cell.addEventListener('touchstart', (e) => {
        isDragging = true;
        dragMode = toggleVerse(v);
        e.preventDefault();
      }, { passive: false });

      cell.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (el && el.dataset.verse) {
          const num = parseInt(el.dataset.verse);
          if (dragMode === 'select' && !state.selectedVerses.has(num)) {
            toggleVerse(num, 'select');
          } else if (dragMode === 'deselect' && state.selectedVerses.has(num)) {
            toggleVerse(num, 'deselect');
          }
        }
        e.preventDefault();
      }, { passive: false });

      cell.addEventListener('touchend', () => { isDragging = false; });
      cell.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragMode = toggleVerse(v);
        e.preventDefault();
      });

      dom.verseGrid.appendChild(cell);
    }

    dom.verseGrid.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.dataset.verse) {
        const num = parseInt(el.dataset.verse);
        if (dragMode === 'select' && !state.selectedVerses.has(num)) {
          toggleVerse(num, 'select');
        } else if (dragMode === 'deselect' && state.selectedVerses.has(num)) {
          toggleVerse(num, 'deselect');
        }
      }
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    updateMarkBtn();
  }

  // ===== Mark Read =====
  async function markSelectedAsRead() {
    if (state.selectedVerses.size === 0) return;

    const verses = [...state.selectedVerses].map(v => ({
      book: state.currentBook,
      chapter: state.currentChapter,
      verse: v
    }));

    await storage.markRead(verses);

    const count = verses.length;
    const s = count > 1 ? 's' : '';
    showToast(t('versesLogged', {
      n: count, s,
      book: I18N.bookName(state.currentBook),
      ch: state.currentChapter
    }));

    if (navigator.vibrate) navigator.vibrate(30);

    state.selectedVerses.clear();
    renderVerseGrid();
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
      URL.revokeObjectURL(url);
      showToast(t('dataExported'));
    } catch (err) {
      showToast(t('exportFailed', { err: err.message }));
    }
    closeMenu();
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const count = data.readings ? data.readings.length : 0;

      if (confirm(t('importConfirm', { n: count.toLocaleString() }))) {
        await storage.importData(text, 'merge');
        showToast(t('nReadingsImported', { n: count.toLocaleString() }));
        renderBookGrid();
        renderDashboard();
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
    dom.verseGrid.querySelectorAll('.verse-cell').forEach(c => c.classList.add('selected'));
    dom.markReadBtn.disabled = false;
    const s = state.selectedVerses.size > 1 ? 's' : '';
    dom.markReadBtn.textContent = t('markNVersesAsRead', { n: state.selectedVerses.size, s });
    const firstVerse = Math.min(...state.selectedVerses);
    dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter, firstVerse);
  });

  dom.deselectAllBtn.addEventListener('click', () => {
    state.selectedVerses.clear();
    dom.verseGrid.querySelectorAll('.verse-cell').forEach(c => c.classList.remove('selected'));
    dom.markReadBtn.disabled = true;
    dom.markReadBtn.textContent = t('markAsRead');
    dom.readerLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter);
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
  state.navStack = ['books'];
  renderBookGrid();

})();
