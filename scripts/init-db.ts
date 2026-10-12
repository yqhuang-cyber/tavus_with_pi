/**
 * 初始化数据库 schema
 *
 * 用法：
 *   npm run init-db
 *
 * 创建 ~/.zh-tutor/ 目录和 4 个 SQLite 数据库。
 */

import Database from 'better-sqlite3'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const DATA_DIR = join(HOME, '.zh-tutor')

mkdirSync(DATA_DIR, { recursive: true })

const SCHEMA_PATH = join(DATA_DIR, '..', '..', 'workspace', 'tavus_with_pi', 'data', 'student-schema.sql')
// 注：实际部署时 schema 文件应该在项目里

const dbs = [
  { name: 'students', path: join(DATA_DIR, 'students.db') },
  { name: 'mistakes', path: join(DATA_DIR, 'mistakes.db') },
  { name: 'fsrs', path: join(DATA_DIR, 'fsrs.db') },
  { name: 'hsk-vocab', path: join(DATA_DIR, 'hsk-vocab.db') }
]

const SCHEMA = `
  -- students.db
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
    scenario TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id)
  );

  -- mistakes.db
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

  -- fsrs.db
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

  -- hsk-vocab.db
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
`

console.log(`📁 初始化目录：${DATA_DIR}`)

for (const db of dbs) {
  if (existsSync(db.path)) {
    console.log(`⏭️  跳过 ${db.name}（已存在）：${db.path}`)
    continue
  }

  console.log(`🔨 创建 ${db.name}：${db.path}`)
  const conn = new Database(db.path)

  // 每个 db 只执行相关的部分
  if (db.name === 'students') {
    conn.exec(`
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
        scenario TEXT
      );
    `)
  } else if (db.name === 'mistakes') {
    conn.exec(`
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
    `)
  } else if (db.name === 'fsrs') {
    conn.exec(`
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
    `)
  } else if (db.name === 'hsk-vocab') {
    conn.exec(`
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
    `)
  }

  conn.close()
}

console.log(`\n✅ 4 个数据库初始化完成`)
console.log(`\n下一步：`)
console.log(`  1. 导入 HSK 1 词表：npm run import-hsk`)
console.log(`  2. 启动 Pi：pi`)
console.log(`  3. 配置 .pi/settings.json 加载本地扩展`)
