// ============================================
// BHible - Offline Bible text
// data/text/<translation>/<Book>.json = [[verse, ...] per chapter], built by tools/build_text.py.
// The service worker caches these in TEXT_CACHE (shared name, see sw.js), so any book
// read once works offline; download() fetches a whole translation up front.
// ============================================

const TEXT_CACHE = 'bhible-text-v1';

const BibleText = {
  translations: {
    kjv: { name: 'KJV', lang: 'en' },
    krv: { name: '개역한글', lang: 'ko' }
  },

  _books: {}, // "kjv/Gen" -> Promise<chapters>

  url(trans, abbr) {
    return `data/text/${trans}/${abbr}.json`;
  },

  load(trans, abbr) {
    const key = `${trans}/${abbr}`;
    if (!this._books[key]) {
      this._books[key] = fetch(this.url(trans, abbr))
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch(err => {
          delete this._books[key]; // allow a retry once back online
          throw err;
        });
    }
    return this._books[key];
  },

  async chapter(trans, abbr, chapter) {
    return (await this.load(trans, abbr))[chapter - 1];
  },

  // How many of the 66 books of this translation are in the offline cache
  async downloadedCount(trans) {
    if (!('caches' in window)) return 0;
    const cache = await caches.open(TEXT_CACHE);
    const keys = await cache.keys();
    return keys.filter(req => req.url.includes(`/data/text/${trans}/`)).length;
  },

  async download(trans, onProgress) {
    const cache = await caches.open(TEXT_CACHE);
    const queue = BIBLE_DATA.books.map(b => this.url(trans, b.abbr));
    const total = queue.length;
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const url = queue.shift();
        if (!(await cache.match(url))) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await cache.put(url, res);
        }
        onProgress(++done, total);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }
};

if (typeof window !== 'undefined') window.BibleText = BibleText;
