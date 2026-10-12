# 实施路线图 · 12 周从 0 到 1

> 把架构图变成可运行的系统。按周排好，每周都有可验证的交付物。

## 总览

| Phase | 周 | 目标 | 关键交付 | 风险 |
|-------|----|----|---------|------|
| **0** | 1-2 | MVP 跑通 | Pi + Tavus MCP + stock replica + 基础对话 | 中（环境配置） |
| **1** | 3-4 | 数据层 | HSK 3 词库 + 错题本 + 基础 SQLite | 低 |
| **2** | 5-8 | 完整学习闭环 | FSRS + 学生画像 + lesson flow | 中（FSRS 调参） |
| **3** | 9-12 | Beta 测试 | 真实用户 + 优化 | 高（产品假设验证） |
| **4** | 13+ | 规模化 | 自训练 face + 多语言 | 高（投入大） |

---

## Phase 0（Week 1-2）: MVP 跑通

**目标**：学生能在浏览器里跟一个 stock 中文老师视频对话，agent 能听懂并回复。

### Week 1

**Day 1-2：环境搭建**
```bash
# 装 Pi
curl -fsSL https://pi.dev/install.sh | sh
pi --version

# 装 Tavus MCP server
npm install -g tavus-mcp
export TAVUS_API_KEY="your-tavus-key"
# 测一下 MCP 通不通
npx tavus-mcp
```

**Day 3-4：Tavus 跑通**
- 在 Tavus platform 创建 API key
- 用 stock replica 创建一个 conversation
- 用最简的 React 组件（@tavus/cvi-ui）嵌入

```bash
npx @tavus/cvi-ui@latest init
npx @tavus/cvi-ui@latest add conversation
```

**Day 5：Pi + Tavus 接通**
- 装 `pi-mcp-adapter`
- 配置 `.pi/settings.json` 加 tavus-mcp
- 写一个最简的 SYSTEM.md：

```markdown
你是中文老师。永远用中文回复，简洁自然。
```

**验证**：
- [ ] 在浏览器里看到 stock 中文老师的脸
- [ ] 学生说"你好"，agent 回答"你好！很高兴见到你"
- [ ] 整个延迟 < 2s

### Week 2

**Day 1-3：基本教学流程**
- 写 SYSTEM.md：教学人设 + 纠错原则 + HSK 等级控制
- 调 Tavus PAL 配置：
  - system_prompt: "你是中文老师..."
  - LLM: gpt-4o
  - 感知: Raven-1
  - TTS: tavus-auto
- 创建 3-5 个 skill（对话练习、纠错、查词）

**Day 4-5：第一次内部测试**
- 找 3-5 个朋友试
- 收集 feedback
- 优化 system_prompt

**验证**：
- [ ] agent 能稳定听懂中文
- [ ] 纠错有"先肯定再纠正"的感觉
- [ ] HSK 1-2 学生能跟它对话
- [ ] transcript 能存到 Pi session

---

## Phase 1（Week 3-4）: 数据层

**目标**：能查词、能记错题，数据可持久化。

### Week 3

**Day 1-2：HSK 词库**
- 下载 HSK 3.0 词表（11,000 词）
- 转成 SQLite schema：

```sql
CREATE TABLE hsk_vocab (
  word TEXT PRIMARY KEY,
  pinyin TEXT NOT NULL,
  hsk_level INTEGER NOT NULL,  -- 1-9
  part_of_speech TEXT,
  meaning_en TEXT,
  meaning_zh TEXT,
  examples TEXT,  -- JSON array
  audio_url TEXT
);
```

- 写 `extensions/hsk-vocab.ts`（查词工具）
- 写 `scripts/init-db.ts`（初始化脚本）

**Day 3-4：错题本**
```sql
CREATE TABLE mistakes (
  id INTEGER PRIMARY KEY,
  student_id TEXT,
  type TEXT,
  item TEXT,
  context TEXT,
  corrected_count INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  last_seen_at TIMESTAMP
);
```

- 写 `extensions/mistake-book.ts`
- 测试 Tavus LLM 调 add_mistake 工具

**Day 5：第一个端到端流程**
- 学生说错一个词 → agent 调 add_mistake → agent 回复
- 课后 → 错题本 +1

**验证**：
- [ ] 查词工具 < 50ms 返回
- [ ] 错题本能在 Pi session 里查到
- [ ] 一次完整"学生说错 → 老师纠正 → 错题记录"流程

### Week 4

**Day 1-3：学生画像**
- 加 `students` 表（id, hsk_level, target_level, native_lang, streak_days）
- 写 `extensions/student-profile.ts`
- 在 `session_start` 钩子注入画像到 system prompt

**Day 4-5：多学生测试**
- 至少 2 个学生，每个 HSK 1 和 HSK 3
- 验证 system_prompt 注入的画像生效
- agent 能根据 HSK 等级调整用词

**验证**：
- [ ] 学生 A（HSK 1）对话用词简单
- [ ] 学生 B（HSK 3）对话用词丰富
- [ ] 错题本每个学生独立

---

## Phase 2（Week 5-8）: 完整学习闭环

**目标**：FSRS 间隔重复 + 完整 lesson flow + 学生能感觉到进步。

### Week 5-6

**FSRS 集成**
- 加 `fsrs_cards` 表
- 写 `extensions/fsrs-scheduler.ts`
- 集成 `ts-fsrs` npm 包
- 错题进 FSRS 调度

```typescript
import { fsrs, generatorParameters, createEmptyCard } from 'ts-fsrs'

const f = fsrs(generatorParameters({ enable_fuzz: true }))
const card = createEmptyCard()
const scheduling = f.next(card, now, Rating.Good)
// scheduling[Rating.Good].due 是下次复习时间
```

### Week 7

**完整 lesson flow**
- `/lesson` 命令：开始一节课
- lesson 模板：热身 → 新词 → 复习 → 对话 → 总结
- 自动加错题进 FSRS
- 课后生成报告（错题、新词、复习列表）

### Week 8

**Pi 内部优化**
- 压缩策略：自动 compaction 不丢失教学上下文
- 工具调用错误处理
- 教学决策 trace 进 Langfuse

**验证**：
- [ ] 错题 1 天后能自动拉出来复习
- [ ] FSRS 调度符合预期（短间隔 → 长间隔）
- [ ] lesson 报告能给学生看

---

## Phase 3（Week 9-12）: Beta 测试

**目标**：10 个真实用户、收集反馈、迭代优化。

### Week 9-10：招募 + 启动

**招募策略**：
- Reddit r/ChineseLanguage
- Discord 中文学习群
- Twitter 中文教育 KOL
- 朋友圈海外华人

**offer**：
- 免费 1 个月 unlimited
- 直接跟我反馈（Discord / 微信）
- 终身 7 折

**Day 1-3：生产部署**
```bash
# 部署 Pi 后端
cd /workspace/tavus_with_pi
fly.io deploy  # 或 VPS

# 数据库
supabase db push

# 监控
langfuse cloud 接入
```

**Day 4-5：onboarding 流程**
- 注册 → 测水平（5 分钟 placement test）
- 选 HSK 目标
- 第一次对话体验

### Week 11-12：优化

**关键指标**：
- 留存：第 1 天的用户第 7 天还在用
- 完课率：一节课完整上完的比例
- 进步：错题本 30 天后错题减少
- NPS：用户推荐意愿

**根据数据优化**：
- SYSTEM.md 调 prompt
- 工具调用优化
- 教学法调优（HSK 词汇控制阈值）
- 加新 skill（学生常问的功能）

**验证**：
- [ ] 10 个学生连续用 1 周
- [ ] 至少 5 个完成 1 个月
- [ ] NPS > 30
- [ ] 完整 transcript 收集做模型调优

---

## Phase 4（Week 13+）: 规模化

**目标**：付费用户、自训练 face、横向扩展。

### Week 13-16：付费

**定价**：
- 免费版：5 分钟/天
- 基础版 $9.99/月：60 分钟/月
- Pro 版 $19.99/月：unlimited

**支付**：
- Stripe（海外）
- 微信 / 支付宝（国内）

### Week 17-24：自训练 face

**前置条件**：
- 至少 100 个付费用户
- 录制自己 2 分钟视频
- 等 4-6 小时训练

**收益**：
- 个性化的"老师脸"
- 品牌差异化
- 减少 Tavus 调 stock 的费用

### Week 25+：横向扩展

**加语言**：
- 日语版
- 韩语版
- 英语版（给想学英文的）

**加功能**：
- HSK 备考模式
- 商务中文
- 古文/诗词
- 儿童中文

**技术债**：
- 自托管 LLM（vLLM）
- K8s 部署
- 多区域

---

## 关键技术决策的时机

| 决策 | 何时决定 | 影响 |
|------|---------|------|
| LLM provider | Week 1 | 整个成本结构 |
| 数据库选型 | Week 3 | 部署复杂度 |
| 是否自训练 face | Week 13+ | 4-6 小时 + 成本 |
| 付费墙时机 | Week 11 | 转化率 vs 体验 |
| 多语言 | Week 25+ | 翻译、词库 |

## 风险清单

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Tavus 延迟不稳 | 中 | 高 | `echo` 模式 + LiveKit 自接 |
| LLM 成本失控 | 中 | 高 | 便宜模型 fallback + 缓存 |
| 用户不喜欢"假脸" | 中 | 高 | Week 9-10 Beta 验证 |
| FSRS 算法不灵 | 低 | 中 | 先用 SM-2 fallback |
| 数据隐私/合规 | 中 | 高 | Week 3 就要考虑 GDPR/CCPA |

## 每周 commit 节奏

```bash
# 每周日晚上 commit + push
git add .
git commit -m "week X: <做了什么>"
git push origin main
```

CI 自动跑：
- TypeScript 类型检查
- Lint
- 单元测试
- 数据库 migration 测试

---

🗺️ 路线图 · 📐 架构 → [../ARCHITECTURE.md](../ARCHITECTURE.md) · 🤖 PAL prompt → [tavus-pal-prompt.md](./tavus-pal-prompt.md)
