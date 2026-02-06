// IndexedDB-based storage for Bible reading data
const DB_NAME = 'bhible';
const DB_VERSION = 1;
const STORE_NAME = 'readings';

class BibleStorage {
  constructor() {
    this.db = null;
    // In-memory cache: { "Gen:1:1": [timestamp1, timestamp2, ...] }
    this.cache = {};
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
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        this.cache = {};
        for (const record of req.result) {
          if (!this.cache[record.verseKey]) {
            this.cache[record.verseKey] = [];
          }
          this.cache[record.verseKey].push(record.timestamp);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Mark verses as read. verses = [{book, chapter, verse}], timestamp = Date.now()
  async markRead(verses, timestamp = Date.now()) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const v of verses) {
        const verseKey = `${v.book}:${v.chapter}:${v.verse}`;
        const record = { verseKey, book: v.book, chapter: v.chapter, verse: v.verse, timestamp };
        store.add(record);
        if (!this.cache[verseKey]) this.cache[verseKey] = [];
        this.cache[verseKey].push(timestamp);
      }
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
    for (const key in this.cache) {
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
    for (const key in this.cache) {
      if (key.startsWith(prefix)) {
        versesRead.add(parseInt(key.split(':')[2]));
      }
    }
    return versesRead;
  }

  // Get total unique verses read for a book
  getBookVersesRead(bookAbbr) {
    const versesRead = new Set();
    const prefix = `${bookAbbr}:`;
    for (const key in this.cache) {
      if (key.startsWith(prefix)) {
        versesRead.add(key);
      }
    }
    return versesRead.size;
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
    const bookSet = new Set(
      BIBLE_DATA.books.filter(b => b.testament === testament).map(b => b.abbr)
    );
    let max = 0;
    for (const key in this.cache) {
      const bookAbbr = key.split(':')[0];
      if (bookSet.has(bookAbbr)) {
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
    const prefix = `${bookAbbr}:`;
    for (const key in this.cache) {
      if (key.startsWith(prefix)) {
        totalReads += this.cache[key].length;
      }
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
        const date = new Date(ts).toISOString().split('T')[0];
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
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const data = req.result.map(r => ({
          verseKey: r.verseKey,
          book: r.book,
          chapter: r.chapter,
          verse: r.verse,
          timestamp: r.timestamp
        }));
        resolve(JSON.stringify({ version: 1, exportDate: new Date().toISOString(), readings: data }, null, 2));
      };
      req.onerror = () => reject(req.error);
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
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // Insert imported records
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const r of data.readings) {
        store.add({
          verseKey: r.verseKey || `${r.book}:${r.chapter}:${r.verse}`,
          book: r.book,
          chapter: r.chapter,
          verse: r.verse,
          timestamp: r.timestamp
        });
      }
      tx.oncomplete = () => {
        this._loadCache().then(resolve);
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
        readDates.add(new Date(ts).toISOString().split('T')[0]);
      }
      const sortedDates = [...readDates].sort();
      let streak = 1;
      longestStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diff = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          streak++;
          longestStreak = Math.max(longestStreak, streak);
        } else {
          streak = 1;
        }
      }
      // Check if current streak is active (includes today or yesterday)
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (sortedDates.includes(today) || sortedDates.includes(yesterday)) {
        currentStreak = streak;
      }
    }

    return {
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
