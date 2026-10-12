// @ts-nocheck

/**
 * HSK 词库查询工具
 *
 * 4 个工具：
 * - hsk_lookup: 查单个词（按汉字或拼音）
 * - hsk_lookup_batch: 批量查
 * - hsk_random_words: 按等级随机抽词
 * - hsk_list_by_level: 列某等级所有词
 *
 * 数据来源：data/hsk*.json（300 / 500 / 1000 / 2000 / 3600 / 5400 / 11000 词）
 * 导入：npm run import-hsk data/hsk1.json
 *
 * v1.0 完成 - 符合 [docs/tasks.md] T-102 验收标准
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'
import path from 'node:path'

const db = new Database(path.join(process.env.HOME || '~', '.zh-tutor/hsk-vocab.db'))

// 预编译常用查询
const lookupStmt = db.prepare(`
  SELECT word, pinyin, hsk_level, part_of_speech, meaning_en, meaning_zh, examples
  FROM hsk_vocab
  WHERE word = ? OR pinyin = ?
  LIMIT 1
`)

const countStmt = db.prepare(`SELECT COUNT(*) as c, hsk_level FROM hsk_vocab GROUP BY hsk_level ORDER BY hsk_level`)

function parseRow(row: any) {
  if (!row) return null
  return {
    word: row.word,
    pinyin: row.pinyin,
    hsk_level: row.hsk_level,
    part_of_speech: row.part_of_speech,
    meaning_en: row.meaning_en,
    meaning_zh: row.meaning_zh,
    examples: row.examples ? JSON.parse(row.examples) : []
  }
}

function suggestSimilar(word: string): string[] {
  // 找前两个字相同的词
  if (word.length < 2) return []
  const prefix = word.slice(0, 2)
  return db.prepare(`
    SELECT word FROM hsk_vocab
    WHERE word LIKE ? LIMIT 5
  `).all(prefix + '%').map((r: any) => r.word)
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'hsk_lookup',
    description: '查 HSK 词汇（按汉字或拼音）。返回 pinyin / HSK 等级 / 词性 / 释义 / 例句。如果不在词表返回 found:false。',
    parameters: {
      word: { type: 'string', description: '要查的中文词或拼音（如"你好"或"ni hao"）' }
    },
    execute: async ({ word }) => {
      const row = lookupStmt.get(word, word) as any
      if (!row) {
        return { found: false, suggestions: suggestSimilar(word) }
      }
      return { found: true, ...parseRow(row) }
    }
  })

  pi.registerTool({
    name: 'hsk_lookup_batch',
    description: '批量查 HSK 词汇。最多一次 20 个。',
    parameters: {
      words: { type: 'array', items: { type: 'string' }, description: '要查的词列表' }
    },
    execute: async ({ words }) => {
      if (words.length > 20) return { error: 'max 20 words per call' }
      const results: any[] = []
      for (const w of words) {
        const row = lookupStmt.get(w, w) as any
        results.push({ query: w, found: !!row, ...(row ? parseRow(row) : { suggestions: suggestSimilar(w) }) })
      }
      return { count: results.length, results }
    }
  })

  pi.registerTool({
    name: 'hsk_random_words',
    description: '按 HSK 等级随机抽 N 个词。用于造句练习、复习。',
    parameters: {
      count: { type: 'number', description: '抽几个（1-20）' },
      hsk_level: { type: 'number', description: '限定 HSK 等级（1-9），不传则全等级', optional: true }
    },
    execute: async ({ count, hsk_level }) => {
      const n = Math.min(Math.max(count || 5, 1), 20)
      const stmt = hsk_level
        ? db.prepare(`SELECT * FROM hsk_vocab WHERE hsk_level = ? ORDER BY RANDOM() LIMIT ?`)
        : db.prepare(`SELECT * FROM hsk_vocab ORDER BY RANDOM() LIMIT ?`)
      const rows = hsk_level ? stmt.all(hsk_level, n) : stmt.all(n)
      return { count: rows.length, words: rows.map(parseRow) }
    }
  })

  pi.registerTool({
    name: 'hsk_list_by_level',
    description: '列某 HSK 等级所有词。',
    parameters: {
      hsk_level: { type: 'number', description: 'HSK 等级（1-9）' },
      limit: { type: 'number', description: '最多列几个（默认 50）', optional: true }
    },
    execute: async ({ hsk_level, limit }) => {
      const n = Math.min(limit || 50, 200)
      const rows = db.prepare(`
        SELECT word, pinyin, hsk_level, meaning_en
        FROM hsk_vocab WHERE hsk_level = ? ORDER BY frequency_rank LIMIT ?
      `).all(hsk_level, n)
      return { hsk_level, count: rows.length, words: rows }
    }
  })

  pi.registerTool({
    name: 'hsk_stats',
    description: '查 HSK 词库统计（每等级多少词）。',
    parameters: {},
    execute: async () => {
      const rows = countStmt.all() as any[]
      const total = rows.reduce((s, r) => s + r.c, 0)
      return { total, by_level: rows }
    }
  })
}
