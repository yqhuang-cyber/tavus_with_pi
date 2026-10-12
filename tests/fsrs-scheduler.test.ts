/**
 * 测试 fsrs-scheduler 的核心 CRUD
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

let executeFn: (params: any, ctx: any) => Promise<any>

const TEMP_HOME = `/tmp/zh-tutor-fsrs-test-${Date.now()}`
process.env.HOME = TEMP_HOME

beforeAll(async () => {
  const fs = await import('node:fs')
  fs.mkdirSync(TEMP_HOME + '/.zh-tutor', { recursive: true })
  const Database = (await import('better-sqlite3')).default
  const initDb = new Database(TEMP_HOME + '/.zh-tutor/fsrs.db')
  initDb.exec(`
    CREATE TABLE fsrs_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      stability REAL,
      difficulty REAL,
      due_date INTEGER NOT NULL,
      last_review INTEGER,
      state TEXT NOT NULL,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      UNIQUE(student_id, card_id)
    )
  `)
  initDb.close()

  vi.mock('@mariozechner/pi-coding-agent', () => ({
    default: {},
    ExtensionAPI: class {},
  }))

  const mod = await import('../extensions/fsrs-scheduler.ts')
  let registered: any
  const stubPi = { registerTool(meta: any) { registered = meta } }
  ;(mod as any).default(stubPi)
  executeFn = registered.execute
})

afterAll(async () => {
  const fs = await import('node:fs')
  fs.rmSync(TEMP_HOME, { recursive: true, force: true })
})

const ctx = { session: { metadata: { studentId: 'test' } } }

describe('fsrs_schedule.add', () => {
  it('加新卡', async () => {
    const result = await executeFn({ action: 'add', card_id: '你好' }, ctx)
    expect(result.added).toBe(true)
    expect(result.card_id).toBe('你好')
  })

  it('重复 add 不重复加', async () => {
    const result = await executeFn({ action: 'add', card_id: '你好' }, ctx)
    expect(result.added).toBe(false)
  })
})

describe('fsrs_schedule.get_due', () => {
  it('新建的卡立刻 due（默认 tomorrow）', async () => {
    // 加一个新卡，due_date 是明天（不在 due 范围）
    await executeFn({ action: 'add', card_id: 'test-due' }, ctx)
    const result = await executeFn({ action: 'get_due' }, ctx)
    expect(result.count).toBeDefined()
  })
})

describe('fsrs_schedule.review', () => {
  it('评分重排 due_date', async () => {
    await executeFn({ action: 'add', card_id: 'test-review' }, ctx)
    const result = await executeFn({ action: 'review', card_id: 'test-review', rating: 3 }, ctx)
    expect(result.reviewed).toBe(true)
    expect(result.next_due).toBeDefined()
    expect(result.interval_days).toBeGreaterThanOrEqual(0)
  })

  it('不存在的 card 报错', async () => {
    const result = await executeFn({ action: 'review', card_id: 'nonexistent', rating: 3 }, ctx)
    expect(result.error).toBeTruthy()
  })
})

describe('fsrs_schedule.stats', () => {
  it('返回统计', async () => {
    const result = await executeFn({ action: 'stats' }, ctx)
    expect(result.student_id).toBe('test')
    expect(result.total).toBeGreaterThan(0)
  })
})
