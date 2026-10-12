-- 学生数据 schema
-- 4 个数据库：hsk-vocab.db, mistakes.db, fsrs.db, students.db
-- 都放在 ~/.zh-tutor/ 目录下

-- ============================================
-- students.db
-- ============================================

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT,
  hsk_level INTEGER NOT NULL DEFAULT 1,
  target_level INTEGER NOT NULL DEFAULT 6,
  native_lang TEXT DEFAULT 'en',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_minutes INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_active DATE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  tavus_conversation_id TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  transcript_path TEXT,
  summary TEXT,
  new_mistakes INTEGER DEFAULT 0,
  cards_reviewed INTEGER DEFAULT 0,
  scenario TEXT,  -- 'restaurant' | 'interview' | 'shopping' | ...
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- ============================================
-- mistakes.db
-- ============================================

CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'vocab' | 'grammar' | 'pronunciation'
  item TEXT NOT NULL,
  context TEXT,
  corrected_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mistakes_student
  ON mistakes(student_id, last_seen_at DESC);

-- ============================================
-- fsrs.db
-- ============================================

CREATE TABLE IF NOT EXISTS fsrs_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  card_id TEXT NOT NULL,  -- 词或语法点
  stability REAL,
  difficulty REAL,
  due_date TIMESTAMP NOT NULL,
  last_review TIMESTAMP,
  state TEXT DEFAULT 'new',  -- 'new' | 'learning' | 'review' | 'relearning'
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  UNIQUE(student_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_fsrs_due
  ON fsrs_cards(student_id, due_date ASC);

-- ============================================
-- hsk-vocab.db
-- ============================================

CREATE TABLE IF NOT EXISTS hsk_vocab (
  word TEXT PRIMARY KEY,
  pinyin TEXT NOT NULL,
  hsk_level INTEGER NOT NULL,  -- 1-9
  part_of_speech TEXT,
  meaning_en TEXT,
  meaning_zh TEXT,
  examples TEXT,  -- JSON array
  audio_url TEXT,
  frequency_rank INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hsk_level
  ON hsk_vocab(hsk_level);

CREATE INDEX IF NOT EXISTS idx_hsk_freq
  ON hsk_vocab(frequency_rank);
