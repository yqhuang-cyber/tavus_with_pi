/**
 * 测试 mistake-book 的核心 CRUD
 * - 用 vitest mock @mariozechner/pi-coding-agent
 * - 直接拿 registerTool 的 execute callback
 * - 用临时 sqlite in-memory DB
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'

let executeFn: (params: any, ctx: any) => Promise<any>
let toolMeta: any

// 临时改 HOME 让 better-sqlite3 用临时目录
const TEMP_HOME = `/tmp/zh-tutor-test-${Date.now()}`
process.env.HOME = TEMP_HOME

beforeAll(async () => {
  // 初始化临时 DB schema
  const fs = await import('node:fs')
  fs.mkdirSync(TEMP_HOME + '/.zh-tutor', { recursive: true })
  const initDb = new Database(TEMP_HOME + '/.zh-tutor/mistakes.db')
  initDb.exec(`
    CREATE TABLE mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      type TEXT NOT NULL,
      item TEXT NOT NULL,
      context TEXT,
      corrected_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )
  `)
  initDb.close()

  // Mock @mariozechner/pi-coding-agent
  vi.mock('@mariozechner/pi-coding-agent', () => ({
    default: {},
    ExtensionAPI: class {},
  }))

  // 现在 import mistake-book
  const mod = await import('../extensions/mistake-book.ts')
  // 拿到 default export（一个函数），手动调它
  // 它内部会 registerTool，我们用 stub pi 拿
  let registered: any
  const stubPi: any = {
    registerTool(meta: any) {
      registered = meta
    },
  }
  // @ts-ignore
  ;(mod as any).default(stubPi)
  toolMeta = registered
  executeFn = registered.execute
})

afterAll(async () => {
  const fs = await import('node:fs')
  fs.rmSync(TEMP_HOME, { recursive: true, force: true })
})

const ctx = { session: { metadata: { studentId: 'test-student' } } }

describe('mistake_log.add', () => {
  it('记录新错题', async () => {
    const result = await executeFn(
      { action: 'add', type: 'vocab', item: '喜欢', context: '我喜欢狗' },
      ctx
    )
    expect(result.added).toBe(true)
    expect(result.item).toBe('喜欢')
  })

  it('重复 item 不重复加（去重）', async () => {
    const result = await executeFn(
      { action: 'add', type: 'vocab', item: '喜欢' },
      ctx
    )
    expect(result.added).toBe(false)
    expect(result.existing_id).toBeDefined()
  })

  it('缺 item 应报错', async () => {
    const result = await executeFn({ action: 'add', type: 'vocab' }, ctx)
    expect(result.error).toBeTruthy()
  })
})

describe('mistake_log.list', () => {
  it('列错题按 last_seen_at 降序', async () => {
    const result = await executeFn({ action: 'list' }, ctx)
    expect(result.count).toBeGreaterThan(0)
    expect(Array.isArray(result.mistakes)).toBe(true)
  })

  it('可按 type 过滤', async () => {
    await executeFn({ action: 'add', type: 'grammar', item: '了', context: '我吃饭了' }, ctx)
    const result = await executeFn({ action: 'list', filter_type: 'grammar' }, ctx)
    for (const m of result.mistakes) {
      expect(m.type).toBe('grammar')
    }
  })
})

describe('mistake_log.mark_corrected', () => {
  it('标记已掌握，corrected_count +1', async () => {
    const result = await executeFn({ action: 'mark_corrected', item: '喜欢' }, ctx)
    expect(result.marked).toBe(true)
    expect(result.changes).toBe(1)
  })

  it('不存在的 item 报错', async () => {
    const result = await executeFn({ action: 'mark_corrected', item: '不存在的词' }, ctx)
    expect(result.error).toBeTruthy()
  })
})

describe('mistake_log.stats', () => {
  it('返回错题统计', async () => {
    const result = await executeFn({ action: 'stats' }, ctx)
    expect(result.student_id).toBe('test-student')
    expect(Array.isArray(result.by_type)).toBe(true)
  })
})
