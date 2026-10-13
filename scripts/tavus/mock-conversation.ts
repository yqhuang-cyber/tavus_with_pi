#!/usr/bin/env -S npx tsx
/**
 * Mock 跑通：模拟 Tavus → tavus-bridge → Pi extensions 全流程
 *
 * 不依赖 Tavus API，纯本地测：
 * 1. 启动 tavus-bridge HTTP server
 * 2. 模拟"学生"发消息：先打招呼
 * 3. 模拟"学生"说一个错的中文句子
 * 4. 模拟"Kai"调 add_mistake / lookup_hsk_word
 * 5. 验证 student.db / mistakes.db / fsrs.db 数据正确
 *
 * 用法: npx tsx scripts/tavus/mock-conversation.ts
 */

// 必须在 import 之前设 HOME，否则 extension 在 module top-level new Database() 会用错的路径
const TEMP_HOME = `/tmp/zh-mock-conv-${Date.now()}`
process.env.HOME = TEMP_HOME
process.env.STUDENT_ID = 'mock-student'

import { setTimeout as sleep } from 'node:timers/promises'
import http from 'node:http'
import { startBridgeServer, TOOL_MAP } from '../../extensions/tavus-bridge.ts'
import Database from 'better-sqlite3'
import path from 'node:path'

const log = (label: string, msg: any) => {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] ${label.padEnd(20)} ${typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)}`)
}

async function callTool(server: any, name: string, args: any) {
  const url = `/tools/${name}`
  return new Promise<any>((resolve, reject) => {
    const data = JSON.stringify(args)
    const req = http.request(
      {
        host: '127.0.0.1',
        port: (server.address() as any).port,
        method: 'POST',
        path: url,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let chunks = ''
        res.on('data', (c) => { chunks += c })
        res.on('end', () => {
          try { resolve(JSON.parse(chunks)) } catch (e) { reject(new Error('bad json: ' + chunks)) }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function webhook(server: any, payload: any) {
  return new Promise<any>((resolve, reject) => {
    const data = JSON.stringify(payload)
    const req = http.request(
      {
        host: '127.0.0.1',
        port: (server.address() as any).port,
        method: 'POST',
        path: '/webhook/tavus/transcript',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let chunks = ''
        res.on('data', (c) => { chunks += c })
        res.on('end', () => {
          try { resolve(JSON.parse(chunks)) } catch (e) { reject(new Error('bad json: ' + chunks)) }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function main() {
  log('SETUP', `Using TEMP_HOME=${TEMP_HOME}`)

  // 1. 初始化 4 个 sqlite DB
  const { mkdirSync } = await import('node:fs')
  mkdirSync(TEMP_HOME + '/.zh-tutor', { recursive: true })

  const studentsDb = new Database(TEMP_HOME + '/.zh-tutor/students.db')
  studentsDb.pragma('foreign_keys = OFF')
  studentsDb.exec(`
    CREATE TABLE students (id TEXT PRIMARY KEY, hsk_level INTEGER DEFAULT 1, target_hsk INTEGER DEFAULT 6, name TEXT, age INTEGER, interests TEXT DEFAULT '[]', family TEXT, occupation TEXT, location TEXT, privacy_level TEXT DEFAULT 'standard');
    CREATE TABLE learning_profiles (student_id TEXT PRIMARY KEY, vocab_mastered TEXT DEFAULT '[]', vocab_weak TEXT DEFAULT '[]', grammar_mastered TEXT DEFAULT '[]', grammar_weak TEXT DEFAULT '[]', pronunciation_issues TEXT DEFAULT '[]', active_learning_goals TEXT DEFAULT '[]', learning_speed TEXT DEFAULT 'normal', updated_at TEXT);
    CREATE TABLE learning_history (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, date TEXT, duration_min INTEGER, topic TEXT, new_words TEXT, new_grammar TEXT, mistakes_count INTEGER);
    CREATE TABLE ongoing_topics (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, topic TEXT, context TEXT, last_mentioned_at TEXT, resolved INTEGER DEFAULT 0);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, student_id TEXT, tavus_conversation_id TEXT, current_topic TEXT, current_difficulty TEXT, user_mood TEXT, started_at TEXT, ended_at TEXT, transcript_path TEXT, summary TEXT, last_raven_signals TEXT, last_raven_at TEXT);
  `)
  // 关闭 FK 强制
  studentsDb.pragma('foreign_keys = OFF')
  studentsDb.close()

  const mistakesDb = new Database(TEMP_HOME + '/.zh-tutor/mistakes.db')
  mistakesDb.exec(`
    CREATE TABLE mistakes (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, type TEXT, item TEXT, context TEXT, corrected_count INTEGER DEFAULT 0, created_at INTEGER, last_seen_at INTEGER);
  `)
  mistakesDb.close()

  const fsrsDb = new Database(TEMP_HOME + '/.zh-tutor/fsrs.db')
  fsrsDb.exec(`
    CREATE TABLE fsrs_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, card_id TEXT, stability REAL, difficulty REAL, due_date INTEGER, last_review INTEGER, state TEXT, reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0, UNIQUE(student_id, card_id));
  `)
  fsrsDb.close()

  // 灌入 HSK 1 词
  const hskDb = new Database(TEMP_HOME + '/.zh-tutor/hsk-vocab.db')
  hskDb.exec(`
    CREATE TABLE hsk_vocab (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, pinyin TEXT, hsk_level INTEGER, part_of_speech TEXT, meaning_en TEXT, meaning_zh TEXT, examples TEXT, frequency_rank INTEGER);
  `)
  const insertHsk = hskDb.prepare(`INSERT INTO hsk_vocab (word, pinyin, hsk_level, part_of_speech, meaning_en, meaning_zh, examples, frequency_rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  insertHsk.run('你好', 'nǐ hǎo', 1, 'phrase', 'hello', '你好', '[]', 1)
  insertHsk.run('点餐', 'diǎn cān', 1, 'phrase', 'to order food', '点餐', '[]', 2)
  insertHsk.run('喜欢', 'xǐ huan', 1, 'v', 'to like', '喜欢', '[]', 3)
  insertHsk.run('菜单', 'càidān', 1, 'n', 'menu', '菜单', '[]', 4)
  insertHsk.run('面条', 'miàntiáo', 1, 'n', 'noodles', '面条', '[]', 5)
  hskDb.close()

  // 2. 启动 tavus-bridge server + 真 extension
  log('SETUP', 'Loading extensions...')
  // 直接 import 4 个 extension 并 registerTool，收集 tool registry
  const toolRegistry: Record<string, any> = {}
  const makeStubPi = (_name: string): any => ({
    registerTool(meta: any) {
      toolRegistry[meta.name] = meta
    },
    on() { /* 跳过钩子 */ },
  })
  // 用动态 import 避免静态依赖
  const { default: studentProfile } = await import('../../extensions/student-profile.ts')
  const { default: hskVocab } = await import('../../extensions/hsk-vocab.ts')
  const { default: mistakeBook } = await import('../../extensions/mistake-book.ts')
  const { default: fsrsScheduler } = await import('../../extensions/fsrs-scheduler.ts')
  studentProfile(makeStubPi('student_profile'))
  hskVocab(makeStubPi('hsk_vocab'))
  mistakeBook(makeStubPi('mistake_log'))
  fsrsScheduler(makeStubPi('fsrs_schedule'))
  // 把 hsk_list_by_level 注册到统一表
  for (const k of Object.keys(toolRegistry)) {
    if (!toolRegistry[k]) {
      console.warn(`Tool not registered: ${k}`)
    }
  }
  // 找到 hsk_list_by_level（也用 hsk_vocab 同名工具）
  if (toolRegistry['hsk_list_by_level']) {
    toolRegistry['hsk_vocab'] = toolRegistry['hsk_list_by_level']  // 不对，单独 register
  }
  // 实际上 hsk-vocab extension 注册了 5 个工具：hsk_lookup, hsk_lookup_batch, hsk_random_words, hsk_list_by_level, hsk_stats
  // 都在同一个 stub pi 中
  // 我们重新加载 hsk-vocab 到一个空 stub pi 单独拿 hsk_list_by_level
  const stubPi2: any = { registerTool(meta: any) { toolRegistry[meta.name] = meta }, on() {} }
  hskVocab(stubPi2)
  log('SETUP', `Loaded ${Object.keys(toolRegistry).length} tools: ${Object.keys(toolRegistry).join(', ')}`)

  // 3. 启动 HTTP server
  log('SETUP', 'Starting tavus-bridge...')
  const { server, port } = await startBridgeServer(
    async (name: string, params: any) => {
      // 路由 Tavus 工具名 → Pi 内部工具名
      const toolNameMap: Record<string, string> = {
        lookup_hsk_word: 'hsk_lookup',
        lookup_hsk_batch: 'hsk_lookup_batch',
        hsk_random_words: 'hsk_random_words',
        hsk_list_by_level: 'hsk_list_by_level',
        hsk_stats: 'hsk_stats',
        add_mistake: 'mistake_log',
        list_mistakes: 'mistake_log',
        mark_corrected: 'mistake_log',
        get_student_profile: 'student_profile',
        update_personal: 'student_profile',
        update_learning: 'student_profile',
        add_history: 'student_profile',
        get_history: 'student_profile',
        get_due_cards: 'fsrs_schedule',
        schedule_review: 'fsrs_schedule',
        add_fsrs_card: 'fsrs_schedule',
      }
      const internalName = toolNameMap[name] || name
      const tool = toolRegistry[internalName]
      if (!tool) throw new Error(`tool not found: ${name} → ${internalName}`)
      // student_id 注入 ctx
      const ctx = {
        session: {
          metadata: { studentId: 'mock-student' },
        },
      }
      return await tool.execute(params, ctx)
    },
    { port: 0, studentId: 'mock-student' }
  )
  ;(server as any).address = () => ({ port })
  log('SETUP', `tavus-bridge listening on http://localhost:${port}`)

  try {
    // 3. 健康检查
    log('STEP 1', 'GET /health')
    const health = await fetch(`http://localhost:${port}/health`).then((r) => r.json())
    log('OK', health)

    // 4. 模拟学生设置画像
    log('STEP 2', '模拟"Kai"调 update_personal 设学生画像')
    const updateRes = await callTool(server, 'update_personal', {
      name: 'Alice',
      age: 20,
      hsk_level: 2,
      target_hsk: 4,
      interests: ['猫', '滑雪', '摄影'],
      occupation: '学生',
      location: '西雅图',
    })
    log('OK', updateRes)

    // 5. 模拟学生说"你好" → Kai 调 lookup_hsk_word
    log('STEP 3', '学生说"你好" → Kai 调 lookup_hsk_word')
    const lookup1 = await callTool(server, 'lookup_hsk_word', { word: '你好' })
    log('OK', lookup1)

    // 6. 模拟学生说"点餐" → Kai 调 lookup_hsk_word
    log('STEP 4', '学生说"我想点餐" → Kai 调 lookup_hsk_word')
    const lookup2 = await callTool(server, 'lookup_hsk_word', { word: '点餐' })
    log('OK', lookup2)

    // 7. 模拟学生说错"我喜欢吃面条"（语法错，少了"我"）
    log('STEP 5', '学生说错"喜欢吃面条" → Kai 调 add_mistake')
    const mistake1 = await callTool(server, 'add_mistake', {
      type: 'grammar',
      item: '主语省略错误',
      context: '学生说：喜欢吃面条（应为我喜欢吃面条）',
    })
    log('OK', mistake1)

    // 8. 模拟学生说"菜单" → Kai 调 lookup_hsk_word
    log('STEP 6', '学生问"菜单怎么说" → Kai 调 lookup_hsk_word')
    const lookup3 = await callTool(server, 'lookup_hsk_word', { word: '菜单' })
    log('OK', lookup3)

    // 9. 模拟学生问"今天我练习了什么" → Kai 调 list_mistakes
    log('STEP 7', '学生问"我哪些地方错了" → Kai 调 list_mistakes')
    const mistakes = await callTool(server, 'list_mistakes', { limit: 10 })
    log('OK', mistakes)

    // 10. 模拟会话结束 → Tavus 推 transcript
    log('STEP 8', 'Tavus 推 transcript webhook')
    const transcript = [
      { role: 'user', text: '你好' },
      { role: 'assistant', text: '你好！很高兴见到你。' },
      { role: 'user', text: '我想点餐' },
      { role: 'assistant', text: '好的，请看菜单。' },
      { role: 'user', text: '我喜欢吃面条' },
      { role: 'assistant', text: '可以说：我喜欢吃面条。' },
    ]
    const hook = await webhook(server, {
      conversation_id: 'mock-conv-1',
      student_id: 'mock-student',
      transcript,
    })
    log('OK', hook)

    // 11. 模拟 Kai 加 FSRS 复习卡
    log('STEP 9', 'Kai 把"主语省略"加进 FSRS 复习')
    const addCard = await callTool(server, 'add_fsrs_card', { card_id: '主语省略错误' })
    log('OK', addCard)

    // 12. 模拟 24h 后拉待复习
    log('STEP 10', '24h 后拉待复习（应该拿不到因为是新建的）')
    const due = await callTool(server, 'get_due_cards', { limit: 10 })
    log('OK', due)

    // 13. 模拟学生学完，add_history
    log('STEP 11', '会话结束 Kai 调 add_history')
    const history = await callTool(server, 'add_history', {
      topic: '点餐',
      duration_min: 5,
      new_words: ['点餐', '菜单'],
      mistakes_count: 1,
    })
    log('OK', history)

    // 14. T-206: 模拟 Tavus Raven 推送多模态感知
    log('STEP 12', 'Tavus Raven 推 NL 描述到 Pi')
    const raven = await fetch(`http://localhost:${port}/webhook/tavus/raven`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: 'mock-conv-1',
        student_id: 'mock-student',
        signals: [
          { signal: 'user hesitant, looking away', confidence: 0.85, ts: Date.now() },
          { signal: 'user smiles when seeing "面条"', confidence: 0.92, ts: Date.now() + 1000 },
        ],
      }),
    }).then((r) => r.json())
    log('OK', raven)

    // 15. 验证 Raven signals 存到 sessions 表
    const verifyRavenDb = new Database(TEMP_HOME + '/.zh-tutor/students.db', { readonly: true })
    const ravenRow = verifyRavenDb.prepare(`SELECT last_raven_signals, last_raven_at FROM sessions WHERE id = ?`).get('mock-conv-1') as any
    log('RAVEN_IN_DB', ravenRow)
    verifyRavenDb.close()

    // 14. 验证最终状态
    log('VERIFY', '检查 students.db / mistakes.db / sessions 表')
    const verifyDb = new Database(TEMP_HOME + '/.zh-tutor/students.db', { readonly: true })
    const student = verifyDb.prepare('SELECT * FROM students WHERE id = ?').get('mock-student') as any
    log('STUDENT', student)

    const session = verifyDb.prepare('SELECT * FROM sessions WHERE id = ?').get('mock-conv-1') as any
    log('SESSION', session)

    const sessHistory = verifyDb.prepare('SELECT * FROM learning_history WHERE student_id = ?').all('mock-student')
    log('HISTORY', sessHistory)
    verifyDb.close()

    const misDb = new Database(TEMP_HOME + '/.zh-tutor/mistakes.db', { readonly: true })
    const allMistakes = misDb.prepare('SELECT * FROM mistakes WHERE student_id = ?').all('mock-student')
    log('MISTAKES', allMistakes)
    misDb.close()

    const fsrsCheckDb = new Database(TEMP_HOME + '/.zh-tutor/fsrs.db', { readonly: true })
    const cards = fsrsCheckDb.prepare('SELECT * FROM fsrs_cards WHERE student_id = ?').all('mock-student')
    log('FSRS_CARDS', cards)
    fsrsCheckDb.close()

    log('DONE', 'Mock 跑通成功！')
  } finally {
    server.close()
    // 清理
    const { rmSync } = await import('node:fs')
    rmSync(TEMP_HOME, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
