/**
 * 错题本管理
 *
 * 提供 1 个工具：mistake_log（add / list / mark_corrected）
 *
 * 状态：🟡 TODO — 等待定稿
 * 完整实现参考：docs/pi-extensions-guide.md 第 5.2 节
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'

const db = new Database((process.env.HOME || '~') + '/.zh-tutor/mistakes.db')

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'mistake_log',
    description: '管理学生错题。add 记录错题, list 列错题, mark_corrected 标记掌握。',
    parameters: {
      action: { type: 'string', enum: ['add', 'list', 'mark_corrected'] },
      type: { type: 'string', enum: ['vocab', 'grammar', 'pronunciation'] },
      item: { type: 'string' },
      context: { type: 'string', optional: true }
    },
    execute: async ({ action, type, item, context }, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'

      if (action === 'add') {
        db.prepare(`
          INSERT INTO mistakes (student_id, type, item, context, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(studentId, type, item, context, Date.now(), Date.now())
        return { added: true }
      }
      if (action === 'list') {
        return db.prepare(`
          SELECT * FROM mistakes
          WHERE student_id = ? AND corrected_count < 3
          ORDER BY last_seen_at DESC LIMIT 20
        `).all(studentId)
      }
      if (action === 'mark_corrected') {
        db.prepare(`UPDATE mistakes SET corrected_count = corrected_count + 1
                    WHERE student_id = ? AND item = ?`).run(studentId, item)
        return { marked: true }
      }
    }
  })
}
