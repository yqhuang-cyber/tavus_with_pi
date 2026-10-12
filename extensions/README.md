# Pi 扩展（TypeScript）

> 5 个核心 extension 构成教学 agent 的所有软件能力。

## 列表

| Extension | 职责 | 状态 |
|----------|------|------|
| [hsk-vocab.ts](./hsk-vocab.ts) | HSK 词库查询 | 🟡 TODO |
| [mistake-book.ts](./mistake-book.ts) | 错题本管理 | 🟡 TODO |
| [fsrs-scheduler.ts](./fsrs-scheduler.ts) | FSRS 间隔重复 | 🟡 TODO |
| [student-profile.ts](./student-profile.ts) | 学生画像 | 🟡 TODO |
| [tavus-bridge.ts](./tavus-bridge.ts) | Tavus Function Call 路由 | 🟡 TODO |

## 怎么写

参考 [docs/pi-extensions-guide.md](../docs/pi-extensions-guide.md) 完整指南。

## 怎么装

`.pi/settings.json`（项目级）：
```json
{
  "extensions": ["./extensions/*.ts"]
}
```

或者发布到 npm 后：
```bash
pi install npm:@yqhuang/zh-tutor-extensions
```

## 数据库

5 个扩展用 4 个 SQLite 数据库（在 `~/.zh-tutor/`）：

| 数据库 | 表 |
|--------|---|
| `hsk-vocab.db` | hsk_vocab |
| `mistakes.db` | mistakes |
| `fsrs.db` | fsrs_cards |
| `students.db` | students, sessions |

详细 schema 见 [data/student-schema.sql](../data/student-schema.sql)。
