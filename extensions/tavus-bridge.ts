// @ts-nocheck

/**
 * Tavus Function Call 桥接
 *
 * 启动 HTTP server 接收 Tavus LLM 的工具调用，
 * 路由到 Pi 内部工具执行。
 *
 * 路由：
 * - POST /tools/lookup_hsk_word        → hsk_lookup
 * - POST /tools/lookup_hsk_batch       → hsk_lookup_batch
 * - POST /tools/hsk_random_words       → hsk_random_words
 * - POST /tools/hsk_stats              → hsk_stats
 * - POST /tools/add_mistake             → mistake_log add
 * - POST /tools/list_mistakes           → mistake_log list
 * - POST /tools/mark_corrected          → mistake_log mark_corrected
 * - POST /tools/get_student_profile     → student_profile get_full
 * - POST /tools/update_personal         → student_profile update_personal
 * - POST /tools/update_learning         → student_profile update_learning
 * - POST /tools/get_due_cards           → fsrs_schedule get_due
 * - POST /tools/schedule_review         → fsrs_schedule review
 * - POST /tools/add_fsrs_card           → fsrs_schedule add
 * - POST /webhook/tavus/transcript      → 存 transcript 到 students.db.sessions
 * - GET  /health                        → 健康检查
 *
 * v1.0 完成 - 符合 [docs/tasks.md] T-105 验收标准
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'
import path from 'node:path'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const STUDENT_ID = process.env.STUDENT_ID || 'default'
const DEFAULT_PORT = parseInt(process.env.TAVUS_BRIDGE_PORT || '7123', 10)
const TRANSCRIPT_DIR = process.env.TRANSCRIPT_DIR || `${process.env.HOME || '~'}/.zh-tutor/transcripts`

const studentsDb = new Database((process.env.HOME || '~') + '/.zh-tutor/students.db')

// 工具映射：endpoint → (toolName, defaultParams)
export const TOOL_MAP: Record<string, [string, Record<string, any>?]> = {
  '/tools/lookup_hsk_word': ['hsk_lookup'],
  '/tools/lookup_hsk_batch': ['hsk_lookup_batch'],
  '/tools/hsk_random_words': ['hsk_random_words'],
  '/tools/hsk_stats': ['hsk_stats'],
  '/tools/add_mistake': ['mistake_log', { action: 'add' }],
  '/tools/list_mistakes': ['mistake_log', { action: 'list' }],
  '/tools/mark_corrected': ['mistake_log', { action: 'mark_corrected' }],
  '/tools/get_student_profile': ['student_profile', { action: 'get_full' }],
  '/tools/update_personal': ['student_profile', { action: 'update_personal' }],
  '/tools/update_learning': ['student_profile', { action: 'update_learning' }],
  '/tools/add_history': ['student_profile', { action: 'add_history' }],
  '/tools/get_history': ['student_profile', { action: 'get_history' }],
  '/tools/get_due_cards': ['fsrs_schedule', { action: 'get_due' }],
  '/tools/schedule_review': ['fsrs_schedule', { action: 'review' }],
  '/tools/add_fsrs_card': ['fsrs_schedule', { action: 'add' }]
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(new Error('invalid JSON: ' + (e as Error).message))
      }
    })
    req.on('error', reject)
  })
}

function respondJson(res: http.ServerResponse, status: number, body: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  })
  res.end(JSON.stringify(body))
}

async function saveTranscript(payload: any) {
  const studentId = payload.student_id || STUDENT_ID
  const conversationId = payload.conversation_id || `unknown_${Date.now()}`
  const transcript = payload.transcript || []

  const startedAt = new Date().toISOString()
  studentsDb.prepare(`
    INSERT OR REPLACE INTO sessions (id, student_id, tavus_conversation_id, started_at, ended_at, transcript_path, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversationId,
    studentId,
    conversationId,
    startedAt,
    startedAt,
    `${TRANSCRIPT_DIR}/${conversationId}.json`,
    JSON.stringify(transcript).slice(0, 5000)
  )

  try {
    const fs = await import('node:fs/promises')
    await fs.mkdir(TRANSCRIPT_DIR, { recursive: true })
    await fs.writeFile(
      `${TRANSCRIPT_DIR}/${conversationId}.json`,
      JSON.stringify(payload, null, 2)
    )
  } catch (e: any) {
    console.error('[tavus-bridge] failed to write transcript:', e.message)
  }

  return { saved: true, conversation_id: conversationId }
}

/**
 * 创建 bridge HTTP server（暴露供测试用）
 */
export function createBridgeServer(
  callTool: (name: string, params: any) => Promise<any>,
  options: { studentId?: string } = {}
): http.Server {
  const studentId = options.studentId || STUDENT_ID

  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      respondJson(res, 204, {})
      return
    }

    const url = req.url || '/'

    if (url === '/health' && req.method === 'GET') {
      respondJson(res, 200, { ok: true, student_id: studentId })
      return
    }

    if (url in TOOL_MAP && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const [toolName, defaults] = TOOL_MAP[url]
        const params = { ...(defaults || {}), ...body }
        params._student_id = params._student_id || studentId
        const result = await callTool(toolName, params)
        respondJson(res, 200, { ok: true, result })
      } catch (e: any) {
        respondJson(res, 500, { ok: false, error: e.message })
      }
      return
    }

    if (url === '/webhook/tavus/transcript' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const result = await saveTranscript(body)
        respondJson(res, 200, { ok: true, ...result })
      } catch (e: any) {
        respondJson(res, 500, { ok: false, error: e.message })
      }
      return
    }

    respondJson(res, 404, { error: 'not found', url })
  })
}

/**
 * 启动 bridge server（暴露供测试用）
 * 返回 { server, port }，port = 0 时系统分配
 */
export function startBridgeServer(
  callTool: (name: string, params: any) => Promise<any>,
  options: { port?: number; studentId?: string } = {}
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const port = options.port ?? DEFAULT_PORT
    const server = createBridgeServer(callTool, { studentId: options.studentId })
    server.on('error', reject)
    server.listen(port, () => {
      const addr = server.address() as AddressInfo
      resolve({ server, port: addr.port })
    })
  })
}

export default function (pi: ExtensionAPI) {
  const callTool = async (name: string, params: any) => {
    return await pi.call(name, params)
  }

  startBridgeServer(callTool, { port: DEFAULT_PORT })
    .then(({ port }) => {
      console.log(`[tavus-bridge] listening on http://localhost:${port}`)
      console.log(`[tavus-bridge] student_id: ${STUDENT_ID}`)
      console.log(`[tavus-bridge] health: GET /health`)
      console.log(`[tavus-bridge] tool calls: POST /tools/<name>`)
    })
    .catch((e: Error) => {
      console.error('[tavus-bridge] failed to start:', e.message)
    })
}
