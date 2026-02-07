// ============================================
// BHible - Internationalization (i18n)
// Supports: English (en), Korean (ko)
// ============================================

const I18N = {
  _lang: 'en',

  get lang() { return this._lang; },

  set lang(code) {
    this._lang = code;
    localStorage.setItem('bhible-lang', code);
    document.documentElement.setAttribute('lang', code);
  },

  init() {
    const saved = localStorage.getItem('bhible-lang');
    this.lang = saved || 'en';
  },

  t(key, params) {
    const str = (this.strings[this._lang] && this.strings[this._lang][key])
      || this.strings.en[key]
      || key;
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => params[k] !== undefined ? params[k] : `{${k}}`);
  },

  // Get localized book name
  bookName(abbr) {
    const map = this.bookNames[this._lang];
    return (map && map[abbr]) || BIBLE_DATA.getBook(abbr)?.name || abbr;
  },

  // Get localized book abbreviation (for block labels)
  bookAbbr(abbr) {
    const map = this.bookAbbrs[this._lang];
    return (map && map[abbr]) || abbr;
  },

  // Get localized category name
  categoryName(cat) {
    const map = this.categoryNames[this._lang];
    return (map && map[cat]) || cat;
  },

  // Day names
  dayNames() {
    return this.strings[this._lang]?.dayNames || this.strings.en.dayNames;
  },

  // ===== String Tables =====
  strings: {
    en: {
      appName: 'BHible',
      heatMap: 'Heat Map',
      dashboard: 'Dashboard',
      oldTestament: 'Old Testament',
      newTestament: 'New Testament',
      chapters: 'Chapters',
      verses: 'Verses',
      selectAll: 'Select All',
      clear: 'Clear',
      readNow: 'Read Now',
      markAsRead: 'Mark as Read',
      markNVersesAsRead: 'Mark {n} Verse{s} as Read',
      less: 'Less',
      more: 'More',
      exportData: 'Export Data',
      importData: 'Import Data',
      dataExported: 'Data exported',
      exportFailed: 'Export failed: {err}',
      importFailed: 'Import failed: {err}',
      importConfirm: 'Import {n} readings? This will merge with existing data.',
      versesLogged: '{n} verse{s} in {book} {ch} logged',
      chapterMarkedRead: '{book} {ch} marked as read',
      readNTimes: 'Read {n} time{s}',
      // Dashboard
      overview: 'Overview',
      complete: 'Complete',
      ofNVerses: 'of {n} verses',
      currentStreak: 'Current streak (days)',
      longestStreak: 'Longest streak (days)',
      testamentProgress: 'Testament Progress',
      categoryProgress: 'Category Progress',
      readingTimeOfDay: 'Reading Time of Day',
      dayOfWeek: 'Day of Week',
      daysActivePerMonth: 'Days Active per Month',
      days: 'days',
      milestones: 'Milestones',
      firstReading: 'First reading',
      lastReading: 'Last reading',
      totalVerseReads: 'Total verse-reads',
      uniqueVerses: 'Unique verses',
      noReadingsYet: 'No readings yet',
      noReadingsDesc: 'Start reading the Bible to see your stats here. Go to the Heat Map tab and select verses to log your reading.',
      nReadingsImported: '{n} readings imported',
      dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      // Settings
      settings: 'Settings',
      language: 'Language',
      bibleReader: 'Bible Reader',
      theme: 'Theme',
      dark: 'Dark',
      light: 'Light',
      system: 'System',
      data: 'Data',
      settingsDesc: 'Choose your language and preferred Bible reader app.',
    },
    ko: {
      appName: 'BHible',
      heatMap: '히트맵',
      dashboard: '대시보드',
      oldTestament: '구약',
      newTestament: '신약',
      chapters: '장',
      verses: '절',
      selectAll: '전체 선택',
      clear: '선택 해제',
      readNow: '지금 읽기',
      markAsRead: '읽음 표시',
      markNVersesAsRead: '{n}절 읽음 표시',
      less: '적음',
      more: '많음',
      exportData: '데이터 내보내기',
      importData: '데이터 가져오기',
      dataExported: '데이터를 내보냈습니다',
      exportFailed: '내보내기 실패: {err}',
      importFailed: '가져오기 실패: {err}',
      importConfirm: '{n}개의 읽기 기록을 가져올까요? 기존 데이터와 병합됩니다.',
      versesLogged: '{book} {ch}장 {n}절 기록됨',
      chapterMarkedRead: '{book} {ch}장 읽음 표시 완료',
      readNTimes: '{n}회 읽음',
      // Dashboard
      overview: '개요',
      complete: '완료',
      ofNVerses: '전체 {n}절 중',
      currentStreak: '현재 연속 (일)',
      longestStreak: '최장 연속 (일)',
      testamentProgress: '구약/신약 진행도',
      categoryProgress: '분류별 진행도',
      readingTimeOfDay: '읽기 시간대',
      dayOfWeek: '요일별 읽기',
      daysActivePerMonth: '월별 활동 일수',
      days: '일',
      milestones: '기록',
      firstReading: '첫 읽기',
      lastReading: '마지막 읽기',
      totalVerseReads: '총 절 읽기 수',
      uniqueVerses: '읽은 절 수',
      noReadingsYet: '아직 읽기 기록이 없습니다',
      noReadingsDesc: '성경을 읽기 시작하면 여기에 통계가 표시됩니다. 히트맵 탭에서 절을 선택하여 읽기를 기록하세요.',
      nReadingsImported: '{n}개의 읽기 기록을 가져왔습니다',
      dayNames: ['일', '월', '화', '수', '목', '금', '토'],
      // Settings
      settings: '설정',
      language: '언어',
      bibleReader: '성경 리더',
      theme: '테마',
      dark: '다크',
      light: '라이트',
      system: '시스템',
      data: '데이터',
      settingsDesc: '언어와 성경 리더 앱을 선택하세요.',
    }
  },

  // ===== Korean Book Names (개역개정) =====
  bookNames: {
    en: {}, // Uses default from BIBLE_DATA
    ko: {
      Gen: '창세기', Exod: '출애굽기', Lev: '레위기', Num: '민수기', Deut: '신명기',
      Josh: '여호수아', Judg: '사사기', Ruth: '룻기', '1Sam': '사무엘상', '2Sam': '사무엘하',
      '1Kgs': '열왕기상', '2Kgs': '열왕기하', '1Chr': '역대상', '2Chr': '역대하',
      Ezra: '에스라', Neh: '느헤미야', Esth: '에스더',
      Job: '욥기', Ps: '시편', Prov: '잠언', Eccl: '전도서', Song: '아가',
      Isa: '이사야', Jer: '예레미야', Lam: '예레미야애가', Ezek: '에스겔', Dan: '다니엘',
      Hos: '호세아', Joel: '요엘', Amos: '아모스', Obad: '오바댜', Jonah: '요나',
      Mic: '미가', Nah: '나훔', Hab: '하박국', Zeph: '스바냐', Hag: '학개',
      Zech: '스가랴', Mal: '말라기',
      Matt: '마태복음', Mark: '마가복음', Luke: '누가복음', John: '요한복음',
      Acts: '사도행전',
      Rom: '로마서', '1Cor': '고린도전서', '2Cor': '고린도후서', Gal: '갈라디아서',
      Eph: '에베소서', Phil: '빌립보서', Col: '골로새서',
      '1Thess': '데살로니가전서', '2Thess': '데살로니가후서',
      '1Tim': '디모데전서', '2Tim': '디모데후서', Titus: '디도서', Phlm: '빌레몬서',
      Heb: '히브리서', Jas: '야고보서', '1Pet': '베드로전서', '2Pet': '베드로후서',
      '1John': '요한일서', '2John': '요한이서', '3John': '요한삼서', Jude: '유다서',
      Rev: '요한계시록'
    }
  },

  // ===== Korean Book Abbreviations =====
  bookAbbrs: {
    en: {}, // Uses default from BIBLE_DATA
    ko: {
      Gen: '창', Exod: '출', Lev: '레', Num: '민', Deut: '신',
      Josh: '수', Judg: '삿', Ruth: '룻', '1Sam': '삼상', '2Sam': '삼하',
      '1Kgs': '왕상', '2Kgs': '왕하', '1Chr': '대상', '2Chr': '대하',
      Ezra: '스', Neh: '느', Esth: '에',
      Job: '욥', Ps: '시', Prov: '잠', Eccl: '전', Song: '아',
      Isa: '사', Jer: '렘', Lam: '애', Ezek: '겔', Dan: '단',
      Hos: '호', Joel: '욜', Amos: '암', Obad: '옵', Jonah: '욘',
      Mic: '미', Nah: '나', Hab: '합', Zeph: '습', Hag: '학',
      Zech: '슥', Mal: '말',
      Matt: '마', Mark: '막', Luke: '눅', John: '요',
      Acts: '행',
      Rom: '롬', '1Cor': '고전', '2Cor': '고후', Gal: '갈',
      Eph: '엡', Phil: '빌', Col: '골',
      '1Thess': '살전', '2Thess': '살후',
      '1Tim': '딤전', '2Tim': '딤후', Titus: '딛', Phlm: '몬',
      Heb: '히', Jas: '약', '1Pet': '벧전', '2Pet': '벧후',
      '1John': '요일', '2John': '요이', '3John': '요삼', Jude: '유',
      Rev: '계'
    }
  },

  // ===== Korean Category Names =====
  categoryNames: {
    en: {}, // Uses default keys
    ko: {
      'Pentateuch': '모세오경',
      'Historical': '역사서',
      'Wisdom': '시가서',
      'Major Prophets': '대선지서',
      'Minor Prophets': '소선지서',
      'Gospels': '복음서',
      'Acts': '사도행전',
      'Pauline Epistles': '바울서신',
      'General Epistles': '공동서신',
      'Apocalyptic': '계시록'
    }
  }
};

if (typeof window !== 'undefined') window.I18N = I18N;
