/**
 * HSK 词库查询工具
 *
 * 提供 3 个工具：
 * - hsk_lookup: 查单个词
 * - hsk_lookup_batch: 批量查
 * - hsk_random_words: 按等级随机抽词
 *
 * 状态：🟡 TODO — 等待 Pi Coding Agent API 稳定后定稿
 *
 * 完整实现参考：docs/pi-extensions-guide.md 第 5.1 节
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'
import path from 'node:path'

const db = new Database(path.join(process.env.HOME || '~', '.zh-tutor/hsk-vocab.db'))

export default function (pi: ExtensionAPI) {
  // TODO: 完整实现见 docs/pi-extensions-guide.md
  // 这里先放最简版

  pi.registerTool({
    name: 'hsk_lookup',
    description: '查 HSK 词汇（pinyin/释义/HSK 等级/例句）。',
    parameters: {
      word: { type: 'string', description: '要查的中文词或拼音' }
    },
    execute: async ({ word }) => {
      const stmt = db.prepare(`
        SELECT word, pinyin, hsk_level, part_of_speech, meaning_en, examples
        FROM hsk_vocab
        WHERE word = ? OR pinyin = ?
        LIMIT 1
      `)
      const row: any = stmt.get(word, word)
      if (!row) return { found: false }
      return { found: true, ...row, examples: JSON.parse(row.examples) }
    }
  })
}
