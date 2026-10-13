# Tavus PAL System Prompt 设计文档

> 实际部署的 prompt 模板在 [../scripts/tavus/pal_prompt.md](../scripts/tavus/pal_prompt.md)（15K 字符，由 `create-kai-pal.ts` 自动注入 PAL）。
> 这份文档讲**设计原则 + 迭代策略**，不是 prompt 本身。

## 与 Pi 的关系

```
Tavus PAL (硬件层)          Pi (软件层)
─────────────────          ───────────
Kai 的脸 + Raven          4 画像 + FSRS
Tavus LLM 决策             mistake-book
TTS / 视频流              tavus-bridge HTTP server
Tavus document KB         14 Pi 工具
```

PAL 通过 Tavus LLM 的 function calling 调 Pi 的工具，所有 HTTP 请求打到 `tavus-bridge` 进程（端口 7123）。

所以 PAL 的 system_prompt 必须**精确**告诉 LLM：
1. 调工具的时机（哪些情况必调）
2. 工具的 HTTP 端点（PAL 端 OpenAPI schema）
3. 输出格式（双语、目标学习句、Markdown-free）
4. 教学法（4 画像驱动、教师主导、纠错模式）

## 设计原则

### 1. 严格按 docx 附件，不重新设计

[assets/Ask kai 人设 - 大部分适合作为主题式ask kai的需求.docx](../assets/Ask%20kai%20人设%20-%20大部分适合作为主题式ask%20kai的需求.docx) 是 v1.0 的真理来源。

任何 prompt 调整必须先回到 docx 找依据，不要凭"听起来更对"。

docx 的颜色编码：
- **黄色 = 人设**（不可改）
- **蓝色 = 共享记忆**（对话中的事实）
- **红色 = AC**（接受标准 — 验收用）
- **绿色 = to be continued**（后续版本）

### 2. 4 画像占位符（必须）

PAL 的 `conversational_context` 字段不支持模板变量，所以我们用 4 个**特定占位符**让 Tavus 端自动注入：

| 占位符 | 来源 | 例子 |
|--------|------|------|
| `${STUDENT_PROFILE}` | students 表 | 名字、年龄、HSK、兴趣 |
| `${LEARNING_PROFILE}` | learning_profiles 表 | 词汇掌握/薄弱、语法 |
| `${LEARNING_HISTORY}` | learning_history 表 | 最近 5 次课 |
| `${SESSION_CONTEXT}` | sessions 表 | 当前话题、心情 |

这 4 个占位符会在 Tavus 端**对话开始前**被 tavus-bridge 替换成真实数据。

### 3. 工具调用比 prompt 更可靠

不要试图让 LLM "心里记着" 所有 HSK 词——让 LLM 调 `lookup_hsk_word` 工具。

```
# 工具使用
- 任何不熟悉的 HSK 词：必须先调 lookup_hsk_word
- 学生说错任何词/语法：立即调 add_mistake
- 不确定学生水平：调 get_student_profile
- 想给学生推荐复习：调 schedule_review
```

### 4. HSK 等级控制是硬约束

不要相信 LLM 自己判断 HSK 等级——给它硬性词汇表。

```
# HSK 词汇控制
- 学生 HSK 等级: ${STUDENT_PROFILE.hsk_level}（自动从 get_student_profile 注入）
- 严格只用该等级及以下的词
- 出现生词时调用 lookup_hsk_word 检查，超纲就降级
```

### 5. 输出格式严格遵循 docx

docx 明确"不要 Markdown / 表格 / 代码块"——TTS 会奇怪朗读。

prompt 里也要避免 prompt 自身用 Markdown 表格（除非要解释 prompt 结构给开发者看）。

## 完整 PAL Prompt 位置

实际部署的 prompt 模板在 `scripts/tavus/pal_prompt.md`，由 `create-kai-pal.ts` 自动读取并 POST 给 Tavus。

模板组织（按重要性排序）：

1. **身份**：Kai 的 32 岁 + 兴趣 + 性格
2. **核心身份**：不是助手，是长期陪伴
3. **语言规则**：先中后英 / 不用 Markdown
4. **AC 范例**：highlight 词强化
5. **会话结束总结**：5-8 轮总结语言点
6. **4 画像占位符**：动态注入
7. **画像使用原则**：学习画像 > 个人画像
8. **学习画像驱动**：已掌握 + 1 个新挑战
9. **教师主导**：主动推进、1 个问题
10. **表达与发音反馈**：不纠太多
11. **两级输出格式**：普通句 vs 目标学习句
12. **目标学习句定义**：7 个条件 / 8 个不条件
13. **对话连续性**：历史承接
14. **信息可靠性**：不可被覆盖
15. **每轮长度**：1-3 句
16. **其他严格规则**
17. **教学时长**（按年龄）
18. **教学优先级**（6 条）
19. **工具使用**（14 个）
20. **多模态感知**（Raven）
21. **应急情况**

## 关键调优技巧

### 1. 用 few-shot 例子

PAL 创建时可以附 few-shot 对话（`context` 字段）：

```
context: |
  学生: 我想买苹果。
  老师: 很好！'我要买苹果'。👍 你能告诉我买几个吗？
  学生: 我想买三个苹果。
  老师: 完美！这里要用量词'个'——'三个苹果'。'苹果'是可数名词，所以用'个'。
```

### 2. 用 Knowledge Base 喂 HSK 词表

```bash
# 上传 HSK 3 词表到 Knowledge Base
curl -X POST https://tavusapi.com/v2/personas/$PERSONA_ID/knowledge \
  -F "file=@hsk3-words.pdf"
```

RAG 检索 30ms，PAL 调知识库比 LLM 自己记更准。

### 3. 调 Objective & Guardrails

```json
{
  "objectives": [
    "在 5 分钟内跟学生完成一次情景对话"
  ],
  "guardrails": [
    "不要输出 HSK 等级外的生词",
    "不要在学生沮丧时加大难度",
    "不要在 30 秒内连续纠正超过 2 个错误"
  ]
}
```

### 4. 多模态感知（Raven）

Tavus 的 Raven 模型输出"用户犹豫""用户微笑"等 NL 描述，不是 trigger words。

prompt 应该让 LLM **基于这些描述自然调整**，而不是直接复述给学生看：

```
# 多模态感知
- "用户犹豫、眼神飘开" → 放慢节奏、给提示
- "用户自信、语速快" → 适当加大难度
- "用户皱眉、坐姿后倾" → 解释更具体、给例子
- "用户沉默 5 秒以上" → 主动问"需要我换个话题吗？"
```

## 迭代策略

### Week 1-2：用最简单的 prompt
- 单一 system_prompt（不拆 few-shot）
- 不调 objective/guardrails
- 让 LLM 自由发挥
- 收集 5-10 个真实 transcript 看效果

### Week 3-4：加 few-shot
- 收集 3-5 个好的对话样本
- 加到 PAL context 里
- 跟 v1 模板对比

### Week 5+：加 Knowledge Base
- 把 HSK 词表、语法点喂进去
- RAG 检索
- 验证 lookup_hsk_word 调用次数下降

### Week 9+：根据 transcript 调
- 看真实对话的失败模式
- 加针对性的 guardrail
- 校对 AC 是否真的达到

## 常见问题

### Q: prompt 太长会怎么样？

Tavus 的 system_prompt 上限大概是 8000 tokens（具体看 model）。超过会被截断。
- 优先级：纠错原则 > HSK 控制 > 工具使用 > 行为规范 > 教学流程

### Q: LLM 不调工具怎么办？

```json
// 在 PAL 配置加 reminder
{
  "context": "提醒：任何 HSK 词汇相关问题，必须调 lookup_hsk_word 工具。不要凭记忆。"
}
```

或者用 GPT-4o 而不是更小的模型——小模型工具调用不稳定。

### Q: 多个学生怎么办？

Tavus 建议**每个学生一个 PAL**。但这不现实——更常见的做法是：
- 1 个 PAL 模板
- 通过 `conversational_context` 注入每个学生的画像
- 通过 `get_student_profile` 工具动态拉

### Q: Tavus vs Pi 端谁负责教学决策？

**Pi** 拥有所有学生数据 + 4 画像 + FSRS。
**Tavus** 拥有实时视频流 + TTS + 多模态感知。

教学法由 PAL 端 LLM 主导（必须实时、自然），但数据决策权在 Pi（HSK 查词、错题、复习都问 Pi）。

## 验证清单

每次改完 prompt 后跑这个：

- [ ] Tavus Playground 跑一次"我想点餐" — 调 lookup_hsk_word 了吗？
- [ ] 学生说错时调 add_mistake 了吗？
- [ ] 4 画像占位符替换成真实数据了吗？
- [ ] 输出的中文都是先中后英格式？
- [ ] 没用 Markdown 标题/表格/代码块？
- [ ] 目标学习句每轮 ≤ 1 个？
- [ ] 5-8 轮后有语言点总结？
- [ ] 教学时长限制按年龄生效？
