// @ts-nocheck

/**
 * 学生画像管理（4 个画像维度）
 *
 * 提供工具：student_profile
 * - get_personal: 查个人画像
 * - update_personal: 更新个人画像
 * - get_learning: 查学习画像
 * - update_learning: 更新学习画像
 * - get_history: 查近期学习记录
 * - add_history: 加一条学习记录
 * - get_session: 查当前会话上下文
 * - update_session: 更新会话上下文
 * - get_full: 一次拿全部 4 画像（Tavus-bridge 用）
 *
 * 关键钩子：session_start 时自动注入 4 个画像到 context
 *
 * v1.0 完成 - 符合 [docs/tasks.md] T-101 验收标准
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'

const db = new Database((process.env.HOME || '~') + '/.zh-tutor/students.db')

// 教学时长分级（按需求文档 §AC 标记）
function getMaxCallDuration(age: number | null): number {
  if (!age) return 600
  if (age >= 18) return 600
  if (age >= 16) return 360
  if (age >= 15) return 300
  return 180
}

// 隐私过滤：strict 模式不显示 location/occupation
function filterByPrivacy<T extends Record<string, any>>(obj: T, level: string): T {
  if (level === 'strict') {
    const { location, occupation, family, ...rest } = obj as any
    return { ...rest, _privacy: 'strict: location/occupation/family hidden' } as T
  }
  return obj
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'student_profile',
    description: '管理学生 4 个画像维度（个人 / 学习 / 历史 / 会话）。get_full 一次拿全部 4 画像。',
    parameters: {
      action: { type: 'string', enum: [
        'get_personal', 'update_personal',
        'get_learning', 'update_learning',
        'get_history', 'add_history',
        'get_session', 'update_session',
        'get_full'
      ]},
      hsk_level: { type: 'number', optional: true },
      target_hsk: { type: 'number', optional: true },
      interests: { type: 'array', items: { type: 'string' }, optional: true },
      family: { type: 'object', optional: true },
      occupation: { type: 'string', optional: true },
      location: { type: 'string', optional: true },
      privacy_level: { type: 'string', optional: true },
      vocab_mastered: { type: 'array', items: { type: 'string' }, optional: true },
      vocab_weak: { type: 'array', items: { type: 'string' }, optional: true },
      grammar_mastered: { type: 'array', items: { type: 'string' }, optional: true },
      grammar_weak: { type: 'array', items: { type: 'string' }, optional: true },
      pronunciation_issues: { type: 'array', items: { type: 'string' }, optional: true },
      active_learning_goals: { type: 'array', optional: true },
      learning_speed: { type: 'string', optional: true },
      topic: { type: 'string', optional: true },
      duration_min: { type: 'number', optional: true },
      new_words: { type: 'array', items: { type: 'string' }, optional: true },
      new_grammar: { type: 'array', items: { type: 'string' }, optional: true },
      mistakes_count: { type: 'number', optional: true },
      tavus_conversation_id: { type: 'string', optional: true },
      current_topic: { type: 'string', optional: true },
      current_difficulty: { type: 'string', optional: true },
      user_mood: { type: 'string', optional: true }
    },
    execute: async (params: any, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'

      try {
        switch (params.action) {
          // ========== 个人画像 ==========
          case 'get_personal': {
            const s: any = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
            if (!s) return { found: false, student_id: studentId }
            const personal = {
              id: s.id,
              name: s.name,
              age: s.age,
              hsk_level: s.hsk_level,
              target_hsk: s.target_hsk,
              native_lang: s.native_lang,
              interests: JSON.parse(s.interests || '[]'),
              family: s.family ? JSON.parse(s.family) : null,
              occupation: s.occupation,
              location: s.location,
              privacy_level: s.privacy_level,
              max_call_duration: getMaxCallDuration(s.age)
            }
            return filterByPrivacy(personal, s.privacy_level || 'standard')
          }

          case 'update_personal': {
            const existing: any = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
            if (!existing) {
              db.prepare(`
                INSERT INTO students (id, hsk_level, target_hsk, name, age, interests, family, occupation, location, privacy_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                studentId,
                params.hsk_level || 1,
                params.target_hsk || 6,
                params.name || null,
                params.age || null,
                JSON.stringify(params.interests || []),
                params.family ? JSON.stringify(params.family) : null,
                params.occupation || null,
                params.location || null,
                params.privacy_level || 'standard'
              )
            } else {
              const updates: string[] = []
              const values: any[] = []
              if (params.hsk_level !== undefined) { updates.push('hsk_level = ?'); values.push(params.hsk_level) }
              if (params.target_hsk !== undefined) { updates.push('target_hsk = ?'); values.push(params.target_hsk) }
              if (params.name !== undefined) { updates.push('name = ?'); values.push(params.name) }
              if (params.age !== undefined) { updates.push('age = ?'); values.push(params.age) }
              if (params.interests) { updates.push('interests = ?'); values.push(JSON.stringify(params.interests)) }
              if (params.family) { updates.push('family = ?'); values.push(JSON.stringify(params.family)) }
              if (params.occupation !== undefined) { updates.push('occupation = ?'); values.push(params.occupation) }
              if (params.location !== undefined) { updates.push('location = ?'); values.push(params.location) }
              if (params.privacy_level) { updates.push('privacy_level = ?'); values.push(params.privacy_level) }
              if (updates.length > 0) {
                values.push(studentId)
                db.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`).run(...values)
              }
            }
            return { updated: true, student_id: studentId }
          }

          // ========== 学习画像 ==========
          case 'get_learning': {
            const lp: any = db.prepare(`SELECT * FROM learning_profiles WHERE student_id = ?`).get(studentId)
            if (!lp) {
              return {
                student_id: studentId,
                vocab_mastered: [], vocab_weak: [],
                grammar_mastered: [], grammar_weak: [],
                pronunciation_issues: [], active_learning_goals: [],
                learning_speed: 'normal'
              }
            }
            return {
              ...lp,
              vocab_mastered: JSON.parse(lp.vocab_mastered || '[]'),
              vocab_weak: JSON.parse(lp.vocab_weak || '[]'),
              grammar_mastered: JSON.parse(lp.grammar_mastered || '[]'),
              grammar_weak: JSON.parse(lp.grammar_weak || '[]'),
              pronunciation_issues: JSON.parse(lp.pronunciation_issues || '[]'),
              active_learning_goals: JSON.parse(lp.active_learning_goals || '[]')
            }
          }

          case 'update_learning': {
            const existing: any = db.prepare(`SELECT * FROM learning_profiles WHERE student_id = ?`).get(studentId)
            const data: any = {
              vocab_mastered: JSON.stringify(params.vocab_mastered || []),
              vocab_weak: JSON.stringify(params.vocab_weak || []),
              grammar_mastered: JSON.stringify(params.grammar_mastered || []),
              grammar_weak: JSON.stringify(params.grammar_weak || []),
              pronunciation_issues: JSON.stringify(params.pronunciation_issues || []),
              active_learning_goals: JSON.stringify(params.active_learning_goals || []),
              learning_speed: params.learning_speed || 'normal',
              updated_at: new Date().toISOString()
            }

            if (!existing) {
              db.prepare(`
                INSERT INTO learning_profiles (student_id, vocab_mastered, vocab_weak, grammar_mastered, grammar_weak, pronunciation_issues, active_learning_goals, learning_speed, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(studentId, ...Object.values(data))
            } else {
              db.prepare(`
                UPDATE learning_profiles
                SET vocab_mastered = ?, vocab_weak = ?, grammar_mastered = ?, grammar_weak = ?,
                    pronunciation_issues = ?, active_learning_goals = ?, learning_speed = ?, updated_at = ?
                WHERE student_id = ?
              `).run(...Object.values(data), studentId)
            }
            return { updated: true, student_id: studentId }
          }

          // ========== 近期学习记录 ==========
          case 'get_history': {
            return db.prepare(`
              SELECT * FROM learning_history
              WHERE student_id = ?
              ORDER BY date DESC
              LIMIT 10
            `).all(studentId)
          }

          case 'add_history': {
            const result = db.prepare(`
              INSERT INTO learning_history (student_id, date, duration_min, topic, new_words, new_grammar, mistakes_count)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              studentId,
              new Date().toISOString().split('T')[0],
              params.duration_min || 0,
              params.topic || null,
              JSON.stringify(params.new_words || []),
              JSON.stringify(params.new_grammar || []),
              params.mistakes_count || 0
            )
            return { added: true, id: result.lastInsertRowid }
          }

          // ========== 会话上下文 ==========
          case 'get_session': {
            const sessionId = ctx.session.metadata?.sessionId
            if (!sessionId) return { active: false, reason: 'no sessionId in metadata' }
            return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId)
          }

          case 'update_session': {
            const sessionId = ctx.session.metadata?.sessionId ?? 'unknown'
            const existing: any = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId)
            if (!existing) {
              db.prepare(`
                INSERT INTO sessions (id, student_id, tavus_conversation_id, current_topic, current_difficulty, user_mood, started_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                sessionId,
                studentId,
                params.tavus_conversation_id || null,
                params.current_topic || null,
                params.current_difficulty || null,
                params.user_mood || null,
                new Date().toISOString()
              )
            } else {
              const updates: string[] = []
              const values: any[] = []
              if (params.current_topic !== undefined) { updates.push('current_topic = ?'); values.push(params.current_topic) }
              if (params.current_difficulty !== undefined) { updates.push('current_difficulty = ?'); values.push(params.current_difficulty) }
              if (params.user_mood !== undefined) { updates.push('user_mood = ?'); values.push(params.user_mood) }
              if (params.tavus_conversation_id !== undefined) { updates.push('tavus_conversation_id = ?'); values.push(params.tavus_conversation_id) }
              if (updates.length > 0) {
                values.push(sessionId)
                db.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values)
              }
            }
            return { updated: true, session_id: sessionId }
          }

          // ========== 一次拿全部 4 画像 ==========
          case 'get_full': {
            const personal: any = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
            const learning: any = db.prepare(`SELECT * FROM learning_profiles WHERE student_id = ?`).get(studentId)
            const history: any[] = db.prepare(`
              SELECT date, topic, new_words, new_grammar, mistakes_count
              FROM learning_history WHERE student_id = ?
              ORDER BY date DESC LIMIT 5
            `).all(studentId)
            const ongoing: any[] = db.prepare(`
              SELECT topic FROM ongoing_topics
              WHERE student_id = ? AND resolved = 0
              ORDER BY last_mentioned_at DESC LIMIT 3
            `).all(studentId)
            return {
              personal: personal ? filterByPrivacy({
                id: personal.id,
                name: personal.name,
                age: personal.age,
                hsk_level: personal.hsk_level,
                target_hsk: personal.target_hsk,
                native_lang: personal.native_lang,
                interests: JSON.parse(personal.interests || '[]'),
                family: personal.family ? JSON.parse(personal.family) : null,
                occupation: personal.occupation,
                location: personal.location,
                privacy_level: personal.privacy_level
              }, personal.privacy_level || 'standard') : null,
              learning: learning ? {
                vocab_mastered: JSON.parse(learning.vocab_mastered || '[]'),
                vocab_weak: JSON.parse(learning.vocab_weak || '[]'),
                grammar_mastered: JSON.parse(learning.grammar_mastered || '[]'),
                grammar_weak: JSON.parse(learning.grammar_weak || '[]'),
                pronunciation_issues: JSON.parse(learning.pronunciation_issues || '[]'),
                learning_speed: learning.learning_speed
              } : null,
              history,
              ongoing_topics: ongoing
            }
          }
        }
        return { error: 'unknown action: ' + params.action }
      } catch (e: any) {
        return { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join('\n') }
      }
    }
  })

  // 会话开始注入 4 个画像维度
  pi.on('session_start', async (ctx) => {
    const studentId = ctx.session.metadata?.studentId ?? 'default'
    const personal: any = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
    if (!personal) return {}

    const learning: any = db.prepare(`SELECT * FROM learning_profiles WHERE student_id = ?`).get(studentId)
    const recentHistory: any[] = db.prepare(`
      SELECT date, topic, new_words, new_grammar, mistakes_count
      FROM learning_history WHERE student_id = ?
      ORDER BY date DESC LIMIT 5
    `).all(studentId)
    const ongoingTopics: any[] = db.prepare(`
      SELECT topic, context, last_mentioned_at FROM ongoing_topics
      WHERE student_id = ? AND resolved = 0
      ORDER BY last_mentioned_at DESC LIMIT 3
    `).all(studentId)

    // 隐私过滤
    const privacy = personal.privacy_level || 'standard'
    const showLocation = privacy !== 'strict' ? personal.location : '（隐私）'
    const showOccupation = privacy !== 'strict' ? personal.occupation : '（隐私）'
    const showFamily = privacy !== 'strict' && personal.family ? JSON.parse(personal.family) : '（隐私）'

    return {
      prependContext: `
# 当前学生完整画像（4 个维度）

## 1. 个人画像 (STUDENT_PROFILE)
- 名字: ${personal.name || '未设置'}
- 年龄: ${personal.age || '未知'}（决定教学时长：${Math.floor(getMaxCallDuration(personal.age) / 60)} 分钟）
- HSK 等级: ${personal.hsk_level}（目标 HSK ${personal.target_hsk}）
- 母语: ${personal.native_lang}
- 兴趣: ${JSON.parse(personal.interests || '[]').join('、') || '未知'}
- 职业: ${showOccupation || '未知'}
- 位置: ${showLocation || '未知'}
- 家庭: ${typeof showFamily === 'string' ? showFamily : JSON.stringify(showFamily)}
- 隐私等级: ${privacy}

## 2. 学习画像 (LEARNING_PROFILE)
- 词汇掌握: ${learning ? JSON.parse(learning.vocab_mastered || '[]').slice(0, 10).join('、') : '未知'}
- 词汇薄弱: ${learning ? JSON.parse(learning.vocab_weak || '[]').slice(0, 5).join('、') : '未知'}
- 语法掌握: ${learning ? JSON.parse(learning.grammar_mastered || '[]').slice(0, 5).join('、') : '未知'}
- 语法薄弱: ${learning ? JSON.parse(learning.grammar_weak || '[]').slice(0, 5).join('、') : '未知'}
- 发音问题: ${learning ? JSON.parse(learning.pronunciation_issues || '[]').join('、') : '未知'}
- 学习速度: ${learning ? learning.learning_speed : 'normal'}

## 3. 近期学习记录 (LEARNING_HISTORY)
${recentHistory.length > 0
  ? recentHistory.map(h => `- ${h.date}: ${h.topic} (${h.mistakes_count} 错题)`).join('\n')
  : '- 首次会话'}

## 4. 进行中的话题（自然承接）
${ongoingTopics.length > 0
  ? ongoingTopics.map(t => `- ${t.topic}`).join('\n')
  : '- 无'}

请根据以上 4 个画像维度，个性化教学。
- 学习画像决定难度、词汇、复习什么
- 个人画像决定话题、例子
- 历史决定连续性
- 严格按 system/SYSTEM.md 的规则教学
`
    }
  })
}
