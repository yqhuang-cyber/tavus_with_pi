#!/usr/bin/env -S npx tsx
/**
 * 验证 tavus-bridge 路由 vs tools_schema.json 一致
 * - 所有 schema 工具名都有对应的 /tools/<name> 路由
 * - 所有 /tools/<name> 路由都有 schema
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { TOOL_MAP } from '../../extensions/tavus-bridge.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

const schemaTools = JSON.parse(readFileSync(resolve(REPO_ROOT, 'scripts/tavus/tools_schema.json'), 'utf-8'))

// URL 路径格式: /tools/<name>
const schemaUrls = new Set(schemaTools.map((t: any) => `/tools/${t.name}`))
const routeUrls = new Set(Object.keys(TOOL_MAP))

console.log(`📊 Schema URLs: ${schemaUrls.size}`)
console.log(`📊 Route URLs:  ${routeUrls.size}`)
console.log()

const inSchemaNotRoute = [...schemaUrls].filter((u: any) => !routeUrls.has(u))
const inRouteNotSchema = [...routeUrls].filter((u: any) => !schemaUrls.has(u))

if (inSchemaNotRoute.length > 0) {
  console.log('❌ Schema 有但路由没:')
  inSchemaNotRoute.forEach((u: any) => console.log(`   - ${u}`))
}

if (inRouteNotSchema.length > 0) {
  console.log('❌ 路由有但 Schema 没:')
  inRouteNotSchema.forEach((u: any) => console.log(`   - ${u}`))
}

if (inSchemaNotRoute.length === 0 && inRouteNotSchema.length === 0) {
  console.log('✅ Schema ↔ Route 完全对齐')
}

console.log()
console.log('📋 HTTP 路由 → Pi 内部工具映射:')
Object.entries(TOOL_MAP).forEach(([route, [tool]]) => {
  console.log(`   ${route}  →  ${tool}`)
})
