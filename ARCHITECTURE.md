# 技术架构 · Tavus + Pi 中文教学 Agent

> 基于 [Pi Coding Agent](https://pi.dev)（agent harness）+ [Tavus CVI](https://tavus.io)（实时视频对话层）的对外中文教学 agent 完整技术方案。

## 1. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│  前端层：Web / iOS / Android                                 │
│  - React 组件（@tavus/cvi-ui）                              │
│  - 摄像头 + 麦克风授权                                      │
│  - WebRTC 客户端（Daily SDK）                                │
└──────────────────────────────────────────────────────────────┘
                          ↕ WebRTC / Daily
┌──────────────────────────────────────────────────────────────┐
│  视频对话层：Tavus CVI（SaaS 托管）                          │
│                                                              │
│  ┌─ 感知输入 ──────────────────────────────────────────┐   │
│  │  Raven-1: 表情+语气+视线+姿势 NL 描述                │   │
│  │  Sparrow-1: turn-taking 帧级预测（55ms 中位延迟）     │   │
│  │  STT: 实时转录                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─ 推理层（LLM 可换）─────────────────────────────────┐   │
│  │  GPT-4o / Claude / 自托管模型                       │   │
│  │  Function Calling → 调到 Pi 的工具                  │   │
│  │  Knowledge Base（Tavus 自带，30ms 检索）             │   │
│  │  Persistent Memory（跨 session 记忆）               │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─ 输出层 ─────────────────────────────────────────────┐   │
│  │  TTS: 实时语音合成（Cartesia / ElevenLabs）          │   │
│  │  Phoenix-4.5: 脸 + 嘴型 + 表情（35-40fps，134ms）    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          ↕ Function Calling / MCP / Webhook
┌──────────────────────────────────────────────────────────────┐
│  Agent 大脑层：Pi（自托管）                                  │
│                                                              │
│  ┌─ Pi Core（4 个 npm 包）───────────────────────────┐    │
│  │  pi-coding-agent（CLI 入口、批处理）                │    │
│  │  pi-agent-core（agent 循环、状态机）                │    │
│  │  pi-ai（统一 LLM API）                              │    │
│  │  pi-tui（CLI 调试界面）                             │    │
│  └──────────────────────────────────────────────────────┘    │
│                          ↓                                  │
│  ┌─ 你写的 Extensions（TS）────────────────────────────┐    │
│  │  zh-tutor 教学逻辑（HSK 等级控制、纠错策略）         │    │
│  │  hsk-vocab 词库查询工具                             │    │
│  │  mistake-book 错题记录工具                          │    │
│  │  fsrs-scheduler 间隔重复调度                        │    │
│  │  student-profile 学生画像管理                       │    │
│  │  tavus-bridge Tavus 通信适配（function call 路由）  │    │
│  └──────────────────────────────────────────────────────┘    │
│                          ↓                                  │
│  ┌─ Skills（Markdown）─────────────────────────────────┐    │
│  │  skill: 对话练习 / skill: 写作批改                  │    │
│  │  skill: 词汇测试 / skill: 语法讲解                  │    │
│  │  skill: HSK 备考 / skill: 情景模拟                  │    │
│  └──────────────────────────────────────────────────────┘    │
│                          ↓                                  │
│  ┌─ System / AGENTS.md ────────────────────────────────┐    │
│  │  人设：耐心老师 / 全中文 / 纠错先肯定               │    │
│  │  教学法：苏格拉底式 / 渐进式 / HSK 控制             │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          ↕ MCP / RAG / SQL
┌──────────────────────────────────────────────────────────────┐
│  数据层                                                      │
│                                                              │
│  ┌─ 学生画像 ──────────────────────────────────────────┐    │
│  │  HSK 等级、目标、错题本、学习统计                    │    │
│  │  SQLite (本地) / Cloudflare D1 (云)                  │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ 知识库 ─────────────────────────────────────────────┐    │
│  │  HSK 3.0 词表 11,000 词（pinyin/释义/例句/HSK 等级） │    │
│  │  448 语法点                                            │    │
│  │  214 部首                                              │    │
│  │  7000+ 例句库                                          │    │
│  │  PostgreSQL + pgvector (语义搜索)                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ 间隔重复 ───────────────────────────────────────────┐    │
│  │  FSRS 状态（每张卡的稳定性/难度/下次复习时间）       │    │
│  │  复习日志                                              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          ↕ HTTP
┌──────────────────────────────────────────────────────────────┐
│  基础设施                                                    │
│                                                              │
│  - Cloudflare Workers / Vercel Edge（前端 + Pi 部署）        │
│  - Tavus CVI（SaaS，按分钟计费）                              │
│  - Daily.co（WebRTC 传输，托管）                              │
│  - LLM API（Claude / GPT / DeepSeek）                        │
│  - 监控：Langfuse / Sentry / 自建 trace                       │
│  - 支付：Stripe / 微信 / 支付宝                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 2. Pi 和 Tavus 的职责划分

### Tavus 负责"硬件层"

| 能力 | Tavus 模块 |
|------|----------|
| 看到学生表情 | Raven-1 |
| 听到学生声音 | STT |
| 知道学生什么时候说完 | Sparrow-1 |
| 渲染人脸 | Phoenix-4.5 |
| 实时转录 | built-in |
| 视频/音频传输 | WebRTC (Daily) |

**Tavus 解决的问题**：让学生感觉在跟"一个会动的人"说话，而不是跟一个文字框对话。

### Pi 负责"软件层"

| 能力 | Pi 模块 |
|------|--------|
| 教学策略 | Skills + System Prompt |
| 查 HSK 词库 | Extension (`hsk-vocab`) |
| 错题本管理 | Extension (`mistake-book`) |
| 复习调度 | Extension (`fsrs-scheduler`) |
| 学生画像 | Extension (`student-profile`) |
| 进度分析 | Extension (`analytics`) |
| 备课/测试 | Skills（写作批改、词汇测试等） |
| 跨 session 记忆 | SQLite + D1 |

**Pi 解决的问题**：让那个"会动的人"教得好——个性化、记得住、跟得上进度。

### Function Calling 是桥梁

Tavus LLM 调 Pi 的工具：

```json
{
  "tools": [
    {
      "name": "lookup_hsk_word",
      "description": "查 HSK 词汇（拼音/释义/等级/例句）",
      "parameters": { "word": { "type": "string" } }
    },
    {
      "name": "add_mistake",
      "description": "记录学生错过的词或语法",
      "parameters": {
        "type": { "type": "string", "enum": ["vocab", "grammar"] },
        "item": { "type": "string" },
        "context": { "type": "string" }
      }
    },
    {
      "name": "get_student_profile",
      "description": "查学生当前水平、最近错题、目标",
      "parameters": {}
    },
    {
      "name": "schedule_review",
      "description": "基于 FSRS 算法记录/获取今日待复习卡片",
      "parameters": {
        "action": { "type": "string", "enum": ["add", "get_due"] }
      }
    }
  ]
}
```

## 3. 一次完整对话的数据流

```
学生（摄像头+麦克风）:
  "我...我想点...个宫保鸡丁"  [语速慢、犹豫、眼神看菜单]
                          ↓
Tavus CVI 端:
  - Raven-1 持续输出: "学生坐直、看着屏幕、语速慢、有犹豫停顿"
  - Sparrow 帧级判断: 持续到 3000ms → "用户说完了"
  - STT 转录: "我...我想点...个宫保鸡丁"
                          ↓
Tavus LLM（GPT-4o / Claude，可换）:
  1. 看到: "学生坐直、看着屏幕、语速慢、有犹豫停顿"
  2. 看到: 转录 = "我...我想点...个宫保鸡丁"
  3. 决策:
     a) 调 lookup_hsk_word("宫保鸡丁")
        → 返回 {hsk: 4, pinyin: "gōng bǎo jī dīng", meaning: "..."}
     b) 调 add_mistake(type="grammar", item="量词 个", context="应该是 '一份' 不是 '一个'")
     c) 调 get_student_profile()
        → 返回 {hsk: 3, recent_mistakes: [...]}
  4. 生成中文回复:
     "好的，宫保鸡丁！发音很准，gōng bǎo jī dīng。👍
      不过'点菜'的时候，我们一般说'一份宫保鸡丁'或者'一个宫保鸡丁'。
      '份'是用在'菜'前面的量词，下次可以试试——'我要一份宫保鸡丁'。跟我读一遍？"
                          ↓
Tavus CVI 输出层:
  - TTS: 中文语音合成 (Cartesia / ElevenLabs)
  - Phoenix-4.5: 老师微微点头、表情鼓励、嘴型同步
  - WebRTC: 推流给学生
                          ↓
学生看到+听到: 一个会动会说话的中文老师在纠正自己
                          ↓
课后（异步）:
  - Tavus webhook → Pi (callback_url)
  - 完整 transcript 存到 student-profile
  - 错题本 +1（"量词 个 vs 份"）
  - FSRS: 错题卡片进入调度
  - 明天复习时 Pi 主动拉出来
```

## 4. Pi 这边的具体实现

### 4.1 Extension: tavus-bridge（关键桥接）

```typescript
// ~/.pi/agent/extensions/tavus-bridge.ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  // 启动 HTTP server 接收 Tavus 的 function call
  pi.registerHttpServer({
    port: 7123,
    routes: [
      {
        path: '/tools/lookup_hsk_word',
        method: 'POST',
        handler: async (req) => {
          const { word } = req.body
          return await pi.call('hsk_lookup', { word })
        }
      },
      {
        path: '/tools/add_mistake',
        method: 'POST',
        handler: async (req) => {
          const { type, item, context } = req.body
          return await pi.call('mistake_log', {
            action: 'add', type, item, mistake: context
          })
        }
      },
      {
        path: '/tools/get_student_profile',
        method: 'POST',
        handler: async (req) => {
          return await pi.call('student_profile', { action: 'get' })
        }
      }
    ]
  })

  // 在会话开始注入学生画像
  pi.on('session_start', async (ctx) => {
    const profile = await pi.call('student_profile', { action: 'get' })
    return {
      prependContext: `
当前学生画像：
- HSK 等级: ${profile.hskLevel}（目标 HSK ${profile.target}）
- 最近错题: ${profile.recentMistakes.slice(0, 5).join('、')}
- 今日待复习: ${profile.dueCardsCount} 张
- 学习天数: ${profile.streakDays}
`
    }
  })
}
```

### 4.2 Extension: hsk-vocab

```typescript
// ~/.pi/agent/extensions/hsk-vocab.ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import Database from 'better-sqlite3'

const db = new Database('~/.zh-tutor/hsk-vocab.db')

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'hsk_lookup',
    description: '查 HSK 词汇。返回 pinyin/释义/HSK 等级/例句。',
    parameters: {
      word: { type: 'string', description: '要查的中文词' }
    },
    execute: async ({ word }) => {
      const stmt = db.prepare(`
        SELECT word, pinyin, hsk_level, meaning, examples
        FROM hsk_vocab
        WHERE word = ? OR pinyin = ?
        LIMIT 1
      `)
      return stmt.get(word, word)
    }
  })
}
```

### 4.3 Skill: 对话练习

```markdown
<!-- ~/.pi/agent/skills/zh-dialogue/SKILL.md -->
---
name: zh-dialogue
description: 跟学生进行情景对话。控制难度、提供即时反馈、追踪使用过的词汇。Use when student enters /对话 or asks for scenario practice.
---

## 触发场景
- 学生输入 `/对话`
- 学生说"练习一下点餐/问路/..."

## 工作流程
1. 问学生目标情景和水平（HSK 几级）
2. 进入角色扮演（用 Tavus 视频对话）
3. 关键规则：
   - 学生每错一次，对话结束总结时拎出来
   - 对话中只用 HSK 等级内的词
   - 每次回复结尾标出 2-3 个"今日新词"
4. 5-10 轮后自动结束，生成会话报告

## 反馈格式
- 即时：通过 Tavus 视频（老师点头/纠正嘴型）
- 总结：错误清单 + 推荐复习词汇
- 持久化：写到 mistake-book
```

### 4.4 SYSTEM.md（教学人设）

```markdown
<!-- ~/.pi/agent/SYSTEM.md（全局） -->

你是"小语"，一个耐心的中文老师。

## 教学原则
1. 永远全中文交流，必要时英文辅助
2. 用 HSK 词汇范围控制难度（学生水平由 student-profile 注入）
3. 纠错顺序：先肯定 → 再说错在哪 → 给正确形式 → 解释语法
4. 每段回复结尾留一个"小提问"或"小练习"
5. 鼓励为主，不直接否定

## 工具使用
- 调 hsk_lookup 查词
- 调 mistake_book 记录错题
- 调 student_profile 看画像
- 调 fsrs_schedule 安排复习

## 限制
- 不编造不存在的信息
- 不知道的词老实说"这个词我不在 HSK 范围内"
- 不在 HSK 等级外用生词
```

## 5. Pi + Tavus 通信方式（三种可选）

### 方案 A：Function Calling（MCP 风格）

```
Tavus LLM ←→ Function Call HTTP → Pi 工具
                （带 session_id 标识学生）
```

- **优点**：解耦，Pi 可以独立测试
- **缺点**：每次 function call 走 HTTP 几毫秒延迟

### 方案 B：Webhook 异步

```
Tavus → webhook (transcript_ready) → Pi 异步处理
Pi → Tavus REST API → 创建新 conversation
```

- **优点**：完全异步，Pi 不用永远在线
- **缺点**：实时反馈差

### 方案 C（推荐）：`echo` pipeline 模式

**Tavus 不管 LLM，只管"脸"**。整个对话逻辑走 LiveKit Agents + Pi。

```python
# livekit_agent.py
from livekit import agents
from livekit.agents import AgentServer, AgentSession
from livekit.plugins import tavus, openai, deepgram, elevenlabs

server = AgentServer()

@server.rtc_session()
async def my_agent(ctx):
    session = AgentSession(
        stt=deepgram.STT(),
        llm=openai.LLM(model="gpt-4o"),  # 或 Pi 调自家
        tts=elevenlabs.TTS(),
    )

    avatar = tavus.AvatarSession(
        replica_id="rc9cff32ceba",
        persona_id="pcb7a34da5fe",  # pipeline_mode=echo
    )
    await avatar.start(session, room=ctx.room)
    await session.start(room=ctx.room)
```

- **优点**：Tavus 退化成"出脸"，整个对话流控你说了算
- **缺点**：你得自己接 STT/TTS/LLM（可以接 Pi 自己的）

## 6. 数据持久化层

### 学生画像 schema

```sql
-- ~/.zh-tutor/student.db

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  hsk_level INTEGER,
  target_level INTEGER,
  native_lang TEXT,
  started_at TIMESTAMP,
  total_minutes INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0
);

CREATE TABLE mistakes (
  id INTEGER PRIMARY KEY,
  student_id TEXT,
  type TEXT,  -- 'vocab' | 'grammar' | 'pronunciation'
  item TEXT,
  context TEXT,
  corrected_count INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  last_seen_at TIMESTAMP
);

CREATE TABLE fsrs_cards (
  id INTEGER PRIMARY KEY,
  student_id TEXT,
  card_id TEXT,
  stability REAL,
  difficulty REAL,
  due_date TIMESTAMP,
  last_review TIMESTAMP,
  state TEXT  -- 'new' | 'learning' | 'review' | 'relearning'
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  tavus_conversation_id TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  transcript_path TEXT,
  summary TEXT,
  new_mistakes INTEGER,
  cards_reviewed INTEGER
);
```

## 7. Harness 设计：模型与 Harness 的边界

按 `Agent = Model + Harness` 公式拆解：

| 层 | 谁负责 | 实现 |
|---|--------|------|
| **模型** | LLM API | Claude / GPT / DeepSeek |
| **Agent Loop** | Tavus（实时对话）/ Pi（教学逻辑）| 各自独立 |
| **Tools** | Pi extensions | `hsk_lookup`, `mistake_log`, `fsrs_schedule` |
| **Skills** | Pi skills | 对话练习、写作批改 |
| **Memory** | Pi 文件 + SQLite | 跨 session 学生画像 |
| **Sandbox** | Tavus（隔离音视频）/ Pi YOLO 模式 | |
| **Guardrails** | Tavus Objectives & Guardrails | 不能教错的内容、医疗边界 |
| **Observability** | Langfuse / 自建 | 教学决策 trace |

**Pi 在这里是"教学 agent 的 harness"**——负责"教得好"的所有非模型逻辑。

## 8. Tavus 闭循环 journey（为什么不是级联）

```
麦克风 ─→ [Raven-1] ─┐
        音视频融合    │感知描述       ┌─[LLM]──┐
        (100ms)      ↓              │ 推理   │
        持续滚出 NL   "用户犹豫中"  │500ms  │(决策)
        句子级                      │       ↓
        300ms 内                    │  内容+情绪+动作
        不超过                     │       │
                                   │       ↓
麦克风 ─→ [Sparrow] ─┐             │  ┌─────────┐
        持续抢话检测 │流控          │  │Phoenix-4.5│
        55ms 帧率    ↓             │  │ 人脸渲染  │
        100% 精确召回│"他还没说完,  │  │ 35-40fps │
        0 中断       继续等"        │  │ 134ms    │
                    ↓              │  │ 音画同步  │
                    决定 LLM 何时   │  └─────────┘
                    开始/继续/放弃   │
                                   ↓
                            ─→ 扬声器
```

**关键观察**：
1. **Raven 和 Sparrow 不在 ASR 之后**——它们**直接在原始音频上跑**
2. **LLM 看到的不是裸转录**——是 Raven 给的**自然语言感知描述**
3. **LLM 还没等用户说完就开始推理**——**speculative inference**（投机性推理）
4. **Phoenix 是单独的"脸"输出**——它和 TTS 是**两条平行通道**

**Tavus 端到端延迟 ~500ms**——比级联（400-1100ms）快，比纯 S2S（100-330ms）慢，但**保留模块化和可调试性**。

## 9. 部署架构

### 小规模（< 100 学员）

```
Vercel / Cloudflare Workers（前端 + Pi API）
  ↓
SQLite（学生数据，本地 + 备份）
  ↓
Tavus CVI（SaaS）
  ↓
LLM API（Claude / GPT）
```

### 中规模（100-10000 学员）

```
- 前端：Cloudflare Pages
- Pi 后端：VPS / Fly.io（每个学生一个隔离 agent context）
- 数据库：Supabase / Cloudflare D1
- Tavus：SaaS（按分钟计费）
- 监控：Langfuse Cloud
- CDN：Cloudflare
```

### 大规模（> 10000 学员）

```
- Pi runtime：Kubernetes（用 K8s 跑 Pi 扩展池）
- 数据库：PostgreSQL + pgvector
- 缓存：Redis（学生画像热缓存）
- 队列：RabbitMQ（处理 transcript 异步分析）
- Tavus：企业版合同
- LLM：自托管 + 多个 provider
- 监控：Grafana + OpenTelemetry
```

## 10. 实施路线图（12 周）

| Week | 目标 | 关键交付 |
|------|------|---------|
| 1-2 | MVP | 装 Pi + Tavus MCP，stock replica 跑通一次对话 |
| 3-4 | 数据层 | HSK 3 词库（500 词）+ 错题本（SQLite） |
| 5-8 | 复习+画像 | FSRS 调度 + 学生画像 + 完整 lesson flow |
| 9-12 | Beta | 10 个 beta 用户 + 收集 transcript 优化 |

**不要一上来就**：
- 训练自己的 face（4-6 小时成本高）
- 写完整 HSK 1-6（11k 词）
- 做付费墙（先用免费试用验证假设）

## 11. 关键设计原则

1. **解耦优先**：Pi 教学逻辑跟 Tavus 视频 pipeline 完全分离，任一挂了另一个能降级
2. **可观测**：每一步 trace 进 Langfuse——Raven 输出、Tavus 决策、Pi 工具调用、最终回复
3. **可扩展**：加 HSK 等级数据不动代码，加教学法写新 skill，加语言换 system_prompt
4. **可降级**：Tavus 挂了走纯文字版，LLM 慢换便宜模型，离线用本地缓存
5. **符合 Pi 哲学**：minimal core + everything is hook（extensions + skills + 词库 + 算法全是 hook）

## 12. 参考资料

- Pi 官网：https://pi.dev
- Pi 文档：https://pi.dev/docs/latest
- Tavus API 文档：https://docs.tavus.io
- Tavus MCP Server：https://github.com/rakeshdavid/Tavus-MCP
- FSRS 算法：https://github.com/open-spaced-repetition/fsrs4anki
- HSK 3.0 词表：见 `data/hsk-vocab-schema.md`

---

📐 架构 · 🗺️ 路线 → [docs/implementation-roadmap.md](./docs/implementation-roadmap.md)
