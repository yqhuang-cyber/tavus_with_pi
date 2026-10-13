#!/usr/bin/env -S npx tsx
/**
 * 创建 Kai Persona (PAL) on Tavus
 *
 * 用法:
 *   TAVUS_API_KEY=xxx npx tsx scripts/tavus/create-kai-pal.ts
 *   TAVUS_API_KEY=xxx REPLICA_ID=r1xxxxx npx tsx scripts/tavus/create-kai-pal.ts
 *
 * 前置:
 *   1. 注册 Tavus: https://platform.tavus.io
 *   2. 在 Tavus 平台选一个 stock replica，拿到 replica_id (rxxxxxxxx)
 *   3. 设置环境变量 TAVUS_API_KEY 和 REPLICA_ID
 *
 * 产出:
 *   - 控制台输出 persona_id (p_xxxxxxxx)
 *   - 写入 .env.tavus: PERSONA_ID=p_xxxxx
 *   - 上传 14 工具 schema 到 Tavus (用 update_persona)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import axios from 'axios'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

const TAVUS_API_KEY = process.env.TAVUS_API_KEY
const REPLICA_ID = process.env.REPLICA_ID || 'r79ed31c7a13'  // Tavus stock replica 默认值
const PIPELINE_MODE = process.env.PIPELINE_MODE || 'full'  // full | echo
const PERSONA_NAME = process.env.PERSONA_NAME || 'Kai (中文教师)'

if (!TAVUS_API_KEY) {
  console.error('❌ TAVUS_API_KEY 环境变量必填')
  console.error('   1. 登录 https://platform.tavus.io/api-keys')
  console.error('   2. 创建 API key')
  console.error('   3. 重新执行: TAVUS_API_KEY=xxx npx tsx scripts/tavus/create-kai-pal.ts')
  process.exit(1)
}

const TAVUS_BASE = 'https://tavusapi.com/v2'

// 读 system_prompt 模板（pal_prompt.md）和 tools schema
const PAL_PROMPT_FILE = resolve(REPO_ROOT, 'scripts/tavus/pal_prompt.md')
const TOOLS_SCHEMA_FILE = resolve(REPO_ROOT, 'scripts/tavus/tools_schema.json')

if (!existsSync(PAL_PROMPT_FILE)) {
  console.error(`❌ 找不到 ${PAL_PROMPT_FILE}`)
  process.exit(1)
}

if (!existsSync(TOOLS_SCHEMA_FILE)) {
  console.error(`❌ 找不到 ${TOOLS_SCHEMA_FILE}`)
  process.exit(1)
}

const systemPrompt = readFileSync(PAL_PROMPT_FILE, 'utf-8')
const toolsSchema = JSON.parse(readFileSync(TOOLS_SCHEMA_FILE, 'utf-8'))

console.log('📋 配置信息：')
console.log(`   Persona name: ${PERSONA_NAME}`)
console.log(`   Replica ID:   ${REPLICA_ID}`)
console.log(`   Pipeline:     ${PIPELINE_MODE}`)
console.log(`   System prompt: ${systemPrompt.length} 字符`)
console.log(`   Tools:        ${toolsSchema.length} 个`)
console.log('')

async function createPersona() {
  console.log('🚀 POST /v2/personas ...')
  const payload: any = {
    persona_name: PERSONA_NAME,
    replica_id: REPLICA_ID,
    system_prompt: systemPrompt,
    context: '',  // conversational_context 留空，由 tavus-bridge 动态注入 4 画像
    layers: {
      llm: {
        model: 'gpt-4o',
        tools: toolsSchema,
      },
      perception: {
        // Raven-0 perception: 启用视觉理解
        perception_enabled: true,
      },
    },
  }

  if (PIPELINE_MODE === 'echo') {
    payload.layers.llm.pipeline_mode = 'echo'
  }

  const res = await axios.post(`${TAVUS_BASE}/personas`, payload, {
    headers: {
      'x-api-key': TAVUS_API_KEY,
      'Content-Type': 'application/json',
    },
  })

  return res.data
}

async function getPersona(personaId: string) {
  const res = await axios.get(`${TAVUS_BASE}/personas/${personaId}`, {
    headers: { 'x-api-key': TAVUS_API_KEY },
  })
  return res.data
}

async function main() {
  try {
    const data = await createPersona()
    const personaId = data.persona_id || data.id

    console.log('✅ Persona 创建成功！')
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  persona_id: ${personaId}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('📝 下一步：')
    console.log('   1. 在 Tavus Playground 测一次:')
    console.log(`      https://platform.tavus.io/personas/${personaId}`)
    console.log('   2. 验证 4 工具调用正常')
    console.log('   3. 把 persona_id 存到 .env:')
    console.log('')

    // 写入 .env.tavus
    const envLine = `PERSONA_ID=${personaId}\n`
    const envFile = resolve(REPO_ROOT, '.env.tavus')
    writeFileSync(envFile, envLine)
    console.log(`   已保存到 ${envFile}`)

    // 再 fetch 一次，列出配置确认
    const fetched = await getPersona(personaId)
    console.log('')
    console.log('🔍 验证配置：')
    console.log(`   name:           ${fetched.persona_name}`)
    console.log(`   replica_id:     ${fetched.replica_id}`)
    console.log(`   system_prompt:  ${fetched.system_prompt?.length || 0} 字符`)
    console.log(`   tools count:    ${fetched.layers?.llm?.tools?.length || 0}`)
  } catch (e: any) {
    console.error('❌ 创建失败：')
    if (e.response) {
      console.error(`   ${e.response.status} ${e.response.statusText}`)
      console.error('   ', JSON.stringify(e.response.data, null, 2).slice(0, 1000))
    } else {
      console.error('   ', e.message)
    }
    process.exit(1)
  }
}

main()
