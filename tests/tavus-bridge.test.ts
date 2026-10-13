/**
 * 测试 tavus-bridge 的 HTTP server
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const TEMP_HOME = `/tmp/zh-tutor-bridge-test-${Date.now()}`
process.env.HOME = TEMP_HOME
process.env.STUDENT_ID = 'test-student'

let port: number
let server: http.Server

beforeAll(async () => {
  const fs = await import('node:fs')
  fs.mkdirSync(TEMP_HOME + '/.zh-tutor', { recursive: true })
  const Database = (await import('better-sqlite3')).default
  const db = new Database(TEMP_HOME + '/.zh-tutor/students.db')
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      tavus_conversation_id TEXT,
      started_at TEXT,
      ended_at TEXT,
      transcript_path TEXT,
      summary TEXT,
      last_raven_signals TEXT,
      last_raven_at TEXT
    );
  `)
  db.close()

  vi.mock('@mariozechner/pi-coding-agent', () => ({
    default: {},
    ExtensionAPI: class {},
  }))

  const { startBridgeServer } = await import('../extensions/tavus-bridge.ts')
  const callTool = async (name: string, params: any) => ({ mock: true, tool: name, params })
  const result = await startBridgeServer(callTool, { port: 0, studentId: 'test-student' })
  server = result.server
  port = result.port
  // 等 server 完全 listen
  await new Promise((resolve) => setTimeout(resolve, 50))
})

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  const fs = await import('node:fs')
  fs.rmSync(TEMP_HOME, { recursive: true, force: true })
})

function httpRequest(method: string, url: string, body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: url,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let chunks = ''
        res.on('data', (c) => { chunks += c })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(chunks) })
          } catch (e) {
            resolve({ status: res.statusCode || 0, data: chunks })
          }
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

describe('tavus-bridge HTTP server', () => {
  it('GET /health 应返回 ok', async () => {
    const res = await httpRequest('GET', '/health')
    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.student_id).toBe('test-student')
  })

  it('POST /tools/hsk_stats 应路由到 hsk_stats 工具', async () => {
    const res = await httpRequest('POST', '/tools/hsk_stats', {})
    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.result.tool).toBe('hsk_stats')
  })

  it('POST /tools/add_mistake 应支持 type/item/context', async () => {
    const res = await httpRequest('POST', '/tools/add_mistake', {
      type: 'vocab',
      item: '喜欢',
      context: '我喜欢狗',
    })
    expect(res.status).toBe(200)
    expect(res.data.result.tool).toBe('mistake_log')
    expect(res.data.result.params.item).toBe('喜欢')
  })

  it('GET 不存在的路径返回 404', async () => {
    const res = await httpRequest('GET', '/nonexistent')
    expect(res.status).toBe(404)
  })

  it('POST /webhook/tavus/transcript 应存 transcript', async () => {
    const res = await httpRequest('POST', '/webhook/tavus/transcript', {
      conversation_id: 'test-conv-1',
      transcript: [{ role: 'user', text: '你好' }, { role: 'assistant', text: '你好！' }],
    })
    expect(res.status).toBe(200)
    expect(res.data.saved).toBe(true)
    expect(res.data.conversation_id).toBe('test-conv-1')
  })

  it('POST /webhook/tavus/raven 应存 Raven signals', async () => {
    const res = await httpRequest('POST', '/webhook/tavus/raven', {
      conversation_id: 'test-conv-raven',
      student_id: 'test-student',
      signals: [
        { signal: 'user hesitant, looking away', confidence: 0.85, ts: Date.now() },
        { signal: 'user pauses 3 seconds', confidence: 0.9, ts: Date.now() },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.data.saved).toBe(true)
    expect(res.data.conversation_id).toBe('test-conv-raven')
    expect(res.data.signal_count).toBe(2)
  })

  it('POST /webhook/tavus/raven 多次调用应累积（保留最近 20 条）', async () => {
    // 上一个测试加了 2 条
    for (let i = 0; i < 25; i++) {
      await httpRequest('POST', '/webhook/tavus/raven', {
        conversation_id: 'test-conv-raven',
        signals: [{ signal: `signal ${i}`, confidence: 0.5, ts: Date.now() + i }],
      })
    }
    const res = await httpRequest('POST', '/webhook/tavus/raven', {
      conversation_id: 'test-conv-raven',
      signals: [{ signal: 'final signal', confidence: 1.0 }],
    })
    expect(res.data.signal_count).toBeLessThanOrEqual(20)
  })
})
