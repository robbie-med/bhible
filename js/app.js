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

  // ===== DOM Refs =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    backBtn: $('#back-btn'),
    pageTitle: $('#page-title'),
    themeToggle: $('#theme-toggle'),
    themeIconDark: $('#theme-icon-dark'),
    themeIconLight: $('#theme-icon-light'),
    menuBtn: $('#menu-btn'),
    dropdownMenu: $('#dropdown-menu'),
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
    relightLink: $('#relight-link'),
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
    dom.themeIconDark.classList.toggle('hidden', theme === 'light');
    dom.themeIconLight.classList.toggle('hidden', theme === 'dark');
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
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
      dom.pageTitle.textContent = 'BHible';
    } else if (showChapters) {
      const book = BIBLE_DATA.getBook(state.currentBook);
      dom.pageTitle.textContent = book ? book.name : 'Chapters';
    } else if (showVerses) {
      const book = BIBLE_DATA.getBook(state.currentBook);
      dom.pageTitle.textContent = book ? `${book.name} ${state.currentChapter}` : 'Verses';
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

  // ===== Book Grid =====
  function renderBookGrid() {
    dom.bookGrid.innerHTML = '';
    const testament = state.currentTestament;
    const categories = BIBLE_DATA.categories[testament];
    const maxBookHeat = Math.max(...BIBLE_DATA.books
      .filter(b => b.testament === testament)
      .map(b => storage.getBookHeat(b.abbr)), 0.001);

    for (const [category, bookAbbrs] of Object.entries(categories)) {
      const section = document.createElement('div');
      section.className = 'category-section';

      const header = document.createElement('div');
      header.className = 'category-header';
      header.textContent = category;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'category-grid';

      for (const abbr of bookAbbrs) {
        const book = BIBLE_DATA.getBook(abbr);
        if (!book) continue;

        const totalVerses = book.chapters.reduce((a, b) => a + b, 0);
        const versesRead = storage.getBookVersesRead(abbr);
        const heat = storage.getBookHeat(abbr);
        const heatLevel = getHeatLevel(heat, maxBookHeat);

        // Size proportional to verse count (sqrt for visual balance)
        const minSize = 42;
        const maxSize = 90;
        const maxVerses = Math.max(...BIBLE_DATA.books
          .filter(b => b.testament === testament)
          .map(b => b.chapters.reduce((a, c) => a + c, 0)));
        const sizeRatio = Math.sqrt(totalVerses / maxVerses);
        const size = Math.round(minSize + (maxSize - minSize) * sizeRatio);

        const block = document.createElement('div');
        block.className = 'book-block' + (size >= 70 ? ' large-block' : '');
        block.style.width = size + 'px';
        block.style.height = size + 'px';
        block.style.background = getHeatColor(heatLevel);
        if (heatLevel === 0) block.setAttribute('data-heat', '0');

        const label = document.createElement('span');
        label.className = 'book-label';
        label.textContent = abbr;
        block.appendChild(label);

        // Tooltip info
        block.title = `${book.name}: ${versesRead}/${totalVerses} verses`;

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

      // Long press to mark entire chapter
      let longPressTimer;
      const startLongPress = (e) => {
        e.preventDefault();
        longPressTimer = setTimeout(async () => {
          // Mark all verses in chapter as read
          const verses = [];
          for (let v = 1; v <= verseCount; v++) {
            verses.push({ book: state.currentBook, chapter: chNum, verse: v });
          }
          await storage.markRead(verses);
          showToast(`${book.name} ${chNum} marked as read`);
          renderChapterGrid();
          // Haptic feedback
          if (navigator.vibrate) navigator.vibrate(50);
        }, 600);
      };
      const cancelLongPress = () => clearTimeout(longPressTimer);

      cell.addEventListener('touchstart', startLongPress, { passive: false });
      cell.addEventListener('touchend', cancelLongPress);
      cell.addEventListener('touchmove', cancelLongPress);
      cell.addEventListener('mousedown', startLongPress);
      cell.addEventListener('mouseup', cancelLongPress);
      cell.addEventListener('mouseleave', cancelLongPress);

      // Tap to go to verses
      cell.addEventListener('click', () => {
        // Only navigate if long press didn't fire
        state.currentChapter = chNum;
        state.selectedVerses.clear();
        navigateTo('verses');
        renderVerseGrid();
      });

      dom.chapterGrid.appendChild(cell);
    });

    // Update relight link for chapter level
    dom.relightLink.href = BIBLE_DATA.getRelightUrl(state.currentBook);
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

    // Update relight link
    dom.relightLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter);

    // Drag selection state
    let isDragging = false;
    let dragMode = null; // 'select' or 'deselect'

    const updateMarkBtn = () => {
      dom.markReadBtn.disabled = state.selectedVerses.size === 0;
      dom.markReadBtn.textContent = state.selectedVerses.size > 0
        ? `Mark ${state.selectedVerses.size} Verse${state.selectedVerses.size > 1 ? 's' : ''} as Read`
        : 'Mark as Read';

      // Update relight link to first selected verse
      if (state.selectedVerses.size > 0) {
        const firstVerse = Math.min(...state.selectedVerses);
        dom.relightLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter, firstVerse);
      } else {
        dom.relightLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter);
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
        dot.title = `Read ${readCount} time${readCount > 1 ? 's' : ''}`;
        cell.appendChild(dot);
      }

      // Touch/mouse drag selection
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

    // Mouse drag on the grid container
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
    const book = BIBLE_DATA.getBook(state.currentBook);
    showToast(`${count} verse${count > 1 ? 's' : ''} in ${book.name} ${state.currentChapter} logged`);

    if (navigator.vibrate) navigator.vibrate(30);

    state.selectedVerses.clear();
    renderVerseGrid();
  }

  // ===== Dashboard =====
  function renderDashboard() {
    const stats = storage.getStats();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = '';

    // Overview
    html += `<div class="dash-card">
      <h3>Overview</h3>
      <div class="stat-grid">
        <div class="stat-item"><div class="stat-value">${stats.percentComplete}%</div><div class="stat-label">Complete</div></div>
        <div class="stat-item"><div class="stat-value">${stats.uniqueVerses.toLocaleString()}</div><div class="stat-label">of ${stats.totalBibleVerses.toLocaleString()} verses</div></div>
        <div class="stat-item"><div class="stat-value">${stats.currentStreak}</div><div class="stat-label">Current streak (days)</div></div>
        <div class="stat-item"><div class="stat-value">${stats.longestStreak}</div><div class="stat-label">Longest streak (days)</div></div>
      </div>
    </div>`;

    // Testament Progress
    const otPct = stats.otTotal > 0 ? ((stats.otVerses / stats.otTotal) * 100).toFixed(1) : '0.0';
    const ntPct = stats.ntTotal > 0 ? ((stats.ntVerses / stats.ntTotal) * 100).toFixed(1) : '0.0';
    html += `<div class="dash-card">
      <h3>Testament Progress</h3>
      <div class="progress-row">
        <span class="progress-label">Old Testament</span>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${otPct}%"></div></div>
        <span class="progress-pct">${otPct}%</span>
      </div>
      <div class="progress-row">
        <span class="progress-label">New Testament</span>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${ntPct}%"></div></div>
        <span class="progress-pct">${ntPct}%</span>
      </div>
    </div>`;

    // Category Progress
    html += `<div class="dash-card"><h3>Category Progress</h3>`;
    for (const [cat, data] of Object.entries(stats.categoryStats)) {
      const pct = data.total > 0 ? ((data.read / data.total) * 100).toFixed(1) : '0.0';
      html += `<div class="progress-row">
        <span class="progress-label">${cat}</span>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <span class="progress-pct">${pct}%</span>
      </div>`;
    }
    html += `</div>`;

    // Time of Day
    if (stats.totalReadings > 0) {
      const maxHour = Math.max(...stats.hourCounts, 1);
      html += `<div class="dash-card"><h3>Reading Time of Day</h3><div class="hour-chart">`;
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
      html += `<div class="dash-card"><h3>Day of Week</h3><div class="day-chart">`;
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
        html += `<div class="dash-card"><h3>Days Active per Month</h3><div class="months-grid">`;
        for (const [month, days] of months) {
          const [y, m] = month.split('-');
          const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
          html += `<div class="month-item">
            <div class="month-name">${monthName}</div>
            <div class="month-days">${days}</div>
            <div class="month-suffix">days</div>
          </div>`;
        }
        html += `</div></div>`;
      }

      // Reading milestones
      html += `<div class="dash-card">
        <h3>Milestones</h3>
        <div class="stat-grid">
          <div class="stat-item"><div class="stat-value" style="font-size:14px">${stats.firstReading}</div><div class="stat-label">First reading</div></div>
          <div class="stat-item"><div class="stat-value" style="font-size:14px">${stats.lastReading}</div><div class="stat-label">Last reading</div></div>
          <div class="stat-item"><div class="stat-value">${stats.totalReadings.toLocaleString()}</div><div class="stat-label">Total verse-reads</div></div>
          <div class="stat-item"><div class="stat-value">${stats.uniqueVerses.toLocaleString()}</div><div class="stat-label">Unique verses</div></div>
        </div>
      </div>`;
    } else {
      html += `<div class="empty-state">
        <h3>No readings yet</h3>
        <p>Start reading the Bible to see your stats here. Go to the Heat Map tab and select verses to log your reading.</p>
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
      showToast('Data exported');
    } catch (err) {
      showToast('Export failed: ' + err.message);
    }
    closeMenu();
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const count = data.readings ? data.readings.length : 0;

      if (confirm(`Import ${count.toLocaleString()} readings? This will merge with existing data.`)) {
        await storage.importData(text, 'merge');
        showToast(`${count.toLocaleString()} readings imported`);
        renderBookGrid();
        renderDashboard();
      }
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
    closeMenu();
  }

  // ===== Menu =====
  function toggleMenu() {
    dom.dropdownMenu.classList.toggle('hidden');
  }

  function closeMenu() {
    dom.dropdownMenu.classList.add('hidden');
  }

  // ===== Tab Switching =====
  function switchTab(tabName) {
    dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    dom.pages.forEach(p => p.classList.toggle('active', p.id === `page-${tabName}`));
    dom.pages.forEach(p => p.classList.toggle('hidden', p.id !== `page-${tabName}`));

    if (tabName === 'dashboard') {
      renderDashboard();
      dom.backBtn.classList.add('hidden');
      dom.pageTitle.textContent = 'Dashboard';
    } else {
      // Reset to book view when switching to heatmap
      state.navStack = ['books'];
      state.currentBook = null;
      state.currentChapter = null;
      state.selectedVerses.clear();
      updateView();
      renderBookGrid();
    }
  }

  // ===== Event Listeners =====
  dom.themeToggle.addEventListener('click', toggleTheme);
  dom.menuBtn.addEventListener('click', toggleMenu);
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
    dom.markReadBtn.textContent = `Mark ${state.selectedVerses.size} Verses as Read`;
    // Update relight link
    const firstVerse = Math.min(...state.selectedVerses);
    dom.relightLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter, firstVerse);
  });

  dom.deselectAllBtn.addEventListener('click', () => {
    state.selectedVerses.clear();
    dom.verseGrid.querySelectorAll('.verse-cell').forEach(c => c.classList.remove('selected'));
    dom.markReadBtn.disabled = true;
    dom.markReadBtn.textContent = 'Mark as Read';
    dom.relightLink.href = BIBLE_DATA.getRelightUrl(state.currentBook, state.currentChapter);
  });

  dom.markReadBtn.addEventListener('click', markSelectedAsRead);

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!dom.dropdownMenu.classList.contains('hidden') &&
        !dom.menuBtn.contains(e.target) &&
        !dom.dropdownMenu.contains(e.target)) {
      closeMenu();
    }
  });

  // ===== Service Worker =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // ===== Init =====
  initTheme();
  state.navStack = ['books'];
  renderBookGrid();

})();
