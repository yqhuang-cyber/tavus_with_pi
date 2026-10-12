/**
 * FSRS 间隔重复调度
 *
 * 提供 1 个工具：fsrs_schedule（add / get_due / review）
 *
 * 状态：🟡 TODO — 等待定稿
 * 完整实现参考：docs/pi-extensions-guide.md 第 5.3 节
 *
 * 依赖：npm install ts-fsrs better-sqlite3
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'
// import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'

// const f = fsrs(generatorParameters({ enable_fuzz: true }))
const db = new Database((process.env.HOME || '~') + '/.zh-tutor/fsrs.db')

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'fsrs_schedule',
    description: 'FSRS 间隔重复调度。add 加新卡, get_due 拿待复习, review 评分。',
    parameters: {
      action: { type: 'string', enum: ['add', 'get_due', 'review'] },
      card_id: { type: 'string' },
      rating: { type: 'number', optional: true, description: '1-4 (Again/Hard/Good/Easy)' }
    },
    execute: async ({ action, card_id, rating }, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'

      if (action === 'add') {
        // TODO: 完整 FSRS 实现
        db.prepare(`
          INSERT OR REPLACE INTO fsrs_cards (student_id, card_id, due_date, last_review, state)
          VALUES (?, ?, ?, ?, ?)
        `).run(studentId, card_id, Date.now() + 86400000, Date.now(), 'new')
        return { added: true, card_id }
      }
      if (action === 'get_due') {
        return db.prepare(`
          SELECT * FROM fsrs_cards
          WHERE student_id = ? AND due_date <= ?
          ORDER BY due_date ASC LIMIT 20
        `).all(studentId, Date.now())
      }
      // review action: TODO
    }
  })
}
