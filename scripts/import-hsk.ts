/**
 * 导入 HSK 词表到 hsk-vocab.db
 *
 * 用法：
 *   tsx scripts/import-hsk.ts data/hsk1.json
 *
 * JSON 格式见 data/hsk-vocab-schema.md
 */

import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const DB_PATH = join(HOME, '.zh-tutor/hsk-vocab.db')

async function main() {
  const inputFile = process.argv[2]
  if (!inputFile) {
    console.error('用法：tsx scripts/import-hsk.ts <json-file>')
    process.exit(1)
  }

  console.log(`📖 读取 ${inputFile}...`)
  const data = JSON.parse(readFileSync(inputFile, 'utf-8'))
  const words = Array.isArray(data) ? data : data.words
  console.log(`   共 ${words.length} 词`)

  console.log(`🗄️  打开 ${DB_PATH}...`)
  const db = new Database(DB_PATH)

  const insert = db.prepare(`
    INSERT OR REPLACE INTO hsk_vocab
      (word, pinyin, hsk_level, part_of_speech, meaning_en, meaning_zh, examples, frequency_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let inserted = 0
  const txn = db.transaction((words: any[]) => {
    for (const w of words) {
      insert.run(
        w.word,
        w.pinyin,
        w.hsk_level,
        w.part_of_speech || null,
        w.meaning_en || null,
        w.meaning_zh || null,
        JSON.stringify(w.examples || []),
        w.frequency_rank || null
      )
      inserted++
    }
  })

  console.log(`💾 插入数据...`)
  txn(words)

  console.log(`\n✅ 成功导入 ${inserted} 词`)

  // 验证
  const count = db.prepare('SELECT COUNT(*) as c FROM hsk_vocab').get() as any
  const byLevel = db.prepare(`
    SELECT hsk_level, COUNT(*) as count
    FROM hsk_vocab GROUP BY hsk_level ORDER BY hsk_level
  `).all() as any[]

  console.log(`\n📊 数据库统计：`)
  console.log(`   总词数: ${count.c}`)
  console.log(`   按等级:`)
  for (const row of byLevel) {
    console.log(`     HSK ${row.hsk_level}: ${row.count}`)
  }

  db.close()
}

main().catch((err) => {
  console.error('❌ 错误:', err.message)
  process.exit(1)
})
