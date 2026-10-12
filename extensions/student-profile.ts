/**
 * 学生画像管理
 *
 * 提供 1 个工具：student_profile（get / set / add_session）
 * 关键钩子：session_start 时自动注入画像到 system prompt
 *
 * 状态：🟡 TODO — 等待定稿
 * 完整实现参考：docs/pi-extensions-guide.md 第 5.4 节
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'

const db = new Database((process.env.HOME || '~') + '/.zh-tutor/students.db')

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'student_profile',
    description: '管理学生画像。get 查, set 更新, add_session 加会话。',
    parameters: {
      action: { type: 'string', enum: ['get', 'set', 'add_session'] },
      hsk_level: { type: 'number', optional: true },
      target_level: { type: 'number', optional: true },
      native_lang: { type: 'string', optional: true },
      duration_min: { type: 'number', optional: true }
    },
    execute: async (params: any, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'

      if (params.action === 'get') {
        const student: any = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
        const recentMistakes: any[] = db.prepare(`
          SELECT item, type FROM mistakes
          WHERE student_id = ? AND corrected_count < 3
          ORDER BY last_seen_at DESC LIMIT 10
        `).all(studentId)
        return { ...student, recent_mistakes: recentMistakes }
      }

      if (params.action === 'set') {
        db.prepare(`
          INSERT OR REPLACE INTO students (id, hsk_level, target_level, native_lang)
          VALUES (?, ?, ?, ?)
        `).run(studentId, params.hsk_level, params.target_level, params.native_lang)
        return { updated: true }
      }

      if (params.action === 'add_session') {
        db.prepare(`UPDATE students SET total_minutes = total_minutes + ? WHERE id = ?`)
          .run(params.duration_min, studentId)
        return { added: true }
      }
    }
  })

  // 关键钩子：会话开始注入画像
  pi.on('session_start', async (ctx) => {
    const studentId = ctx.session.metadata?.studentId ?? 'default'
    const profile: any = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
    if (!profile) return {}

    const recentMistakes: any[] = db.prepare(`
      SELECT item, type FROM mistakes
      WHERE student_id = ? AND corrected_count < 3
      ORDER BY last_seen_at DESC LIMIT 5
    `).all(studentId)
    const mistakesText = recentMistakes.map(m => `${m.item} (${m.type})`).join('、')

    return {
      prependContext: `
# 当前学生画像
- 母语: ${profile.native_lang}
- HSK 等级: ${profile.hsk_level}（目标 HSK ${profile.target_level}）
- 学习天数: ${profile.streak_days}
- 累计学习: ${profile.total_minutes} 分钟
- 最近错题: ${mistakesText || '无'}

请根据以上画像调整教学难度和风格。
`
    }
  })
}
