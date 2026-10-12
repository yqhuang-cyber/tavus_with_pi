/**
 * 测试 data/hsk1.json 数据完整性
 * - 每词必填字段
 * - pinyin 格式正确
 * - examples 是数组
 */
import { describe, it, expect } from 'vitest'
import hsk1 from '../data/hsk1.json' with { type: 'json' }

interface HskWord {
  word: string
  pinyin: string
  hsk_level: number
  part_of_speech: string
  meaning_en: string
  meaning_zh: string
  examples: Array<{ zh: string; pinyin: string; en: string }>
  frequency_rank: number
}

describe('HSK 1 词表数据', () => {
  it('应至少有 49 个词（demo MVP 阶段）', () => {
    expect(hsk1.length).toBeGreaterThanOrEqual(49)
  })

  it('每词必填字段不能空', () => {
    for (const w of hsk1 as HskWord[]) {
      expect(w.word, `word 不能为空`).toBeTruthy()
      expect(w.pinyin, `${w.word} 的 pinyin 不能为空`).toBeTruthy()
      expect(w.hsk_level, `${w.word} 的 hsk_level 应为 1`).toBe(1)
      expect(w.meaning_en, `${w.word} 的 meaning_en 不能为空`).toBeTruthy()
      expect(w.meaning_zh, `${w.word} 的 meaning_zh 不能为空`).toBeTruthy()
    }
  })

  it('frequency_rank 应唯一且从 1 开始', () => {
    const ranks = (hsk1 as HskWord[]).map((w) => w.frequency_rank)
    const uniqueRanks = new Set(ranks)
    expect(uniqueRanks.size).toBe(ranks.length)  // 唯一
    expect(Math.min(...ranks)).toBe(1)  // 从 1 开始
  })

  it('examples 必须是数组且包含 zh/pinyin/en', () => {
    for (const w of hsk1 as HskWord[]) {
      expect(Array.isArray(w.examples), `${w.word} 的 examples 必须是数组`).toBe(true)
      for (const ex of w.examples) {
        expect(ex.zh).toBeTruthy()
        expect(ex.pinyin).toBeTruthy()
        expect(ex.en).toBeTruthy()
      }
    }
  })

  it('pinyin 不应包含汉字（除非特殊变音）', () => {
    const hasChinese = (s: string) => /[一-鿿]/.test(s)
    for (const w of hsk1 as HskWord[]) {
      expect(hasChinese(w.pinyin), `${w.word} 的 pinyin "${w.pinyin}" 含汉字`).toBe(false)
    }
  })

  it('word 长度通常 1-4 字符', () => {
    for (const w of hsk1 as HskWord[]) {
      expect(w.word.length, `${w.word} 长度异常`).toBeGreaterThanOrEqual(1)
      expect(w.word.length, `${w.word} 长度异常`).toBeLessThanOrEqual(6)
    }
  })
})
