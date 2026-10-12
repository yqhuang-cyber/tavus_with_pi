# 开发 Tasking · Ask Kai v1.0

> **教学法严格按 [附件需求](../assets/Ask%20kai%20人设%20-%20大部分适合作为主题式ask%20kai的需求.docx) 来**。
> PRD 中的"定价 / 目标用户 / 成功指标"已全部标记 TBD，由产品决策。

| 字段 | 值 |
|------|---|
| 版本 | v1.0 |
| 总周期 | 12 周 |
| Task 总数 | 30 个 |
| 工作量 | 1 个全职开发 |

---

## 0. 总览

```
Phase 0: 环境与工具链      (Week 1)        ← 4 个 task
Phase 1: Pi 教学内核        (Week 2-5)     ← 9 个 task
Phase 2: Tavus 视频层        (Week 5-7)     ← 6 个 task
Phase 3: 集成与数据流        (Week 7-9)     ← 5 个 task
Phase 4: Beta 与优化         (Week 10-12)   ← 6 个 task
```

**关键依赖链**：
- Phase 0 → 1 → 2 → 3 → 4
- 1 内: 1.1 (student-profile) → 1.5-1.8 (依赖 4 画像)
- 2 内: 2.1 (PAL 创建) → 2.2-2.4 → 2.5 (跑通一次)
- 3 内: 3.1 (tavus-bridge) → 3.2 (webhook) → 3.3-3.5 (数据流)

---

## Phase 0 · 环境与工具链 (Week 1)

### T-001 · 安装 Pi Coding Agent

**目标**：本地有可用的 Pi CLI

**步骤**：
1. `curl -fsSL https://pi.dev/install.sh | sh`
2. `pi --version` 验证
3. `pi` 启动测试，能进 TUI

**产出**：`/usr/local/bin/pi` (或类似路径) + 配置文件目录

**验收**：
- [ ] `pi --version` 输出 ≥ 0.99
- [ ] `pi` 启动 TUI 不报错

**估时**：1 小时

---

### T-002 · 安装 Tavus MCP Server

**目标**：MCP server 跑起来，能调 29 个 Tavus 工具

**步骤**：
1. 注册 [Tavus](https://platform.tavus.io) 账号，拿 API key
2. `npm install -g tavus-mcp`
3. `export TAVUS_API_KEY=...`
4. `npx tavus-mcp` 启动（应该不退出）
5. 配到 Pi：`.pi/settings.json` 加 tavus MCP server

**产出**：`tavus-mcp` 全局安装 + `.pi/settings.json`

**验收**：
- [ ] `npx tavus-mcp` 不报错
- [ ] Pi 能识别 29 个 Tavus 工具

**估时**：30 分钟

---

### T-003 · 初始化 4 个 SQLite 数据库

**目标**：4 个数据库 schema 创建完成

**步骤**：
1. `cd /workspace/tavus_with_pi && npm install --ignore-scripts`
2. `npm run init-db`
3. 验证 4 个 .db 文件创建在 `~/.zh-tutor/`
4. `sqlite3 ~/.zh-tutor/students.db ".schema"` 看表

**产出**：`~/.zh-tutor/{students,mistakes,fsrs,hsk-vocab}.db`

**验收**：
- [ ] 4 个表创建成功
- [ ] students.db 有 4 个画像相关表（students, learning_profiles, learning_history, ongoing_topics, sessions）
- [ ] schema 跟 [data/student-schema.sql](../data/student-schema.sql) 一致

**估时**：1 小时

---

### T-004 · 配置 Pi 加载本地扩展

**目标**：Pi 能识别 extensions/ 下的所有 .ts 文件

**步骤**：
1. 编辑 `/workspace/tavus_with_pi/.pi/settings.json`：
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
2. `cp system/SYSTEM.md ~/.pi/agent/SYSTEM.md`
3. `pi` 启动，输 `/tools` 看是否列出 5 个本地工具
4. `pi -p "/reload"` 测 reload

**产出**：`.pi/settings.json` + `~/.pi/agent/SYSTEM.md`

**验收**：
- [ ] `/tools` 列出 5 个本地工具
- [ ] 输 "查 HSK 3 '你好'" 能调 hsk_lookup

**估时**：1 小时

---

## Phase 1 · Pi 教学内核 (Week 2-5)

### T-101 · 完善 student-profile（4 画像管理）

**目标**：8 个 action 全部实现，能完整管理 4 个画像

**当前状态**：`extensions/student-profile.ts` 是骨架

**步骤**：
1. 实现 8 个 action 的参数验证和 SQL 操作
2. 测试每个 action 用 `pi -p "调 student_profile action=get_personal"`
3. 验证 session_start 钩子正确注入 4 画像

**产出**：完整可用的 `student-profile.ts`

**验收**：
- [ ] 8 个 action 全部能调通
- [ ] session_start 后 system prompt 含 4 画像块
- [ ] 4 画像持久化跨 session 保留

**估时**：1.5 天

**依赖**：T-001, T-003

---

### T-102 · 完善 hsk-vocab（HSK 1 词表）

**目标**：能查 HSK 1 的 300 词

**步骤**：
1. 下载 HSK 1 词表（github g1eny0ung/hsk-words 或类似）
2. 准备 `data/hsk1.json`（含 word, pinyin, hsk_level, part_of_speech, meaning_en, examples）
3. `npm run import-hsk data/hsk1.json` 导入
4. 验证：`sqlite3 ~/.zh-tutor/hsk-vocab.db "SELECT COUNT(*) FROM hsk_vocab WHERE hsk_level=1"`
5. 测 hsk_lookup 工具能查 "你好"

**产出**：`data/hsk1.json` + 数据库 300 词

**验收**：
- [ ] 300 词导入
- [ ] 查 "你好" 返回 {hsk_level: 1, pinyin: "nǐ hǎo", meaning: "hello"}
- [ ] 查不存在的词返回 found: false

**估时**：1.5 天

**依赖**：T-003

---

### T-103 · 完善 mistake-book（错题本）

**目标**：3 个 action 全部实现，能记录和查询错题

**步骤**：
1. 实现 add/list/mark_corrected 三个 action
2. 写单元测试（tests/mistake-book.test.ts）
3. 测：调 `mistake_log action=add type=vocab item=量词 context=我吃一个面`

**产出**：完整 mistake-book.ts

**验收**：
- [ ] 添加错题 < 50ms
- [ ] 列出最近 20 条错题
- [ ] mark_corrected 增加计数

**估时**：1 天

**依赖**：T-003

---

### T-104 · 完善 fsrs-scheduler（间隔重复）

**目标**：3 个 action 实现，集成 ts-fsrs 算法

**步骤**：
1. `npm install ts-fsrs`
2. 实现 add/get_due/review 三个 action
3. 测：加一张卡 → 查 due（应包含） → 评分（应重排 due_date）

**产出**：完整 fsrs-scheduler.ts

**验收**：
- [ ] ts-fsrs 算法集成
- [ ] 评分 1-4 映射到 Rating enum
- [ ] 复习后 due_date 按 FSRS 公式重算

**估时**：1.5 天

**依赖**：T-003

---

### T-105 · 实现 tavus-bridge（HTTP server）

**目标**：Tavus LLM 能调 4 个工具的 HTTP endpoint

**步骤**：
1. 在 tavus-bridge.ts 实现 HTTP server（端口 7123）
2. 路由：POST /tools/{lookup_hsk_word, add_mistake, get_student_profile, schedule_review}
3. webhook：POST /webhook/tavus/transcript 保存 transcript
4. 测：curl POST localhost:7123/tools/lookup_hsk_word -d '{"word":"你好"}'

**产出**：完整 tavus-bridge.ts

**验收**：
- [ ] 4 个 tool 路由可用
- [ ] transcript webhook 保存
- [ ] HTTP server 不阻塞 Pi 主循环

**估时**：1.5 天

**依赖**：T-101 到 T-104

---

### T-106 · 写 SKILL：zh-dialogue

**目标**：完成 [skills/zh-dialogue/SKILL.md](../skills/zh-dialogue/SKILL.md)，包含 5 个常用主题模板

**当前状态**：只有 1 个情景（点餐），需要补全

**步骤**：
1. 补全 4 个主题：问路、面试、购物、聊天
2. 每个主题：关键词 + HSK 1-2 用法 + HSK 3-4 用法 + 示例对话
3. 加错误处理规则

**产出**：完整的 zh-dialogue skill

**验收**：
- [ ] 5 个主题全部覆盖
- [ ] 每个主题有 HSK 难度分级
- [ ] 至少 2 个示例对话

**估时**：1 天

**依赖**：无

---

### T-107 · 写 SKILL：zh-pronunciation

**目标**：发音专项训练 skill

**步骤**：
1. 写 SKILL.md：覆盖声母、韵母、声调、连读变调
2. 提供"最小对立对"（min pair）练习
3. 写工具 pronunciation_practice：随机给一个 min pair，让学生读

**产出**：`skills/zh-pronunciation/SKILL.md`

**验收**：
- [ ] 涵盖普通话 4 声 + 轻声 + 儿化
- [ ] 至少 20 个 min pair
- [ ] 工具能调通

**估时**：1.5 天

**依赖**：T-104

---

### T-108 · 校对 SYSTEM.md 完全对齐附件

**目标**：[system/SYSTEM.md](../system/SYSTEM.md) 跟附件一字不差地对齐

**步骤**：
1. 打开附件 docx，逐段对比
2. 检查是否漏掉：
   - AC 段落（"Kai：我来修改！..."）
   - 双语规则
   - 6 种目标学习句情况 + 7 种不算
   - 5 个个性化教学示例
   - 严格规则（不用 Markdown、不暴露画像等）
3. 修正差异

**产出**：与附件 100% 对齐的 SYSTEM.md

**验收**：
- [ ] 逐段对比 0 差异
- [ ] 附件里所有 AC / 红蓝黄绿 标记都覆盖

**估时**：半天

**依赖**：无

---

### T-109 · Pi 内部端到端测试

**目标**：在 Pi 内部（不接 Tavus）跑通完整教学流程

**步骤**：
1. 写 5 个测试场景到 `tests/`：
   - 学生问 HSK 词 → Kai 调 hsk_lookup
   - 学生说错 → Kai 调 add_mistake
   - 学生说熟练句 → Kai 不重复拆解
   - 学生说流利 → Kai 增深
   - 学生只说一个字 → Kai 降难度
2. `npm test`

**产出**：`tests/*.test.ts`

**验收**：
- [ ] 5 个测试场景全过
- [ ] 4 画像在测试 session 注入正确

**估时**：1.5 天

**依赖**：T-101 到 T-108

---

## Phase 2 · Tavus 视频层 (Week 5-7)

### T-201 · 创建 Kai PAL（pipeline_mode=full）

**目标**：Tavus 平台有一个 Kai PAL 实体

**步骤**：
1. 登录 Tavus platform
2. POST /v2/pals 创建 PAL：
   - pal_name: "Kai (中文教师)"
   - pipeline_mode: "full"
   - default_face_id: 选 stock replica
   - layers.llm.model: "gpt-4o"（先 GPT，等 V2.0 换 Claude）
3. 保存 pal_id
4. 测：在 Playground 创建 conversation 试一次

**产出**：PAL id（如 `pcb7a34da5fe`）

**验收**：
- [ ] PAL 创建成功
- [ ] Playground 能开 conversation
- [ ] Kai 的脸能动、能说话

**估时**：半天

**依赖**：Tavus 账号（已有）

---

### T-202 · 写 PAL system_prompt（基于附件）

**目标**：PAL 的 system_prompt 跟附件完全对齐

**当前状态**：[docs/tavus-pal-prompt.md](./tavus-pal-prompt.md) 有完整模板

**步骤**：
1. 把附件的全文（黄色人设 + 蓝色共享记忆）拆成 Tavus PAL system_prompt
2. 重点关注：
   - 4 画像动态注入（用 ${STUDENT_PROFILE} 等占位符）
   - 双语规则
   - 目标学习句格式
   - 严格规则（不用 Markdown）
3. 配到 PAL（POST /v2/pals 的 system_prompt 字段）
4. 加 Knowledge Base：上传 HSK 1 词表 PDF

**产出**：Tavus PAL system_prompt

**验收**：
- [ ] system_prompt 包含 4 画像占位符
- [ ] 双语规则明确
- [ ] 目标学习句格式明确
- [ ] Knowledge Base 检索 < 50ms

**估时**：1 天

**依赖**：T-201, T-102

---

### T-203 · 配置 Function Calling 工具

**目标**：Tavus LLM 能通过 function call 调 Pi 的 4 个工具

**步骤**：
1. 把 tavus-bridge 的 4 个 HTTP endpoint 注册为 PAL 的 tools
2. 工具 schema 跟 Pi 的工具 schema 对齐
3. 测：在 Playground 触发工具调用

**产出**：Tavus PAL 的 tools 配置

**验收**：
- [ ] 4 个工具在 Tavus 端可见
- [ ] Playground 触发时正确 POST 到 Pi

**估时**：1 天

**依赖**：T-105, T-201

---

### T-204 · 实现 echo 模式（备选）

**目标**：当 Tavus full pipeline 出问题时，能切到 echo 模式

**步骤**：
1. 创建另一个 PAL，pipeline_mode=echo
2. 写 LiveKit Agents 集成代码（用 livekit-plugins-tavus）
3. 把 Pi 的 LLM 决策路径接到 LiveKit Agents

**产出**：echo PAL + LiveKit 集成代码

**验收**：
- [ ] echo 模式能跑对话
- [ ] fallback 逻辑在 Tavus full 出错时切换

**估时**：1.5 天

**依赖**：T-201

---

### T-205 · 跑通一次完整对话（无完整后端）

**目标**：手动跑一次：学生说话 → Kai 调工具 → 完整 transcript

**步骤**：
1. 在 Tavus Playground 开一个 conversation
2. 手动说"Kai，帮我练点餐"
3. 验证 Kai：
   - 调 lookup_hsk_word 查 "点餐"
   - 进入角色扮演
   - 输出双语
   - 调 add_mistake 记错题
4. 看 transcript 是否完整

**产出**：第一次完整 transcript

**验收**：
- [ ] 全程 < 2 分钟无明显卡顿
- [ ] 4 工具被正确触发
- [ ] transcript 完整可读

**估时**：半天

**依赖**：T-201 到 T-203

---

### T-206 · 集成 Raven NL 描述到 Pi

**目标**：Raven 输出的"用户犹豫"等 NL 描述能传到 Pi 用于决策

**步骤**：
1. Tavus 端用 Knowledge Base 或 context 字段传 Raven 输出
2. Pi 端在 session_start 钩子解析 NL 描述
3. Kai 教学时考虑 Raven 描述（如"用户犹豫"→ 放慢节奏）

**产出**：Raven → Pi 集成

**验收**：
- [ ] Raven NL 描述能在 Pi 看到
- [ ] Kai 能基于 NL 描述调整教学

**估时**：1 天

**依赖**：T-203, T-202

---

## Phase 3 · 集成与数据流 (Week 7-9)

### T-301 · tavus-bridge 启动脚本

**目标**：tavus-bridge 作为常驻进程跑

**步骤**：
1. 写 `scripts/start-bridge.sh`
2. 用 `nohup` 或 `pm2` 守护
3. 加 health check endpoint `/health`
4. 写 systemd unit（可选）

**产出**：常驻 HTTP server

**验收**：
- [ ] bridge 启动后能持续接收 Tavus 请求
- [ ] 崩溃自动重启
- [ ] health check 返回 200

**估时**：半天

**依赖**：T-105

---

### T-302 · Tavus webhook 收 transcript

**目标**：Tavus 课程结束后，transcript 推到 Pi

**步骤**：
1. 在 Tavus PAL 配置 `callback_url`
2. 部署 webhook receiver（Pi tavus-bridge 端）
3. 收到 transcript 后：
   - 存到 students.db 的 sessions 表
   - 触发 Pi 异步分析（提取新词、错题、主题）
   - 自动更新 4 画像

**产出**：完整 webhook flow

**验收**：
- [ ] 课程结束 5s 内 transcript 存到 students.db
- [ ] 自动提取新词和错题
- [ ] 4 画像正确更新

**估时**：1.5 天

**依赖**：T-105, T-101

---

### T-303 · 错题本自动更新

**目标**：transcript 进来后自动提取错题进 mistake-book

**步骤**：
1. 写 LLM-based 错题提取 prompt
2. 用 LLM 分析 transcript，输出错题列表
3. 自动调 mistake_log add

**产出**：错题自动提取 pipeline

**验收**：
- [ ] transcript 进来后 30s 内错题入 mistake-book
- [ ] 准确率 ≥ 80%（人工抽检 10 个）

**估时**：1.5 天

**依赖**：T-302, T-103

---

### T-304 · FSRS 自动调度

**目标**：错题自动进 FSRS 调度，24h 后能拉到

**步骤**：
1. T-303 检测到错题 → 调 fsrs_schedule add
2. Pi session_start 钩子：检查 due cards
3. Tavus PAL context 注入："今日待复习：3 张"
4. 复习时 Pi 调 fsrs_schedule review

**产出**：完整 FSRS 闭环

**验收**：
- [ ] 错题自动入 FSRS
- [ ] 24h 后能被 review
- [ ] review 后按 FSRS 公式重排

**估时**：1.5 天

**依赖**：T-104, T-303

---

### T-305 · 4 画像自动更新

**目标**：transcript 进来后自动更新 4 画像（不强求全自动）

**步骤**：
1. 简化：会话结束人工 review transcript 决定是否更新
2. 自动更新项：
   - new_words → learning_history + 累计到 learning_profiles.vocab_mastered/weak
   - mistakes_count → learning_history
3. LLM 推断：transcript 后调 LLM 抽取新兴趣、新家庭信息等
4. 人工 review 流程

**产出**：半自动 4 画像更新

**验收**：
- [ ] 5 个测试 transcript 走完流程后 4 画像更新正确
- [ ] LLM 推断的敏感信息需要人工确认才入库

**估时**：1.5 天

**依赖**：T-302, T-101

---

## Phase 4 · Beta 与优化 (Week 10-12)

### T-401 · 部署 Pi 到 VPS

**目标**：Pi 在 VPS 上跑，tavus-bridge 常驻

**步骤**：
1. 选 VPS（Fly.io / Railway / DigitalOcean）
2. 配置 `~/.pi/agent/SYSTEM.md`
3. systemd unit 管理 Pi 和 tavus-bridge
4. 配 nginx 反向代理
5. 配 Let's Encrypt HTTPS

**产出**：可访问的 Pi 实例

**验收**：
- [ ] `curl https://kai.example.com/health` 返回 200
- [ ] Tavus 能调通 Pi 的 tools
- [ ] 4 数据库本地存 VPS

**估时**：1 天

**依赖**：T-301, T-105

---

### T-402 · 配 Langfuse 监控

**目标**：所有 Pi 工具调用、Tavus PAL 决策可 trace

**步骤**：
1. 注册 Langfuse Cloud
2. 在 Pi 扩展里加 Langfuse span
3. 在 Tavus PAL 配 Langfuse callback（如果支持）
4. 创建一个测试对话看 trace

**产出**：完整 trace dashboard

**验收**：
- [ ] 一次对话的所有 tool call 都有 trace
- [ ] LLM 决策能 debug

**估时**：1 天

**依赖**：T-401

---

### T-403 · 配 Sentry 错误上报

**目标**：Tavus / Pi 异常实时上报

**步骤**：
1. 注册 Sentry
2. 在 Pi extensions 加 try/catch + Sentry
3. 在 tavus-bridge 加 error handler
4. 写 1 个测试错误验证上报

**产出**：Sentry 接入

**验收**：
- [ ] 故意 throw 一个错误能在 Sentry 看到
- [ ] 不会在生产误报

**估时**：半天

**依赖**：T-401

---

### T-404 · 招 10 个 Beta 用户

**目标**：找到 10 个愿意用 1 周的真实用户

**步骤**：
1. 写 on-boarding 文档（如何注册、首次对话）
2. 选 5 个常用主题作为预设（点餐、问路、面试、购物、聊天）
3. 招人渠道：reddit / Discord / Twitter / 朋友圈
4. 给 1 个月免费 offer

**产出**：onboarding 文档 + 10 个测试账号

**验收**：
- [ ] 10 个用户在 1 周内都跑过至少 1 次对话
- [ ] 完成首次 onboarding 流程 < 5 分钟

**估时**：1.5 天（含招人）

**依赖**：T-401

---

### T-405 · 收集 feedback + 优化

**目标**：基于真实使用数据优化 SYSTEM.md 和工具

**步骤**：
1. 收集 10 个用户的反馈（Discord / 微信）
2. 跑 Langfuse trace 看：
   - 哪些 tool call 失败率高
   - LLM 决策常见模式
3. 优化：
   - SYSTEM.md 调整 prompt
   - 工具参数验证加强
   - 4 画像推断逻辑调整

**产出**：V1.0 优化报告

**验收**：
- [ ] 至少 3 个用户连续用 7 天
- [ ] SYSTEM.md 经过 1 轮优化
- [ ] 工具失败率 < 5%

**估时**：3 天（持续）

**依赖**：T-404

---

### T-406 · 准备 V1.0 发布

**目标**：功能稳定、文档齐全、可发布

**步骤**：
1. 完整测试 5 个主题对话
2. 写用户使用文档
3. 写运维文档（怎么部署、怎么排错）
4. 准备 demo 视频

**产出**：V1.0 发布包

**验收**：
- [ ] 5 个主题 demo 视频完成
- [ ] README 完整
- [ ] 部署文档完整

**估时**：2 天

**依赖**：T-405

---

## 关键里程碑

| 周 | 里程碑 | 可演示 |
|---|--------|--------|
| W1 | 环境 OK | Pi 能跑 + Tavus MCP 装上 |
| W5 | Pi 内核完 | `pi -p` 能调 5 个工具 + 4 画像注入 |
| W7 | Tavus 视频 OK | 一次完整视频对话跑通 |
| W9 | 数据流 OK | transcript 自动存 + 错题自动入 FSRS |
| W10 | 部署完成 | VPS 跑通 + 监控 OK |
| W12 | Beta 完成 | 10 个用户用过 + 优化报告 |

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Tavus 工具调用 schema 不匹配 | 中 | 高 | 早期就 T-203 跑通跑通 |
| LLM 推断 4 画像不准确 | 高 | 中 | 半自动 + 人工 review（T-305）|
| Tavus 延迟不稳 | 中 | 高 | T-204 准备 echo 模式 fallback |
| FSRS 调参不灵 | 低 | 中 | 先用 SM-2 简单版 |
| SYSTEM.md 跟附件有出入 | 低 | 高 | T-108 逐段校对 |

---

## 附：任务依赖图

```
T-001 ─┬─ T-101
       ├─ T-102
T-002 ─┤
T-003 ─┼─ T-103 ─┬─ T-105
       └─ T-104 ─┘
                T-106
                T-107
                T-108
                T-109 (依赖 101-108)

T-201 ─┬─ T-202 ─┬─ T-203 ─┬─ T-205
       └─ T-204 ─┘         └─ T-206

T-105 ─┬─ T-301 ─┬─ T-401 ─┬─ T-402 ─┬─ T-404 ─┬─ T-406
       └─ T-302 ─┘         └─ T-403 ─┘          └─ T-405
                T-303
                T-304
                T-305
```

---

📄 PRD · 📐 架构 → [../ARCHITECTURE.md](../ARCHITECTURE.md) · 🗺️ 路线 → [implementation-roadmap.md](./implementation-roadmap.md)
