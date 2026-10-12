/**
 * 测试 hsk-vocab 工具
 * - hsk_lookup: 查词
 * - hsk_random_words: 抽词
 * - hsk_list_by_level: 列词
 * - hsk_stats: 统计
 *
 * 需要先在 TEMP_HOME/.zh-tutor/hsk-vocab.db 写好测试数据
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'

let executeFns: Record<string, (params: any) => Promise<any>> = {}

const TEMP_HOME = `/tmp/zh-tutor-hsk-test-${Date.now()}`
process.env.HOME = TEMP_HOME

beforeAll(async () => {
  const fs = await import('node:fs')
  fs.mkdirSync(TEMP_HOME + '/.zh-tutor', { recursive: true })
  const db = new Database(TEMP_HOME + '/.zh-tutor/hsk-vocab.db')
  db.exec(`
    CREATE TABLE hsk_vocab (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      pinyin TEXT NOT NULL,
      hsk_level INTEGER NOT NULL,
      part_of_speech TEXT,
      meaning_en TEXT,
      meaning_zh TEXT,
      examples TEXT,
      frequency_rank INTEGER
    )
  `)
  // 灌入测试数据
  const insert = db.prepare(`
    INSERT INTO hsk_vocab (word, pinyin, hsk_level, part_of_speech, meaning_en, meaning_zh, examples, frequency_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run('你好', 'nǐ hǎo', 1, 'phrase', 'hello', '你好', '[]', 1)
  insert.run('喜欢', 'xǐ huan', 1, 'v', 'to like', '喜欢', '[]', 2)
  insert.run('中国', 'Zhōngguó', 1, 'n', 'China', '中国', '[]', 3)
  insert.run('跑步', 'pǎobù', 2, 'v', 'to run', '跑步', '[]', 100)
  insert.run('环境', 'huánjìng', 3, 'n', 'environment', '环境', '[]', 500)
  db.close()

  vi.mock('@mariozechner/pi-coding-agent', () => ({
    default: {},
    ExtensionAPI: class {},
  }))

  const mod = await import('../extensions/hsk-vocab.ts')
  const stubPi = {
    registerTool(meta: any) {
      executeFns[meta.name] = meta.execute
    },
  }
  ;(mod as any).default(stubPi)
})

afterAll(async () => {
  const fs = await import('node:fs')
  fs.rmSync(TEMP_HOME, { recursive: true, force: true })
})

describe('hsk_lookup', () => {
  it('查存在的词', async () => {
    const r = await executeFns.hsk_lookup({ word: '你好' })
    expect(r.found).toBe(true)
    expect(r.pinyin).toBe('nǐ hǎo')
    expect(r.meaning_en).toBe('hello')
  })

  it('按拼音也能查', async () => {
    const r = await executeFns.hsk_lookup({ word: 'nǐ hǎo' })
    expect(r.found).toBe(true)
  })

  it('查不存在的词', async () => {
    const r = await executeFns.hsk_lookup({ word: '不存在的词xyz' })
    expect(r.found).toBe(false)
  })
})

describe('hsk_random_words', () => {
  it('抽 HSK 1 等级的词', async () => {
    const r = await executeFns.hsk_random_words({ count: 2, hsk_level: 1 })
    expect(r.count).toBe(2)
    for (const w of r.words) {
      expect(w.hsk_level).toBe(1)
    }
  })

  it('count 超出范围时 clamp', async () => {
    const r = await executeFns.hsk_random_words({ count: 100, hsk_level: 1 })
    expect(r.count).toBeLessThanOrEqual(20)
  })
})

describe('hsk_list_by_level', () => {
  it('列 HSK 1', async () => {
    const r = await executeFns.hsk_list_by_level({ hsk_level: 1 })
    expect(r.hsk_level).toBe(1)
    expect(r.count).toBe(3)
  })

  it('列 HSK 3', async () => {
    const r = await executeFns.hsk_list_by_level({ hsk_level: 3 })
    expect(r.count).toBe(1)
  })
})

describe('hsk_stats', () => {
  it('返回各等级统计', async () => {
    const r = await executeFns.hsk_stats({})
    expect(r.total).toBe(5)
    expect(r.by_level.length).toBeGreaterThan(0)
  })
})
