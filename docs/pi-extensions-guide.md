# Pi 扩展开发指南

> Pi 的所有教学能力都是通过 extension + skill 实现的。这份文档讲怎么写、怎么调试、怎么部署。

## Pi 的扩展机制

Pi 提供 4 类自定义点：

| 类型 | 形式 | 干啥 |
|------|------|------|
| **Extension** | TypeScript | 工具、命令、事件钩子、HTTP server、UI 组件 |
| **Skill** | Markdown | 教学流程（让 agent 知道"什么时候做什么"） |
| **Prompt** | Markdown | 可复用的提示模板（/name 调用） |
| **Theme** | JSON | TUI 外观 |

**优先级**：
- 简单逻辑 → Markdown（skill/prompt）
- 复杂逻辑/外部系统 → TypeScript（extension）

## Extension 基础

### 最小骨架

```typescript
// ~/.pi/agent/extensions/my-extension.ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  // 在这里注册工具、命令、事件钩子等
}
```

### 注册工具

```typescript
pi.registerTool({
  name: 'my_tool',                              // 工具名（agent 调）
  description: '这个工具干啥',                  // 给 LLM 看的描述
  parameters: {                                 // JSON Schema
    input: { type: 'string', description: '...' },
    count: { type: 'number', description: '...' }
  },
  execute: async (params, ctx) => {             // 执行逻辑
    const result = await doSomething(params)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  }
})
```

**关键点**：
- `description` 是 LLM 看到触发场景的唯一依据，写清楚
- `parameters` 用 JSON Schema 标准
- `execute` 返回 `content` 数组格式

### 注册命令（/开头）

```typescript
pi.registerCommand('mystats', {
  description: '看我的学习统计',
  handler: async (args, ctx) => {
    const stats = await loadStats()
    return { message: `今天学了 ${stats.today} 词，本周 ${stats.week} 词` }
  }
})
```

用户用 `/mystats` 触发。

### 事件钩子

```typescript
// 会话开始
pi.on('session_start', async (ctx) => {
  return { prependContext: '今天学习 HSK 3' }
})

// 工具调用前
pi.on('before_tool_call', async (event, ctx) => {
  if (event.toolName === 'bash' && event.input.command.includes('rm -rf')) {
    return { block: true, reason: '危险命令' }
  }
})

// 工具调用后
pi.on('tool_result', async (event, ctx) => {
  // 自动记录错题
  if (event.toolName === 'hsk_lookup') {
    await logHskUsage(event.input.word)
  }
})

// agent 循环前
pi.on('before_agent_start', async (ctx) => {
  // 注入学生画像
  const profile = await loadProfile()
  return { prependContext: `学生: ${profile.name}, HSK ${profile.level}` }
})
```

**所有钩子**：
- `session_start` / `session_end`
- `before_agent_start` / `after_agent_end`
- `turn_start` / `turn_end`
- `before_tool_call` / `tool_result` / `after_tool_call`
- `context_message`
- `compact`

### HTTP server（关键！给 Tavus 调）

```typescript
pi.registerHttpServer({
  port: 7123,
  routes: [
    {
      path: '/tools/lookup_hsk_word',
      method: 'POST',
      handler: async (req, ctx) => {
        const { word } = req.body
        const result = await ctx.call('hsk_lookup', { word })
        return { result }
      }
    }
  ]
})
```

**这是 Pi + Tavus 通信的核心**——Tavus LLM 调你的 HTTP endpoint，Pi 内部转给对应工具执行。

## 5 个核心扩展的写法

### 1. hsk-vocab（HSK 词库）

```typescript
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'
import path from 'node:path'

const db = new Database(path.join(process.env.HOME!, '.zh-tutor/hsk-vocab.db'))

export default function (pi: ExtensionAPI) {
  // 单次查词
  pi.registerTool({
    name: 'hsk_lookup',
    description: '查 HSK 词汇。返回 pinyin/释义/HSK 等级/例句。如果不在词表返回 not_found。',
    parameters: {
      word: { type: 'string', description: '中文词或拼音' }
    },
    execute: async ({ word }) => {
      const stmt = db.prepare(`
        SELECT word, pinyin, hsk_level, part_of_speech, meaning_en, examples
        FROM hsk_vocab
        WHERE word = ? OR pinyin = ?
        LIMIT 1
      `)
      const row = stmt.get(word, word)
      if (!row) return { found: false, suggestion: suggestSimilar(word) }
      return { found: true, ...row, examples: JSON.parse(row.examples) }
    }
  })

  // 批量查词
  pi.registerTool({
    name: 'hsk_lookup_batch',
    description: '批量查 HSK 词汇。',
    parameters: {
      words: { type: 'array', items: { type: 'string' } }
    },
    execute: async ({ words }) => {
      const stmt = db.prepare(`
        SELECT word, pinyin, hsk_level, meaning_en
        FROM hsk_vocab WHERE word IN (${words.map(() => '?').join(',')})
      `)
      return stmt.all(...words)
    }
  })

  // 按等级随机抽词（造句练习用）
  pi.registerTool({
    name: 'hsk_random_words',
    description: '随机抽 N 个 HSK 词汇，可限定等级。',
    parameters: {
      count: { type: 'number', description: '抽几个' },
      hsk_level: { type: 'number', description: 'HSK 等级（1-9）', optional: true }
    },
    execute: async ({ count, hsk_level }) => {
      const stmt = hsk_level
        ? db.prepare(`SELECT * FROM hsk_vocab WHERE hsk_level = ? ORDER BY RANDOM() LIMIT ?`)
        : db.prepare(`SELECT * FROM hsk_vocab ORDER BY RANDOM() LIMIT ?`)
      return hsk_level ? stmt.all(hsk_level, count) : stmt.all(count)
    }
  })
}

function suggestSimilar(word: string) {
  // TODO: 找相似词
  return null
}
```

### 2. mistake-book（错题本）

```typescript
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'

const db = new Database(process.env.HOME! + '/.zh-tutor/mistakes.db')

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'mistake_log',
    description: '管理学生错题。add 加错题, list 列错题, mark_corrected 标记已掌握。',
    parameters: {
      action: { type: 'string', enum: ['add', 'list', 'mark_corrected'] },
      type: { type: 'string', enum: ['vocab', 'grammar', 'pronunciation'] },
      item: { type: 'string', description: '错的内容（错的词或语法点）' },
      context: { type: 'string', description: '完整的句子', optional: true }
    },
    execute: async ({ action, type, item, context }, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'
      if (action === 'add') {
        db.prepare(`
          INSERT INTO mistakes (student_id, type, item, context, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(studentId, type, item, context, Date.now(), Date.now())
        return { added: true, item, type }
      }
      if (action === 'list') {
        return db.prepare(`
          SELECT * FROM mistakes
          WHERE student_id = ? AND corrected_count < 3
          ORDER BY last_seen_at DESC
          LIMIT 20
        `).all(studentId)
      }
      if (action === 'mark_corrected') {
        db.prepare(`
          UPDATE mistakes SET corrected_count = corrected_count + 1
          WHERE student_id = ? AND item = ?
        `).run(studentId, item)
        return { marked: true, item }
      }
    }
  })
}
```

### 3. fsrs-scheduler（间隔重复）

```typescript
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'

const db = new Database(process.env.HOME! + '/.zh-tutor/fsrs.db')
const f = fsrs(generatorParameters({ enable_fuzz: true }))

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'fsrs_schedule',
    description: 'FSRS 间隔重复调度。add 加新卡, get_due 拿待复习, review 评分。',
    parameters: {
      action: { type: 'string', enum: ['add', 'get_due', 'review'] },
      card_id: { type: 'string', description: '卡片 ID（词或语法点）' },
      rating: { type: 'number', description: '评分 1-4 (Again/Hard/Good/Easy)' }
    },
    execute: async ({ action, card_id, rating }, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'

      if (action === 'add') {
        const card = createEmptyCard()
        db.prepare(`
          INSERT OR REPLACE INTO fsrs_cards (student_id, card_id, stability, difficulty, due_date, last_review, state)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(studentId, card_id, card.stability, card.difficulty,
               Date.now() + 86400000, Date.now(), State.New)
        return { added: true, card_id }
      }

      if (action === 'get_due') {
        return db.prepare(`
          SELECT * FROM fsrs_cards
          WHERE student_id = ? AND due_date <= ?
          ORDER BY due_date ASC
          LIMIT 20
        `).all(studentId, Date.now())
      }

      if (action === 'review' && rating) {
        const row = db.prepare(`SELECT * FROM fsrs_cards WHERE student_id = ? AND card_id = ?`)
                       .get(studentId, card_id)
        if (!row) return { error: 'card not found' }

        const card = {
          ...row,
          state: State[row.state as keyof typeof State],
          last_review: new Date(row.last_review),
          due: new Date(row.due_date)
        }
        const next = f.next(card, new Date(), rating as Rating)
        const newCard = next[rating as Rating].card

        db.prepare(`
          UPDATE fsrs_cards
          SET stability = ?, difficulty = ?, due_date = ?, last_review = ?, state = ?
          WHERE student_id = ? AND card_id = ?
        `).run(newCard.stability, newCard.difficulty,
               newCard.due.getTime(), Date.now(),
               State[newCard.state], studentId, card_id)
        return { reviewed: true, next_due: newCard.due }
      }
    }
  })
}
```

### 4. student-profile（学生画像）

```typescript
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'

const db = new Database(process.env.HOME! + '/.zh-tutor/students.db')

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'student_profile',
    description: '管理学生画像。get 查学生, set 更新学生信息, add_session 加会话记录。',
    parameters: {
      action: { type: 'string', enum: ['get', 'set', 'add_session'] },
      hsk_level: { type: 'number' },
      target_level: { type: 'number' },
      native_lang: { type: 'string' },
      duration_min: { type: 'number' }
    },
    execute: async (params, ctx) => {
      const studentId = ctx.session.metadata?.studentId ?? 'default'

      if (params.action === 'get') {
        const student = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
        const recentMistakes = db.prepare(`
          SELECT item, type FROM mistakes
          WHERE student_id = ? AND corrected_count < 3
          ORDER BY last_seen_at DESC LIMIT 10
        `).all(studentId)
        const dueCards = db.prepare(`
          SELECT COUNT(*) as count FROM fsrs_cards
          WHERE student_id = ? AND due_date <= ?
        `).get(studentId, Date.now())
        return { ...student, recent_mistakes: recentMistakes, due_cards: dueCards.count }
      }

      if (params.action === 'set') {
        db.prepare(`
          INSERT OR REPLACE INTO students (id, hsk_level, target_level, native_lang)
          VALUES (?, ?, ?, ?)
        `).run(studentId, params.hsk_level, params.target_level, params.native_lang)
        return { updated: true }
      }

      if (params.action === 'add_session') {
        db.prepare(`
          UPDATE students
          SET total_minutes = total_minutes + ?
          WHERE id = ?
        `).run(params.duration_min, studentId)
        return { added: true }
      }
    }
  })

  // 关键钩子：会话开始时注入画像
  pi.on('session_start', async (ctx) => {
    const studentId = ctx.session.metadata?.studentId ?? 'default'
    const profile = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId)
    if (!profile) return {}

    const recentMistakes = db.prepare(`
      SELECT item, type FROM mistakes
      WHERE student_id = ? AND corrected_count < 3
      ORDER BY last_seen_at DESC LIMIT 5
    `).all(studentId).map((m: any) => `${m.item} (${m.type})`).join('、')

    const dueCount = (db.prepare(`
      SELECT COUNT(*) as count FROM fsrs_cards
      WHERE student_id = ? AND due_date <= ?
    `).get(studentId, Date.now()) as any).count

    return {
      prependContext: `
# 当前学生画像
- 名字: ${profile.name}
- 母语: ${profile.native_lang}
- HSK 等级: ${profile.hsk_level}（目标 HSK ${profile.target_level}）
- 学习天数: ${profile.streak_days}
- 累计学习: ${profile.total_minutes} 分钟
- 最近错题: ${recentMistakes || '无'}
- 今日待复习: ${dueCount} 张

请根据以上画像调整教学难度和风格。
`
    }
  })
}
```

### 5. tavus-bridge（Tavus 通信桥）

```typescript
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  pi.registerHttpServer({
    port: 7123,
    routes: [
      // Tavus LLM 调的工具
      { path: '/tools/lookup_hsk_word', method: 'POST', handler: tavusHandler('hsk_lookup') },
      { path: '/tools/add_mistake', method: 'POST', handler: tavusHandler('mistake_log', { action: 'add' }) },
      { path: '/tools/get_student_profile', method: 'POST', handler: tavusHandler('student_profile', { action: 'get' }) },
      { path: '/tools/schedule_review', method: 'POST', handler: tavusHandler('fsrs_schedule') }
    ]
  })

  // Tavus 课后回调：保存 transcript
  pi.registerHttpRoute({
    path: '/webhook/tavus/transcript',
    method: 'POST',
    handler: async (req) => {
      const { conversation_id, transcript, student_id } = req.body
      await saveTranscript({ conversation_id, transcript, student_id })
      // 触发 Pi 内部分析
      await pi.spawn(async (ctx) => {
        const summary = await ctx.call('analyze_session', { transcript })
        await ctx.call('student_profile', { action: 'add_session', duration_min: summary.minutes })
      })
      return { ok: true }
    }
  })
}

function tavusHandler(toolName: string, defaults: any = {}) {
  return async (req: any, ctx: any) => {
    const params = { ...defaults, ...req.body }
    return await ctx.call(toolName, params)
  }
}
```

## 调试技巧

### 1. CLI 调试

```bash
# 在项目目录启动 pi
cd /workspace/tavus_with_pi
pi

# 加载本地扩展
# .pi/settings.json 加：
{
  "extensions": ["./extensions/*.ts"]
}

# /reload 重载
```

### 2. 用 print 模式测

```bash
pi -p "查 HSK 3 词 '你好' 的意思"
# 输出事件流
```

### 3. 日志

```typescript
// 在扩展里加日志
import { logger } from '@mariozechner/pi-coding-agent'
logger.info('hsk_lookup called', { word })
```

### 4. 单元测试

```typescript
// tests/hsk-vocab.test.ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

describe('hsk_lookup', () => {
  it('should find common word', async () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE hsk_vocab (word TEXT, pinyin TEXT, hsk_level INTEGER)`)
    db.prepare(`INSERT INTO hsk_vocab VALUES (?, ?, ?)`).run('你好', 'nǐ hǎo', 1)

    // 调工具
    // ...
  })
})
```

## 部署到生产

### 用 npm 包发布

```json
// package.json
{
  "name": "@yqhuang/zh-tutor-extensions",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/*.ts"]
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "ts-fsrs": "^1.0.0"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*"
  }
}
```

发到 npm：
```bash
npm publish
```

别人装：
```bash
pi install npm:@yqhuang/zh-tutor-extensions
```

### 项目级配置

`.pi/settings.json`：
```json
{
  "extensions": [
    "./extensions/hsk-vocab.ts",
    "./extensions/mistake-book.ts",
    "./extensions/fsrs-scheduler.ts",
    "./extensions/student-profile.ts",
    "./extensions/tavus-bridge.ts"
  ]
}
```

## 性能注意事项

1. **数据库连接**：每个扩展一个连接，复用，别每次 `new Database`
2. **HTTP server**：Pi 内部已经处理并发，自己别用同步
3. **工具 description**：太长会让 LLM 困惑，写精
4. **avoid blocking**：工具执行要快（< 1s），慢的用 background task

## 常见错误

### ❌ 工具 description 太长
```typescript
// BAD
description: '这个工具用于查询 HSK 词汇数据库中存储的所有中文词汇及其详细的中文释义、英文释义、拼音、声调、HSK 等级、词性、词根、变形、相关词、例句、用法、记忆技巧、HSK 等级等等'
```
```typescript
// GOOD
description: '查 HSK 词汇。返回 pinyin/释义/HSK 等级/例句。'
```

### ❌ 工具返回太啰嗦
```typescript
// BAD
return { content: [{ type: 'text', text: '我已经成功查到了 HSK 词汇"你好"，它的拼音是 nǐ hǎo，HSK 等级是 1 级...' }] }
```
```typescript
// GOOD
return { content: [{ type: 'text', text: JSON.stringify({ word: '你好', pinyin: 'nǐ hǎo', hsk_level: 1, meaning: 'hello' }) }] }
```

### ❌ 把所有逻辑塞一个工具
```typescript
// BAD
name: 'do_everything'  // 查词+记错题+安排复习+生成报告
```
```typescript
// GOOD
name: 'lookup_hsk_word'  // 一个工具做一件事
```

---

📐 架构 · 🗺️ 路线 → [implementation-roadmap.md](./implementation-roadmap.md) · 🤖 PAL → [tavus-pal-prompt.md](./tavus-pal-prompt.md)
