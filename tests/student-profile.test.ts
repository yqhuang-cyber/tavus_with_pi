/**
 * 测试 student-profile 工具
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

let executeFn: (params: any, ctx: any) => Promise<any>
let prependedContext = ''
let sessionStartFn: any

const TEMP_HOME = `/tmp/zh-tutor-profile-test-${Date.now()}`
process.env.HOME = TEMP_HOME

beforeAll(async () => {
  const fs = await import('node:fs')
  fs.mkdirSync(TEMP_HOME + '/.zh-tutor', { recursive: true })
  const Database = (await import('better-sqlite3')).default
  const db = new Database(TEMP_HOME + '/.zh-tutor/students.db')
  db.exec(`
    CREATE TABLE students (
      id TEXT PRIMARY KEY,
      hsk_level INTEGER DEFAULT 1,
      target_hsk INTEGER DEFAULT 6,
      name TEXT,
      age INTEGER,
      interests TEXT DEFAULT '[]',
      family TEXT,
      occupation TEXT,
      location TEXT,
      privacy_level TEXT DEFAULT 'standard'
    );
    CREATE TABLE learning_profiles (
      student_id TEXT PRIMARY KEY,
      vocab_mastered TEXT DEFAULT '[]',
      vocab_weak TEXT DEFAULT '[]',
      grammar_mastered TEXT DEFAULT '[]',
      grammar_weak TEXT DEFAULT '[]',
      pronunciation_issues TEXT DEFAULT '[]',
      active_learning_goals TEXT DEFAULT '[]',
      learning_speed TEXT DEFAULT 'normal',
      updated_at TEXT
    );
    CREATE TABLE learning_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT,
      date TEXT,
      duration_min INTEGER,
      topic TEXT,
      new_words TEXT,
      new_grammar TEXT,
      mistakes_count INTEGER
    );
    CREATE TABLE ongoing_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT,
      topic TEXT,
      context TEXT,
      last_mentioned_at TEXT,
      resolved INTEGER DEFAULT 0
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      tavus_conversation_id TEXT,
      current_topic TEXT,
      current_difficulty TEXT,
      user_mood TEXT,
      started_at TEXT
    );
  `)
  db.close()

  vi.mock('@mariozechner/pi-coding-agent', () => ({
    default: {},
    ExtensionAPI: class {},
  }))

  const mod = await import('../extensions/student-profile.ts')
  let registered: any
  const stubPi = {
    registerTool(meta: any) { registered = meta },
    on(event: string, fn: any) {
      if (event === 'session_start') {
        sessionStartFn = fn
      }
    },
  }
  ;(mod as any).default(stubPi)
  executeFn = registered.execute

  // 先 add 一个学生让 session_start 不会 return {}
  await executeFn({
    action: 'update_personal',
    name: '小明',
    age: 20,
    hsk_level: 3,
    target_hsk: 5,
    interests: ['狗', '滑雪'],
  }, { session: { metadata: { studentId: 'test-stu' } } })

  // 触发 session_start
  const result = await sessionStartFn({ session: { metadata: { studentId: 'test-stu' } } })
  prependedContext = result?.prependContext || ''
})

afterAll(async () => {
  const fs = await import('node:fs')
  fs.rmSync(TEMP_HOME, { recursive: true, force: true })
})

const ctx = { session: { metadata: { studentId: 'test-stu' } } }

describe('student_profile.get_personal', () => {
  it('应返回已存在学生', async () => {
    const r = await executeFn({ action: 'get_personal' }, ctx)
    expect(r.found).toBeUndefined()  // 存在则直接返回 student，不带 found 字段
    expect(r.name).toBe('小明')
  })
})

describe('student_profile.update_personal', () => {
  it('新建学生', async () => {
    const r = await executeFn({
      action: 'update_personal',
      name: '小明',
      age: 20,
      hsk_level: 3,
      target_hsk: 5,
      interests: ['狗', '滑雪', '吉他'],
      occupation: '设计师',
      location: '北京',
    }, ctx)
    expect(r.updated).toBe(true)
  })

  it('更新已有学生', async () => {
    const r = await executeFn({
      action: 'update_personal',
      age: 21,
    }, ctx)
    expect(r.updated).toBe(true)
  })

  it('strict 模式隐藏 location/occupation/family', async () => {
    await executeFn({ action: 'update_personal', privacy_level: 'strict' }, ctx)
    const r = await executeFn({ action: 'get_personal' }, ctx)
    expect(r.location).toBeUndefined()
    expect(r.occupation).toBeUndefined()
    expect(r._privacy).toBeTruthy()
  })
})

describe('student_profile.update_learning', () => {
  it('设置学习画像', async () => {
    const r = await executeFn({
      action: 'update_learning',
      vocab_mastered: ['你好', '谢谢'],
      vocab_weak: ['跑步'],
      pronunciation_issues: ['l_n', 'tone3'],
      learning_speed: 'fast',
    }, ctx)
    expect(r.updated).toBe(true)
  })

  it('读学习画像', async () => {
    const r = await executeFn({ action: 'get_learning' }, ctx)
    expect(r.vocab_mastered).toContain('你好')
    expect(r.vocab_weak).toContain('跑步')
    expect(r.pronunciation_issues).toContain('l_n')
  })
})

describe('student_profile.get_full', () => {
  it('一次拿 4 画像', async () => {
    const r = await executeFn({ action: 'get_full' }, ctx)
    expect(r.personal).toBeDefined()
    expect(r.learning).toBeDefined()
    expect(Array.isArray(r.history)).toBe(true)
    expect(Array.isArray(r.ongoing_topics)).toBe(true)
  })
})

describe('student_profile.add_history', () => {
  it('加一条学习记录', async () => {
    const r = await executeFn({
      action: 'add_history',
      topic: '点餐',
      duration_min: 8,
      new_words: ['点', '买单'],
      mistakes_count: 2,
    }, ctx)
    expect(r.added).toBe(true)
  })
})

describe('session_start 钩子', () => {
  it('注入 4 画像到 context', () => {
    expect(prependedContext).toBeTruthy()
    expect(prependedContext).toContain('个人画像')
    expect(prependedContext).toContain('学习画像')
    expect(prependedContext).toContain('近期学习记录')
  })
})
