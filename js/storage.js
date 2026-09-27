// IndexedDB-based storage for Bible reading data
const DB_NAME = 'bhible';
const DB_VERSION = 2;
const STORE_NAME = 'readings';
// One row per "Mark as Read" action, keyed by its timestamp (shared with its readings rows):
// { timestamp, book, chapter, verses: [n...], place: 'home'|'church'|null,
//   sermonRole: 'main'|'support'|null, sermonDate: 'YYYY-MM-DD'|null, sermonMain: <main session timestamp>|null }
const SESSION_STORE = 'sessions';

// Calendar day in the user's local timezone, "YYYY-MM-DD" (streaks must not roll over at UTC midnight)
function localDateKey(tsOrDate) {
  const d = new Date(tsOrDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Whole days between two "YYYY-MM-DD" keys
function dayDiff(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

class BibleStorage {
  constructor() {
    this.db = null;
    // In-memory cache: { "Gen:1:1": [timestamp1, timestamp2, ...] }
    this.cache = {};
    // Index: { "Gen": Set("Gen:1:1", ...) } so per-book queries don't scan the whole cache
    this.byBook = {};
    // Sessions, newest first
    this.sessions = [];
    this.ready = this._init();
  }

  _init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('verseKey', 'verseKey', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: 'timestamp' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        this._loadCache().then(resolve);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async _loadCache() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, SESSION_STORE], 'readonly');
      const readingsReq = tx.objectStore(STORE_NAME).getAll();
      const sessionsReq = tx.objectStore(SESSION_STORE).getAll();
      tx.oncomplete = () => {
        this.cache = {};
        this.byBook = {};
        for (const record of readingsReq.result) {
          this._cacheAdd(record.verseKey, record.book, record.timestamp);
        }
        this.sessions = sessionsReq.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  _cacheAdd(verseKey, book, timestamp) {
    if (!this.cache[verseKey]) this.cache[verseKey] = [];
    this.cache[verseKey].push(timestamp);
    if (!this.byBook[book]) this.byBook[book] = new Set();
    this.byBook[book].add(verseKey);
  }

  _cacheRemove(verseKey, book, timestamp) {
    const list = this.cache[verseKey];
    if (!list) return;
    const i = list.indexOf(timestamp);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) {
      delete this.cache[verseKey];
      if (this.byBook[book]) this.byBook[book].delete(verseKey);
    }
  }

  _sessionAdd(session) {
    this.sessions = this.sessions.filter(se => se.timestamp !== session.timestamp);
    this.sessions.push(session);
    this.sessions.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Sermon main texts, newest sermon date first, each with its supporting texts attached
  getSermons() {
    const mains = this.sessions.filter(se => se.sermonRole === 'main');
    const byMain = new Map(mains.map(m => [m.timestamp, { ...m, supporting: [] }]));
    for (const se of this.sessions) {
      if (se.sermonRole === 'support' && byMain.has(se.sermonMain)) {
        byMain.get(se.sermonMain).supporting.unshift(se); // sessions are newest-first; keep supports in logged order
      }
    }
    return [...byMain.values()].sort((a, b) =>
      (b.sermonDate || '').localeCompare(a.sermonDate || '') || b.timestamp - a.timestamp);
  }

  _bookKeys(book) {
    return this.byBook[book] || [];
  }

  // Mark verses as read. verses = [{book, chapter, verse}] (all in one chapter), timestamp = Date.now()
  // context = { place, sermonRole, sermonDate, sermonMain } (all optional)
  async markRead(verses, timestamp = Date.now(), context = {}) {
    await this.ready;
    const session = {
      timestamp,
      book: verses[0].book,
      chapter: verses[0].chapter,
      verses: verses.map(v => v.verse),
      setting: context.setting || null, // 'personal' | 'family' (family worship)
      place: context.place || null,
      sermonRole: context.sermonRole || null,
      sermonDate: context.sermonRole ? (context.sermonDate || localDateKey(timestamp)) : null,
      sermonMain: context.sermonRole === 'support' ? (context.sermonMain || null) : null
    };
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, SESSION_STORE], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      tx.objectStore(SESSION_STORE).put(session);
      this._sessionAdd(session);
      for (const v of verses) {
        const verseKey = `${v.book}:${v.chapter}:${v.verse}`;
        const record = { verseKey, book: v.book, chapter: v.chapter, verse: v.verse, timestamp };
        store.add(record);
        this._cacheAdd(verseKey, v.book, timestamp);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Undo a markRead: delete the records for these verses carrying exactly this timestamp
  async unmarkRead(verses, timestamp) {
    await this.ready;
    const keys = new Set(verses.map(v => `${v.book}:${v.chapter}:${v.verse}`));
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, SESSION_STORE], 'readwrite');
      tx.objectStore(SESSION_STORE).delete(timestamp);
      this.sessions = this.sessions.filter(se => se.timestamp !== timestamp);
      const req = tx.objectStore(STORE_NAME).index('timestamp').openCursor(IDBKeyRange.only(timestamp));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const r = cursor.value;
        if (keys.has(r.verseKey)) {
          cursor.delete();
          this._cacheRemove(r.verseKey, r.book, r.timestamp);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Get read count for a specific verse
  getVerseCount(book, chapter, verse) {
    const key = `${book}:${chapter}:${verse}`;
    return (this.cache[key] || []).length;
  }

  // Get total read count for a chapter
  getChapterCount(book, chapter) {
    let total = 0;
    const prefix = `${book}:${chapter}:`;
    for (const key of this._bookKeys(book)) {
      if (key.startsWith(prefix)) {
        total += this.cache[key].length;
      }
    }
    return total;
  }

  // Get unique verses read in a chapter
  getChapterVersesRead(book, chapter) {
    const versesRead = new Set();
    const prefix = `${book}:${chapter}:`;
    for (const key of this._bookKeys(book)) {
      if (key.startsWith(prefix)) {
        versesRead.add(parseInt(key.split(':')[2]));
      }
    }
    return versesRead;
  }

  // Get total unique verses read for a book
  getBookVersesRead(bookAbbr) {
    return this.byBook[bookAbbr] ? this.byBook[bookAbbr].size : 0;
  }

  // Get max read count across all verses (for heat map scaling)
  getMaxCount() {
    let max = 0;
    for (const key in this.cache) {
      max = Math.max(max, this.cache[key].length);
    }
    return max;
  }

  // Get max read count for verses in a specific testament
  getMaxCountByTestament(testament) {
    let max = 0;
    for (const b of BIBLE_DATA.books) {
      if (b.testament !== testament) continue;
      for (const key of this._bookKeys(b.abbr)) {
        max = Math.max(max, this.cache[key].length);
      }
    }
    return max;
  }

  // Get all verse read counts for a book as a flat array (chapter-ordered)
  getBookVerseCountsFlat(bookAbbr) {
    const book = BIBLE_DATA.getBook(bookAbbr);
    if (!book) return [];
    const counts = [];
    for (let ch = 0; ch < book.chapters.length; ch++) {
      for (let v = 1; v <= book.chapters[ch]; v++) {
        counts.push(this.getVerseCount(bookAbbr, ch + 1, v));
      }
    }
    return counts;
  }

  // Get book-level heat (average reads per verse)
  getBookHeat(bookAbbr) {
    const bookData = BIBLE_DATA.getBook(bookAbbr);
    if (!bookData) return 0;
    const totalVerses = bookData.chapters.reduce((a, b) => a + b, 0);
    let totalReads = 0;
    for (const key of this._bookKeys(bookAbbr)) {
      totalReads += this.cache[key].length;
    }
    return totalReads / totalVerses;
  }

  // Get all reading timestamps (for stats)
  getAllTimestamps() {
    const timestamps = [];
    for (const key in this.cache) {
      timestamps.push(...this.cache[key]);
    }
    return timestamps.sort((a, b) => a - b);
  }

  // Get all readings grouped by date
  getReadingsByDate() {
    const byDate = {};
    for (const key in this.cache) {
      for (const ts of this.cache[key]) {
        const date = localDateKey(ts);
        if (!byDate[date]) byDate[date] = 0;
        byDate[date]++;
      }
    }
    return byDate;
  }

  // Export all data as JSON
  async exportData() {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, SESSION_STORE], 'readonly');
      const readingsReq = tx.objectStore(STORE_NAME).getAll();
      const sessionsReq = tx.objectStore(SESSION_STORE).getAll();
      tx.oncomplete = () => {
        const data = readingsReq.result.map(r => ({
          verseKey: r.verseKey,
          book: r.book,
          chapter: r.chapter,
          verse: r.verse,
          timestamp: r.timestamp
        }));
        resolve(JSON.stringify({
          version: 2,
          exportDate: new Date().toISOString(),
          readings: data,
          sessions: sessionsReq.result
        }, null, 2));
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // Import data from JSON
  async importData(jsonString, mode = 'merge') {
    await this.ready;
    const data = JSON.parse(jsonString);
    if (!data.readings || !Array.isArray(data.readings)) {
      throw new Error('Invalid data format');
    }

    if (mode === 'replace') {
      // Clear existing data
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_NAME, SESSION_STORE], 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(SESSION_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // Insert imported records, skipping invalid ones and exact duplicates (same verse + timestamp)
    let added = 0, skipped = 0;
    const seen = new Set();
    for (const key in this.cache) {
      for (const ts of this.cache[key]) seen.add(`${key}@${ts}`);
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, SESSION_STORE], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // Sessions are keyed by timestamp, so re-importing just overwrites them
      const sessionStore = tx.objectStore(SESSION_STORE);
      for (const se of Array.isArray(data.sessions) ? data.sessions : []) {
        if (Number.isFinite(se.timestamp) && BIBLE_DATA.getBook(se.book) && Array.isArray(se.verses)) {
          sessionStore.put(se);
        }
      }
      for (const r of data.readings) {
        const book = BIBLE_DATA.getBook(r.book);
        const ch = Number(r.chapter), v = Number(r.verse), ts = Number(r.timestamp);
        const valid = book && Number.isInteger(ch) && ch >= 1 && ch <= book.chapters.length
          && Number.isInteger(v) && v >= 1 && v <= book.chapters[ch - 1] && Number.isFinite(ts);
        const verseKey = `${r.book}:${ch}:${v}`;
        if (!valid || seen.has(`${verseKey}@${ts}`)) { skipped++; continue; }
        seen.add(`${verseKey}@${ts}`);
        store.add({ verseKey, book: r.book, chapter: ch, verse: v, timestamp: ts });
        added++;
      }
      tx.oncomplete = () => {
        this._loadCache().then(() => resolve({ added, skipped }));
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // Get stats for dashboard
  getStats() {
    const timestamps = this.getAllTimestamps();
    const totalReadings = timestamps.length;

    // Unique verses
    const uniqueVerses = Object.keys(this.cache).length;
    const totalBibleVerses = BIBLE_DATA.getTotalBibleVerses();

    // By testament
    let otVerses = 0, ntVerses = 0, otTotal = 0, ntTotal = 0;
    for (const book of BIBLE_DATA.books) {
      const bookTotal = book.chapters.reduce((a, b) => a + b, 0);
      const bookRead = this.getBookVersesRead(book.abbr);
      if (book.testament === 'OT') {
        otTotal += bookTotal;
        otVerses += bookRead;
      } else {
        ntTotal += bookTotal;
        ntVerses += bookRead;
      }
    }

    // By category
    const categoryStats = {};
    for (const book of BIBLE_DATA.books) {
      if (!categoryStats[book.category]) {
        categoryStats[book.category] = { total: 0, read: 0 };
      }
      categoryStats[book.category].total += book.chapters.reduce((a, b) => a + b, 0);
      categoryStats[book.category].read += this.getBookVersesRead(book.abbr);
    }

    // Time of day distribution
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0); // 0=Sun
    const monthActivity = {};
    for (const ts of timestamps) {
      const d = new Date(ts);
      hourCounts[d.getHours()]++;
      dayCounts[d.getDay()]++;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthActivity[monthKey]) monthActivity[monthKey] = new Set();
      monthActivity[monthKey].add(d.getDate());
    }

    // Days per month
    const daysPerMonth = {};
    for (const [month, days] of Object.entries(monthActivity)) {
      daysPerMonth[month] = days.size;
    }

    // Streak calculation
    let currentStreak = 0, longestStreak = 0;
    if (timestamps.length > 0) {
      const readDates = new Set();
      for (const ts of timestamps) {
        readDates.add(localDateKey(ts));
      }
      const sortedDates = [...readDates].sort();
      let streak = 1;
      longestStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        if (dayDiff(sortedDates[i - 1], sortedDates[i]) === 1) {
          streak++;
          longestStreak = Math.max(longestStreak, streak);
        } else {
          streak = 1;
        }
      }
      // Check if current streak is active (includes today or yesterday)
      const now = new Date();
      const today = localDateKey(now);
      const yesterday = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      if (sortedDates.includes(today) || sortedDates.includes(yesterday)) {
        currentStreak = streak;
      }
    }

    const placeCounts = { home: 0, church: 0, personal: 0, family: 0 };
    for (const se of this.sessions) {
      if (se.place in placeCounts) placeCounts[se.place]++;
      if (se.setting in placeCounts) placeCounts[se.setting]++;
    }

    return {
      placeCounts,
      totalReadings,
      uniqueVerses,
      totalBibleVerses,
      percentComplete: ((uniqueVerses / totalBibleVerses) * 100).toFixed(1),
      otVerses, otTotal,
      ntVerses, ntTotal,
      categoryStats,
      hourCounts,
      dayCounts,
      daysPerMonth,
      currentStreak,
      longestStreak,
      firstReading: timestamps.length > 0 ? new Date(timestamps[0]).toLocaleDateString() : 'N/A',
      lastReading: timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toLocaleDateString() : 'N/A'
    };
  }
}

// Singleton
const storage = new BibleStorage();
if (typeof window !== 'undefined') window.storage = storage;
