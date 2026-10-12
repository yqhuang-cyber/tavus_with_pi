---
name: zh-pronunciation
description: 教学生中文发音。声母韵母声调最小对立对（minimal pairs）+ 学生发音问题针对性训练。Use when student asks about pronunciation, /发音 command, or when student's pronunciation_issues list has 3+ items.
---

## 触发场景

- 学生输入 `/发音`
- 学生问"这个怎么说？""这个音怎么发？"
- 学生说某个音时明显错了
- 学生 learning_profile.pronunciation_issues 有 3+ 个未解决项

## 教学法

### 最小对立对（Minimal Pairs）

学生母语（默认 English） vs 中文 的常见混淆：

#### 1. 声母混淆

**l vs n** (English: usually ɹ or l)
- 你 (nǐ) vs 里 (lǐ)
- 哪 (nǎ) vs 拉 (lā)
- 女 (nǚ) vs 旅 (lǚ)
- 训练方法：n- 用舌尖顶上齿龈，气流从鼻出；l- 舌尖顶上齿龈，气流从舌两侧出

**z/zh vs j**
- 在 (zài) vs 借 (jiè)
- 字 (zì) vs 鸡 (jī)
- 训练方法：z- 舌尖前、不送气；j- 舌面、不送气

**s/sh vs x**
- 死 (sǐ) vs 洗 (xǐ)
- 四 (sì) vs 系 (xì)
- 训练方法：s- 舌尖前；x- 舌面

**r vs l**
- 热 (rè) vs 乐 (lè)
- 人 (rén) vs 冷 (lěng)
- 训练方法：r- 卷舌，接近 English "measure"；l- 不卷舌

**f vs h**
- 发 (fā) vs 花 (huā)
- 夫 (fū) vs 呼 (hū)
- 训练方法：f- 上齿抵下唇；h- 舌根抬高

#### 2. 韵母混淆

**-n vs -ng**
- 班 (bān) vs 帮 (bāng)
- 门 (mén) vs 蒙 (méng)
- 训练方法：-n 舌尖抵上齿龈；-ng 舌根抵软腭，嘴张开

**-i vs -u**
- 鸡 (jī) vs 居 (jū)
- 训练方法：-i 嘴平；-u 嘴圆

#### 3. 声调混淆（最关键！）

**English speakers 母语负迁移**：
- 1 声 (high level) → 像 high note 拖长
- 2 声 (rising) → 像"啥?"那个问号语气
- 3 声 (fall-rise) → 像"嗯?"那个犹豫
- 4 声 (falling) → 像"走!"那个命令

**常见混淆对**：
- 妈 (mā, 1) vs 麻 (má, 2) vs 马 (mǎ, 3) vs 骂 (mà, 4)
- 买 (mǎi, 3) vs 卖 (mài, 4) → 购物场景必学
- 问 (wèn, 4) vs 温 (wēn, 1) → 问路场景必学

**训练方法**：
1. **手势**：1 声平线，2 声上升，3 声先降后升，4 声直线下降
2. **数字记忆**：1-2-3-4 对应 ā-á-ǎ-à
3. **唱调练习**：用 4 个声调唱"ma ma ma ma"
4. **最小对立对**："Mā (mom) loves 麻 (hemp)?" → 用故事区分

### 学生薄弱点训练

调 `student_profile.get_learning`：
- 如果 pronunciation_issues 包含 "l_n" → 优先做 l/n 练习
- 如果包含 "tone2" → 重点 2 声
- 没有就调 `hsk_random_words` 抽 3-5 个 HSK 1 词做覆盖

## 流程

```
1. 评估：get_learning 查 pronunciation_issues
2. 选对立对：根据 issues 选 3-5 对
3. 演示：先说英文对照（"This is a question, like 'what?'"），然后示范两遍
4. 听辨：放音 → 问学生哪个是 X 哪个是 Y
5. 跟读：学生跟读 → 标记问题
6. 重复：直到能正确区分
7. 实战：放进 HSK 词组里练
8. 记录：student_profile.update_learning pronunciation_issues 减少
```

## 输出格式（每轮 ≤ 4 句）

```
Kai: 我们今天练 l 和 n 的区别。
[对话] 你说 "你叫什么名字" — 那个 ni 听起来更像 li。
[示范] n-（舌尖顶上齿龈，气流从鼻出）— 你 (nǐ)
       l-（舌尖顶上齿龈，气流从舌两边出）— 里 (lǐ)
[引导] 跟我读："你叫李丽。"（"You're called Li Li."）
```

不要堆术语，用身体部位 + 气流描述。

## 工具调用

- 查 `learning_profile.pronunciation_issues` → student_profile.get_learning
- 更新问题清单 → student_profile.update_learning
- 加入错题 → mistake_log add type=pronunciation
- 加 FSRS 卡 → fsrs_schedule add

## 边界

- **不**教拼音方案细节（韵母表、声母表）
- **不**教国际音标
- **不**让学生写拼音
- **不**超过 5 分钟（怕学生疲）
- 教完用 1 句总结「你今天掌握了...」

## 已知挑战

- English speakers 第 3 声最难（fall-rise）→ 用 "uh-huh" 那种犹豫语气
- 第 2 声要明显上升（"really??"）
- "r" 音（热、人）→ 让学生卷舌 + 嘴巴张开
- "ü"（绿、女）→ 让学生说英语 "ee" + 嘴圆
