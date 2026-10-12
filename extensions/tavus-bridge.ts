/**
 * Tavus Function Call 桥接
 *
 * 把 Tavus LLM 的工具调用转到 Pi 内部工具
 * 接收 Tavus 课后 webhook 保存 transcript
 *
 * 状态：🟡 TODO — 等待定稿
 * 完整实现参考：docs/pi-extensions-guide.md 第 5.5 节
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  // HTTP server 接收 Tavus function call
  pi.registerHttpServer({
    port: 7123,
    routes: [
      { path: '/tools/lookup_hsk_word', method: 'POST', handler: bridge('hsk_lookup') },
      { path: '/tools/add_mistake', method: 'POST', handler: bridge('mistake_log', { action: 'add' }) },
      { path: '/tools/get_student_profile', method: 'POST', handler: bridge('student_profile', { action: 'get' }) },
      { path: '/tools/schedule_review', method: 'POST', handler: bridge('fsrs_schedule') },

      // Tavus 课后回调：保存 transcript
      {
        path: '/webhook/tavus/transcript',
        method: 'POST',
        handler: async (req: any) => {
          const { conversation_id, transcript, student_id } = req.body
          await saveTranscript({ conversation_id, transcript, student_id })
          return { ok: true }
        }
      }
    ]
  })
}

function bridge(toolName: string, defaults: any = {}) {
  return async (req: any, ctx: any) => {
    const params = { ...defaults, ...req.body }
    return await ctx.call(toolName, params)
  }
}

async function saveTranscript({ conversation_id, transcript, student_id }: any) {
  // TODO: 存到 Pi session storage 或外部数据库
  console.log(`[tavus-bridge] 保存 transcript: ${conversation_id} for ${student_id}`)
}
