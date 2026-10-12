// @ts-nocheck

/**
 * FSRS 间隔重复调度
 *
 * 工具：fsrs_schedule
 * - add: 加新卡（错题入 FSRS）
 * - get_due: 拿待复习的卡（按 due_date 升序）
 * - review: 评分（Again=1/Hard=2/Good=3/Easy=4）后重排 due_date
 * - stats: FSRS 状态统计
 *
 * 依赖：ts-fsrs（间隔重复算法）
 *
 * v1.0 完成 - 符合 [docs/tasks.md] T-104 验收标准
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'
import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card as FsrsCard } from 'ts-fsrs'
import dayjs from 'dayjs'

const db = new Database((process.env.HOME || '~') + '/.zh-tutor/fsrs.db')

const f = fsrs(generatorParameters({ enable_fuzz: true }))

// FSRS card 状态枚举
const stateToStr = (s: State): string => {
  switch (s) {
    case State.New: return 'new'
    case State.Learning: return 'learning'
    case State.Review: return 'review'
    case State.Relearning: return 'relearning'
    default: return 'unknown'
  }
}

const strToState = (s: string): State => {
  switch (s) {
    case 'new': return State.New
    case 'learning': return State.Learning
    case 'review': return State.Review
    case 'relearning': return State.Relearning
    default: return State.New
  }
}

const numToRating = (n: number): Rating => {
  // ts-fsrs 1.2.0: Rating.Again=0, Hard=1, Good=2, Easy=3
  if (n === 1) return Rating.Again
  if (n === 2) return Rating.Hard
  if (n === 3) return Rating.Good
  if (n === 4) return Rating.Easy
  return Rating.Good
}

interface DbCard {
  student_id: string
  card_id: string
  stability: number
  difficulty: number
  due_date: number
  last_review: number | null
  state: string
  reps: number
  lapses: number
}

function dbToFsrs(c: DbCard): FsrsCard {
  return {
    due: dayjs(c.due_date),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.last_review ? Math.floor((Date.now() - c.last_review) / 86400000) : 0,
    scheduled_days: 0,
    reps: c.reps,
    lapses: c.lapses,
    state: strToState(c.state),
    last_review: c.last_review ? dayjs(c.last_review) : undefined
  } as FsrsCard
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'fsrs_schedule',
    description: 'FSRS 间隔重复调度。add 加新卡，get_due 拿待复习（按 due_date 升序），review 评分 1-4 重排 due_date，stats 调度状态。',
    parameters: {
      action: { type: 'string', enum: ['add', 'get_due', 'review', 'stats'] },
      card_id: { type: 'string', description: '卡片 ID（词或语法点）', optional: true },
      rating: { type: 'number', description: '评分 1=Again / 2=Hard / 3=Good / 4=Easy', optional: true },
      limit: { type: 'number', description: 'get_due 时最多拿几个（默认 20）', optional: true }
    },
    execute: async (params, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'
      const now = Date.now()

      try {
        if (params.action === 'add') {
          if (!params.card_id) return { error: 'card_id required for add' }

          const existing = db.prepare(`SELECT * FROM fsrs_cards WHERE student_id = ? AND card_id = ?`)
                             .get(studentId, params.card_id) as DbCard | undefined
          if (existing) {
            return { added: false, reason: 'already exists', card_id: params.card_id }
          }

          const card = createEmptyCard()
          db.prepare(`
            INSERT INTO fsrs_cards (student_id, card_id, stability, difficulty, due_date, last_review, state, reps, lapses)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            studentId,
            params.card_id,
            card.stability,
            card.difficulty,
            now + 86400000,  // 默认明天复习
            now,
            stateToStr(card.state),
            0,
            0
          )
          return { added: true, card_id: params.card_id, due_date: now + 86400000 }
        }

        if (params.action === 'get_due') {
          const limit = Math.min(params.limit || 20, 50)
          const cards = db.prepare(`
            SELECT * FROM fsrs_cards
            WHERE student_id = ? AND due_date <= ?
            ORDER BY due_date ASC
            LIMIT ?
          `).all(studentId, now, limit) as DbCard[]
          return { student_id: studentId, count: cards.length, cards }
        }

        if (params.action === 'review') {
          if (!params.card_id) return { error: 'card_id required for review' }
          if (!params.rating) return { error: 'rating required for review' }

          const row = db.prepare(`
            SELECT * FROM fsrs_cards WHERE student_id = ? AND card_id = ?
          `).get(studentId, params.card_id) as DbCard | undefined

          if (!row) return { error: 'card not found', card_id: params.card_id }

          const card = dbToFsrs(row)
          const rating = numToRating(params.rating)
          // ts-fsrs 1.2.0 API: f.repeat(card, now) returns Record<Rating, SchedulingCard>
          // 注意 ts-fsrs 用 dayjs，new Date() 会导致 now.clone() 失败
          const result = f.repeat(card, dayjs(now))
          const scheduled = result[rating]
          if (!scheduled || !scheduled.card) {
            return { error: 'fsrs repeat returned no result', rating: params.rating }
          }
          const newCard = scheduled.card

          db.prepare(`
            UPDATE fsrs_cards
            SET stability = ?, difficulty = ?, due_date = ?, last_review = ?, state = ?, reps = ?, lapses = ?
            WHERE student_id = ? AND card_id = ?
          `).run(
            newCard.stability,
            newCard.difficulty,
            newCard.due.valueOf(),
            now,
            stateToStr(newCard.state),
            newCard.reps,
            newCard.lapses,
            studentId,
            params.card_id
          )
          return {
            reviewed: true,
            card_id: params.card_id,
            rating: params.rating,
            next_due: newCard.due.toISOString(),
            interval_days: Math.round((newCard.due.valueOf() - now) / 86400000),
            new_state: stateToStr(newCard.state)
          }
        }

        if (params.action === 'stats') {
          const total = (db.prepare(`SELECT COUNT(*) as c FROM fsrs_cards WHERE student_id = ?`).get(studentId) as any).c
          const dueNow = (db.prepare(`SELECT COUNT(*) as c FROM fsrs_cards WHERE student_id = ? AND due_date <= ?`).get(studentId, now) as any).c
          const byState = db.prepare(`
            SELECT state, COUNT(*) as count FROM fsrs_cards
            WHERE student_id = ? GROUP BY state
          `).all(studentId) as any[]
          return { student_id: studentId, total, due_now: dueNow, by_state: byState }
        }

        return { error: 'unknown action: ' + params.action }
      } catch (e: any) {
        return { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join('\n') }
      }
    }
  })
}
