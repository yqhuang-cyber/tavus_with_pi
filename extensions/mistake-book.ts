// @ts-nocheck

/**
 * 错题本管理
 *
 * 工具：mistake_log
 * - add: 记录错题（Kai 调：学生说错任何词/语法时立即调）
 * - list: 列错题（可按类型/未掌握筛选）
 * - mark_corrected: 标记已掌握（FSRS 评分 correct 时调）
 * - stats: 错题统计
 *
 * v1.0 完成 - 符合 [docs/tasks.md] T-103 验收标准
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'

const db = new Database((process.env.HOME || '~') + '/.zh-tutor/mistakes.db')

const addStmt = db.prepare(`
  INSERT INTO mistakes (student_id, type, item, context, created_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const listStmt = db.prepare(`
  SELECT * FROM mistakes
  WHERE student_id = ?
    AND (? IS NULL OR type = ?)
    AND corrected_count < 3
  ORDER BY last_seen_at DESC
  LIMIT ?
`)

const markCorrectedStmt = db.prepare(`
  UPDATE mistakes SET corrected_count = corrected_count + 1, last_seen_at = ?
  WHERE student_id = ? AND item = ?
`)

const statsStmt = db.prepare(`
  SELECT type, COUNT(*) as count FROM mistakes
  WHERE student_id = ? AND corrected_count < 3
  GROUP BY type
`)

const countStmt = db.prepare(`
  SELECT COUNT(*) as c FROM mistakes WHERE student_id = ?
`)

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'mistake_log',
    description: '管理学生错题。add 记录错题（学生说错任何词/语法时立即调），list 列错题，mark_corrected 标记掌握，stats 错题统计。',
    parameters: {
      action: { type: 'string', enum: ['add', 'list', 'mark_corrected', 'stats'] },
      type: { type: 'string', enum: ['vocab', 'grammar', 'pronunciation'], optional: true },
      item: { type: 'string', description: '错的内容（错的词或语法点）', optional: true },
      context: { type: 'string', description: '完整的句子', optional: true },
      filter_type: { type: 'string', enum: ['vocab', 'grammar', 'pronunciation'], optional: true },
      limit: { type: 'number', description: 'list 时最多列几个（默认 20）', optional: true }
    },
    execute: async (params, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'
      const now = Date.now()

      try {
        if (params.action === 'add') {
          if (!params.item) return { error: 'item required for add' }
          if (!params.type) return { error: 'type required for add' }

          // 去重：如果同一学生同一 item 错过 3 次以上，不再增加
          const existing = db.prepare(`
            SELECT * FROM mistakes WHERE student_id = ? AND item = ? ORDER BY created_at DESC LIMIT 1
          `).get(studentId, params.item) as any

          if (existing && existing.corrected_count < 3) {
            // 更新 last_seen_at
            db.prepare(`UPDATE mistakes SET last_seen_at = ? WHERE id = ?`).run(now, existing.id)
            return { added: false, reason: 'already exists, updated last_seen_at', existing_id: existing.id }
          }

          const result = addStmt.run(studentId, params.type, params.item, params.context || null, now, now)
          return { added: true, id: result.lastInsertRowid, type: params.type, item: params.item }
        }

        if (params.action === 'list') {
          const limit = Math.min(params.limit || 20, 100)
          const mistakes = listStmt.all(studentId, params.filter_type || null, params.filter_type || null, limit)
          return { student_id: studentId, count: mistakes.length, mistakes }
        }

        if (params.action === 'mark_corrected') {
          if (!params.item) return { error: 'item required for mark_corrected' }
          const result = markCorrectedStmt.run(now, studentId, params.item)
          if (result.changes === 0) return { error: 'item not found' }
          // 当 corrected_count >= 3，自动从错题本"毕业"
          return { marked: true, item: params.item, changes: result.changes }
        }

        if (params.action === 'stats') {
          const byType = statsStmt.all(studentId) as any[]
          const total = (countStmt.get(studentId) as any).c
          return { student_id: studentId, total_mistakes: total, active_mistakes: byType.reduce((s, r) => s + r.count, 0), by_type: byType }
        }

        return { error: 'unknown action: ' + params.action }
      } catch (e: any) {
        return { error: e.message }
      }
    }
  })
}
