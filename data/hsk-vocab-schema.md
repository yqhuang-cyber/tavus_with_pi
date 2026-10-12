# HSK 词库数据格式

> HSK 3.0（2026 修订版）共 **11,092 词**，分布在 7 个等级。

## 等级分布

| 等级 | 新词 | 累计 |
|------|------|------|
| HSK 1 | 300 | 300 |
| HSK 2 | 200 | 500 |
| HSK 3 | 500 | 1000 |
| HSK 4 | 1000 | 2000 |
| HSK 5 | 1600 | 3600 |
| HSK 6 | 1800 | 5400 |
| HSK 7-9 | 5600 | 11000 |

## 数据源

| 来源 | 链接 | 备注 |
|------|------|------|
| Hanban 官方 | hanban.org | 权威但需付费 |
| github 社区 | github.com/g1eny0ung/hsk-words | 整理好的 JSON |
| 汉语言学社区 | hskhsk.com | 含例句和音频 |
| Pleco | pleco.com | 商业但权威 |

## Schema

```sql
CREATE TABLE hsk_vocab (
  word TEXT PRIMARY KEY,
  pinyin TEXT NOT NULL,           -- 拼音（带声调数字或符号）
  hsk_level INTEGER NOT NULL,     -- 1-9
  part_of_speech TEXT,            -- 'n' | 'v' | 'adj' | ...
  meaning_en TEXT,                -- 英文释义
  meaning_zh TEXT,                -- 中文释义
  examples TEXT,                  -- JSON: [{zh, pinyin, en}, ...]
  audio_url TEXT,                 -- TTS 生成的 URL（可选）
  frequency_rank INTEGER          -- 词频排名（可选）
);
```

## 词条示例

```json
{
  "word": "你好",
  "pinyin": "nǐ hǎo",
  "hsk_level": 1,
  "part_of_speech": "phrase",
  "meaning_en": "hello",
  "meaning_zh": "你好",
  "examples": [
    {
      "zh": "你好，很高兴认识你。",
      "pinyin": "nǐ hǎo, hěn gāoxìng rènshi nǐ",
      "en": "Hello, nice to meet you."
    }
  ]
}
```

## 初始化数据

### Week 1-2：HSK 1 起步（300 词）

```bash
# 下载 HSK 1 词表
curl -L https://raw.githubusercontent.com/g1eny0ung/hsk-words/master/HSK%20Level%201.csv > hsk1.csv

# 转成 JSON
node scripts/csv-to-json.js hsk1.csv > hsk1.json

# 入库
node scripts/init-db.ts hsk1.json
```

### Week 3-4：HSK 2-3 扩展（1000 词）

### Week 8+：HSK 1-6 完整（5400 词）

### Week 16+：HSK 7-9 完整（11000 词）

## 配套资源

- **音频**：用 edge-tts 或 ElevenLabs 批量生成
- **例句**：从 CC-CEDICT 或 Tatoeba 拉
- **部首**：214 部首表
- **HSK 真题**：3.0 版样题和历年真题

## 数据更新策略

HSK 词表是**稳定**的——官方 1-2 年才更新一次。所以：
- 一次建好表
- 季度检查是否有新词
- 重大改革（如 3.0）整体重建
