/**
 * 初始化数据库 schema
 *
 * 用法：
 *   npm run init-db
 *
 * 创建 ~/.zh-tutor/ 目录和 4 个 SQLite 数据库，schema 匹配最新版本。
 */

import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const DATA_DIR = join(HOME, '.zh-tutor')

mkdirSync(DATA_DIR, { recursive: true })

console.log(`📁 初始化目录：${DATA_DIR}`)

// students.db - 个人画像 + 学习画像 + 历史 + 会话
const studentsDb = join(DATA_DIR, 'students.db')
if (existsSync(studentsDb)) {
  console.log(`⏭️  跳过 students.db（已存在）`)
} else {
  console.log(`🔨 创建 students.db`)
  new Database(studentsDb).exec(`
    -- 1. 个人画像 (STUDENT_PROFILE)
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT,
      age INTEGER,
      hsk_level INTEGER NOT NULL DEFAULT 1,
      target_hsk INTEGER NOT NULL DEFAULT 6,
      native_lang TEXT DEFAULT 'en',
      interests TEXT,
      family TEXT,
      occupation TEXT,
      location TEXT,
      privacy_level TEXT DEFAULT 'standard',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      total_minutes INTEGER DEFAULT 0,
      streak_days INTEGER DEFAULT 0,
      last_active DATE
    );

    -- 2. 学习画像 (LEARNING_PROFILE)
    CREATE TABLE IF NOT EXISTS learning_profiles (
      student_id TEXT PRIMARY KEY,
      vocab_mastered TEXT,
      vocab_weak TEXT,
      grammar_mastered TEXT,
      grammar_weak TEXT,
      pronunciation_issues TEXT,
      active_learning_goals TEXT,
      learning_speed TEXT DEFAULT 'normal',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- 3. 近期学习记录 (LEARNING_HISTORY)
    CREATE TABLE IF NOT EXISTS learning_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      session_id TEXT,
      date DATE NOT NULL,
      duration_min INTEGER,
      topic TEXT,
      new_words TEXT,
      new_grammar TEXT,
      mistakes_count INTEGER DEFAULT 0,
      target_sentences_used INTEGER DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE INDEX IF NOT EXISTS idx_history_student_date
      ON learning_history(student_id, date DESC);

    -- 进行中的话题
    CREATE TABLE IF NOT EXISTS ongoing_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      context TEXT,
      last_mentioned_at TIMESTAMP,
      resolved BOOLEAN DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- 4. 会话上下文 (SESSION_CONTEXT)
    -- T-206: 加 last_raven_signals (JSON) 和 last_raven_at 字段存 Raven 多模态感知
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      tavus_conversation_id TEXT,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      current_topic TEXT,
      current_difficulty TEXT,
      user_mood TEXT,
      max_call_duration INTEGER,
      transcript_path TEXT,
      summary TEXT,
      new_mistakes INTEGER DEFAULT 0,
      cards_reviewed INTEGER DEFAULT 0,
      last_raven_signals TEXT,
      last_raven_at TIMESTAMP
    );
  `).close()
}

// mistakes.db
const mistakesDb = join(DATA_DIR, 'mistakes.db')
if (existsSync(mistakesDb)) {
  console.log(`⏭️  跳过 mistakes.db（已存在）`)
} else {
  console.log(`🔨 创建 mistakes.db`)
  new Database(mistakesDb).exec(`
    CREATE TABLE IF NOT EXISTS mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      type TEXT NOT NULL,
      item TEXT NOT NULL,
      context TEXT,
      corrected_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mistakes_student
      ON mistakes(student_id, last_seen_at DESC);
  `).close()
}

// fsrs.db
const fsrsDb = join(DATA_DIR, 'fsrs.db')
if (existsSync(fsrsDb)) {
  console.log(`⏭️  跳过 fsrs.db（已存在）`)
} else {
  console.log(`🔨 创建 fsrs.db`)
  new Database(fsrsDb).exec(`
    CREATE TABLE IF NOT EXISTS fsrs_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      stability REAL,
      difficulty REAL,
      due_date TIMESTAMP NOT NULL,
      last_review TIMESTAMP,
      state TEXT DEFAULT 'new',
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      UNIQUE(student_id, card_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fsrs_due
      ON fsrs_cards(student_id, due_date ASC);
  `).close()
}

// hsk-vocab.db
const hskDb = join(DATA_DIR, 'hsk-vocab.db')
if (existsSync(hskDb)) {
  console.log(`⏭️  跳过 hsk-vocab.db（已存在）`)
} else {
  console.log(`🔨 创建 hsk-vocab.db`)
  new Database(hskDb).exec(`
    CREATE TABLE IF NOT EXISTS hsk_vocab (
      word TEXT PRIMARY KEY,
      pinyin TEXT NOT NULL,
      hsk_level INTEGER NOT NULL,
      part_of_speech TEXT,
      meaning_en TEXT,
      meaning_zh TEXT,
      examples TEXT,
      audio_url TEXT,
      frequency_rank INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hsk_level ON hsk_vocab(hsk_level);
    CREATE INDEX IF NOT EXISTS idx_hsk_freq ON hsk_vocab(frequency_rank);
  `).close()
}

console.log(`\n✅ 4 个数据库初始化完成`)
console.log(`\n下一步：`)
console.log(`  1. 导入 HSK 1 词表：npm run import-hsk data/hsk1.json`)
console.log(`  2. 复制 system prompt：cp system/SYSTEM.md ~/.pi/agent/SYSTEM.md`)
console.log(`  3. 配置 .pi/settings.json 加载本地扩展`)
console.log(`  4. 启动 Pi：pi`)
