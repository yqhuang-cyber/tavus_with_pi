# Tavus + Pi · 中文教学 Agent

基于 **Pi Coding Agent**（脑）+ **Tavus CVI**（脸）的对外中文教学 agent。
学生通过实时视频对话跟一个会动会说话的中文老师学习，老师能看表情、听语气、纠发音、查词、记错题、按间隔重复复习。

> **核心定位**：不是又一个中文学习 App，是一个**可扩展、可观测、可降级**的教学 agent 基础设施。

## 为什么是 Pi + Tavus

| 组件 | 角色 | 解决什么 |
|------|------|---------|
| **Pi** | agent harness（教学大脑） | 教学逻辑、HSK 词库、错题本、FSRS 复习、学生画像 |
| **Tavus** | 实时视频对话层 | 人脸渲染、表情感知、turn-taking、~500ms 延迟 |
| **Pi Skills/Extensions** | 教学能力包 | 可分享、可升级、跟 harness 解耦 |
| **MCP / Function Calling** | 桥接协议 | Tavus LLM 调 Pi 工具，零耦合 |

**关键设计原则**：
- Pi 是大脑（怎么教），Tavus 是脸（怎么呈现）——**解耦**
- Pi 教学逻辑 = Extensions + Skills，可独立测试
- Tavus 视频 pipeline 跟教学逻辑**完全独立**——任一挂了另一个能降级

## 项目结构

```
tavus_with_pi/
├── README.md                      # 你正在看
├── ARCHITECTURE.md                # 完整技术架构（先读这个）
├── docs/                          # 详细设计文档
│   ├── implementation-roadmap.md  # 从 0 到 1 实施路线
│   ├── tavus-pal-prompt.md        # Tavus PAL system_prompt 模板
│   └── pi-extensions-guide.md     # Pi 扩展开发指南
├── extensions/                    # Pi 扩展（TypeScript）
│   ├── README.md
│   ├── hsk-vocab.ts               # 查 HSK 词库
│   ├── mistake-book.ts            # 错题本管理
│   ├── fsrs-scheduler.ts          # 间隔重复调度
│   ├── student-profile.ts         # 学生画像
│   └── tavus-bridge.ts            # Tavus Function Call 路由
├── skills/                        # Pi skills（Markdown）
│   └── zh-dialogue/
│       └── SKILL.md
├── prompts/                       # Prompt templates
│   └── tutor-persona.md
├── system/                        # System prompt
│   └── SYSTEM.md
├── data/                          # 数据 schema
│   ├── student-schema.sql
│   └── hsk-vocab-schema.md
├── scripts/                       # 工具脚本
│   └── init-db.ts
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

# 5. 配置 Pi（参考 docs/pi-extensions-guide.md）

# 6. 启动
pi
```

详细步骤见 [docs/implementation-roadmap.md](./docs/implementation-roadmap.md)。

## 核心文档

📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — 完整技术架构、数据流、组件分工
🗺️ **[docs/implementation-roadmap.md](./docs/implementation-roadmap.md)** — 12 周实施计划
🤖 **[docs/tavus-pal-prompt.md](./docs/tavus-pal-prompt.md)** — Tavus PAL system_prompt 模板
🔌 **[docs/pi-extensions-guide.md](./docs/pi-extensions-guide.md)** — Pi 扩展开发指南

## 路线图

- [ ] Week 1-2：MVP（Pi + Tavus MCP + stock replica + 基础 SYSTEM.md）
- [ ] Week 3-4：HSK 词库 + 错题本（SQLite）
- [ ] Week 5-8：FSRS 复习调度 + 学生画像
- [ ] Week 9-12：Beta 测试 + 优化
- [ ] Future：自训练数字分身（Phoenix）+ 多语言扩展

## 许可证

MIT
