-- 学生数据 schema
-- 4 个数据库：hsk-vocab.db, mistakes.db, fsrs.db, students.db
-- 都放在 ~/.zh-tutor/ 目录下

-- ============================================
-- students.db
-- 4 个画像维度 + sessions
-- ============================================

-- 1. 个人画像 (STUDENT_PROFILE)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT,
  age INTEGER,                              -- 用于教学时长分级
  hsk_level INTEGER NOT NULL DEFAULT 1,
  target_hsk INTEGER NOT NULL DEFAULT 6,
  native_lang TEXT DEFAULT 'en',
  -- 个人画像（自由文本 + 结构化）
  interests TEXT,                            -- JSON array: ["skiing", "dogs", "cooking"]
  family TEXT,                              -- JSON: {"siblings": "older sister"}
  occupation TEXT,                          -- "designer", "student", etc.
  location TEXT,                            -- "Singapore", "San Francisco"
  privacy_level TEXT DEFAULT 'standard',   -- 'strict' | 'standard' | 'open'
  -- 基础统计
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_minutes INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_active DATE
);

-- 2. 学习画像 (LEARNING_PROFILE)
-- 决定"教什么"和"怎么教"
CREATE TABLE IF NOT EXISTS learning_profiles (
  student_id TEXT PRIMARY KEY,
  -- 掌握情况
  vocab_mastered TEXT,                      -- JSON array: ["你好", "谢谢"]
  vocab_weak TEXT,                          -- JSON array: ["量词 个vs份"]
  grammar_mastered TEXT,                    -- JSON array: ["是...的", "把字句"]
  grammar_weak TEXT,                        -- JSON array: ["想 vs 喜欢"]
  -- 发音问题
  pronunciation_issues TEXT,                -- JSON array: ["zh/ch/sh confusion"]
  -- 学习目标
  active_learning_goals TEXT,               -- JSON: [{type, item, priority}]
  -- 学习速度
  learning_speed TEXT DEFAULT 'normal',    -- 'slow' | 'normal' | 'fast'
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 3. 近期学习记录 (LEARNING_HISTORY)
-- 跨会话的连续性
CREATE TABLE IF NOT EXISTS learning_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  session_id TEXT,
  date DATE NOT NULL,
  duration_min INTEGER,
  topic TEXT,                               -- "点餐", "问路"
  new_words TEXT,                           -- JSON array
  new_grammar TEXT,                         -- JSON array
  mistakes_count INTEGER DEFAULT 0,
  target_sentences_used INTEGER DEFAULT 0,  -- 目标学习句使用次数
  notes TEXT,                               -- 任意备注
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 进行中的话题（"上次你说周末想去滑雪..."）
CREATE TABLE IF NOT EXISTS ongoing_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  topic TEXT NOT NULL,                       -- "即将到来的滑雪旅行"
  context TEXT,                              -- JSON: 上下文
  last_mentioned_at TIMESTAMP,
  resolved BOOLEAN DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 4. 本轮会话上下文 (SESSION_CONTEXT)
-- 每轮对话的实时状态
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  tavus_conversation_id TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  current_topic TEXT,
  current_difficulty TEXT,                 -- 'HSK 1' | 'HSK 3' | ...
  user_mood TEXT,                           -- 推断自 Tavus Raven: 'happy' | 'tired' | 'confused'
  max_call_duration INTEGER,                -- 秒
  transcript_path TEXT,
  summary TEXT,
  new_mistakes INTEGER DEFAULT 0,
  cards_reviewed INTEGER DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- ============================================
-- mistakes.db
-- ============================================

CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  type TEXT NOT NULL,                       -- 'vocab' | 'grammar' | 'pronunciation'
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
  card_id TEXT NOT NULL,                    -- 词或语法点
  stability REAL,
  difficulty REAL,
  due_date TIMESTAMP NOT NULL,
  last_review TIMESTAMP,
  state TEXT DEFAULT 'new',                 -- 'new' | 'learning' | 'review' | 'relearning'
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
  hsk_level INTEGER NOT NULL,               -- 1-9
  part_of_speech TEXT,
  meaning_en TEXT,
  meaning_zh TEXT,
  examples TEXT,                            -- JSON array
  audio_url TEXT,
  frequency_rank INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hsk_level
  ON hsk_vocab(hsk_level);

CREATE INDEX IF NOT EXISTS idx_hsk_freq
  ON hsk_vocab(frequency_rank);
