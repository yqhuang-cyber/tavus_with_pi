# Ask Kai · 中文教学 Agent

> 基于 **Pi Coding Agent**（脑）+ **Tavus CVI**（脸）的对外中文教学 agent。
> Kai 是一个 32 岁的"虚拟中文私教"，**长期陪伴**学生学中文，主题式对话，按画像个性化教学。

📄 **核心文档**：
- [PRD.md](./PRD.md) — 产品需求文档
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 完整技术架构
- [assets/Ask kai 人设 - ... .docx](./assets/Ask%20kai%20人设%20-%20大部分适合作为主题式ask%20kai的需求.docx) — 原始人设需求

## 为什么是 Pi + Tavus

| 组件 | 角色 | 解决什么 |
|------|------|---------|
| **Pi** | agent harness（教学大脑） | 教学逻辑、4 个画像、错题本、FSRS 复习 |
| **Tavus** | 实时视频对话层 | 人脸渲染、表情感知、turn-taking、~500ms 延迟 |
| **Kai 人设** | 系统 prompt | 32 岁、耐心幽默、长期陪伴型老师 |
| **MCP / Function Calling** | 桥接协议 | Tavus LLM 调 Pi 工具，零耦合 |

**核心差异化**：Kai **不是通用聊天机器人**——它记得学生、懂得学生、能在合适的时机用合适的方式教学生。

## 关键设计原则

- **Kai 是真人**（不是抽象 AI）：有名字、年龄、兴趣、家人、性格
- **长期记忆**：4 个画像维度（个人/学习/历史/上下文）跨 session 保留
- **自然教学**：在对话流中教，不打断
- **主题式**：用户问主题，Kai 围绕主题展开
- **双语规则**：每个中文字都有英文整句解释
- **目标学习句**：每轮最多 1 个，按学生水平动态选

## 项目结构

```
tavus_with_pi/
├── README.md                      # 你正在看
├── PRD.md                         # 产品需求文档
├── ARCHITECTURE.md                # 完整技术架构
├── assets/                        # 原始需求附件
│   └── Ask kai 人设 - ... .docx
├── docs/                          # 详细设计文档
│   ├── implementation-roadmap.md  # 12 周实施计划
│   ├── tavus-pal-prompt.md        # Tavus PAL system_prompt 模板
│   └── pi-extensions-guide.md     # Pi 扩展开发指南
├── extensions/                    # Pi 扩展（TypeScript）
│   ├── README.md
│   ├── hsk-vocab.ts
│   ├── mistake-book.ts
│   ├── fsrs-scheduler.ts
│   ├── student-profile.ts         # 4 个画像维度
│   └── tavus-bridge.ts
├── skills/                        # Pi skills
│   └── zh-dialogue/
│       └── SKILL.md
├── prompts/                       # Prompt templates
│   └── tutor-persona.md
├── system/                        # System prompt
│   └── SYSTEM.md                  # Ask Kai 完整人设
├── data/                          # 数据 schema
│   ├── student-schema.sql         # 4 个画像维度的存储
│   └── hsk-vocab-schema.md
├── scripts/                       # 工具脚本
│   ├── init-db.ts
│   └── import-hsk.ts
├── package.json
└── .gitignore
```

## 快速开始

```bash
# 1. 装 Pi
curl -fsSL https://pi.dev/install.sh | sh

# 2. 装 Tavus MCP server
npm install -g tavus-mcp
export TAVUS_API_KEY="your-key"

# 3. clone 这个 repo
git clone https://github.com/yqhuang-cyber/tavus_with_pi.git
cd tavus_with_pi

# 4. 装 Pi 包
npm install --ignore-scripts

# 5. 复制 system prompt 到 Pi
cp system/SYSTEM.md ~/.pi/agent/SYSTEM.md

# 6. 配置 Pi（参考 docs/pi-extensions-guide.md）

# 7. 启动
pi
```

详细步骤见 [docs/implementation-roadmap.md](./docs/implementation-roadmap.md)。

## 核心文档

📄 **[PRD.md](./PRD.md)** — 产品需求（v1.0）
📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — 完整技术架构
🗺️ **[docs/implementation-roadmap.md](./docs/implementation-roadmap.md)** — 12 周实施计划
🤖 **[docs/tavus-pal-prompt.md](./docs/tavus-pal-prompt.md)** — Tavus PAL system_prompt 模板
🔌 **[docs/pi-extensions-guide.md](./docs/pi-extensions-guide.md)** — Pi 扩展开发指南
🎓 **[system/SYSTEM.md](./system/SYSTEM.md)** — Ask Kai 完整 system prompt

## 路线图

- [ ] Week 1-2：MVP（Pi + Tavus MCP + stock replica + Kai 人设）
- [ ] Week 3-4：4 个画像 + HSK 1 词库 + 错题本
- [ ] Week 5-8：FSRS + 完整 lesson flow
- [ ] Week 9-12：Beta 测试 + 优化
- [ ] Future：自训练 Kai 数字分身 + 多语言

## 许可证

MIT
