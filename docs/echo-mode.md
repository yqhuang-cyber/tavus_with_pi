# Echo 模式与 LiveKit 集成

> Phase 2 / T-204：当 Tavus full pipeline 出问题时，能切到 echo 模式，把 Pi 的 LLM 决策路径接到 LiveKit Agents。

## 为什么需要 echo 模式？

**Full pipeline（默认）**：Tavus 端完整控制视频流 + LLM + TTS + 多模态。
- 优点：低延迟（~200ms），开箱即用 Raven 多模态感知
- 缺点：依赖 Tavus 服务可用，工具调用要走 Tavus LLM

**Echo 模式**：Tavus 只提供"脸 + 嘴型同步"（lip-sync），Pi 端 LLM 决策，TTS 由 LiveKit 处理。
- 优点：完全自托管 LLM 决策，工具调用直连 Pi，无 Tavus 服务依赖
- 缺点：延迟高（~500ms），Raven 多模态不可用，要自己实现 ASR

## 架构对比

```
=== Full Pipeline ===
学生摄像头 → Tavus (Raven + LLM + TTS) → 视频流 → 学生
              ↓ function call
            tavus-bridge (Pi)
              ↓ response
            Tavus LLM

=== Echo Pipeline ===
学生摄像头 → Tavus (replica 视频) ─── echo back
              ↓ WebRTC
            LiveKit Agents (Pi 端 Python/Node)
              ↓ STT
            Pi LLM 决策
              ↓ tool call
            tavus-bridge (Pi)
              ↓ response
            Pi LLM
              ↓ TTS
            LiveKit Agents → Tavus lip-sync
```

## LiveKit Agents 集成

### 1. 安装

```bash
pip install livekit-agents livekit-plugins-tavus livekit-plugins-openai livekit-plugins-silero
```

或者 Node：
```bash
npm install @livekit/agents-plugin-tavus @livekit/agents-plugin-openai
```

### 2. 创建 echo agent

参考 [LiveKit Tavus plugin docs](https://docs.livekit.io/agents/integrations/tavus/)：

```python
# scripts/echo-agent.py
from livekit.agents import Agent, AgentSession, AutoSubscribe
from livekit.agents.integrations.tavus import TavusReplica
from livekit.agents.llm import function_tool
import aiohttp

TAVUS_REPLICA_ID = "rxxxxxxxx"  # 同一个 Kai replica
PI_BRIDGE_URL = "http://localhost:7123"


class KaiAgent(Agent):
    def __init__(self, student_id: str = "default"):
        super().__init__(
            instructions="""你的名字是 Kai ...  [PAL prompt 内容]""",
        )
        self.student_id = student_id

    @function_tool
    async def lookup_hsk_word(self, word: str) -> str:
        """查 HSK 词。"""
        async with aiohttp.ClientSession() as s:
            async with s.post(f"{PI_BRIDGE_URL}/tools/lookup_hsk_word", json={"word": word}) as r:
                return await r.text()

    @function_tool
    async def add_mistake(self, type: str, item: str, context: str = "") -> str:
        """记错题。"""
        async with aiohttp.ClientSession() as s:
            async with s.post(f"{PI_BRIDGE_URL}/tools/add_mistake", json={"type": type, "item": item, "context": context}) as r:
                return await r.text()

    # ... 其他 14 个工具 ...


async def main(ctx):
    tavus = TavusReplica(replica_id=TAVUS_REPLICA_ID, mode="echo")
    session = AgentSession(llm="gpt-4o", stt="deepgram", tts="elevenlabs")

    await session.start(
        agent=KaiAgent(student_id=ctx.room.metadata.get("student_id", "default")),
        room=ctx.room,
        video=tavus,
    )


if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(main)
```

### 3. 启动 echo agent

```bash
# 终端 1: 启动 tavus-bridge（仍然要，因为 LLM 调工具）
npm run bridge

# 终端 2: 启动 echo agent
LIVEKIT_URL=wss://your-livekit.livekit.cloud \
LIVEKIT_API_KEY=xxx \
LIVEKIT_API_SECRET=xxx \
TAVUS_REPLICA_ID=rxxxxxxxx \
python scripts/echo-agent.py dev
```

## 切换逻辑

在生产部署时，可以用环境变量或 feature flag 切换：

```python
# scripts/select-pipeline.py
import os

PIPELINE_MODE = os.getenv("PIPELINE_MODE", "full")

if PIPELINE_MODE == "full":
    # Tavus full pipeline + tavus-bridge
    print("Using Tavus full pipeline (PAL + tavus-bridge)")
    # 启动 tavus-bridge，Kai PAL 通过 Tavus platform 创建
elif PIPELINE_MODE == "echo":
    # Echo mode + LiveKit
    print("Using echo mode (LiveKit + Pi LLM + tavus-bridge)")
    # 启动 echo agent + tavus-bridge
```

## Fallback 策略

如果 Tavus 服务不可用：
1. 探测 Tavus API（GET /v2/personas/$PERSONA_ID）— 200 OK 才用 full
2. 失败则切 echo
3. 都失败则降级到纯文本（不发视频流，只发文字）

```python
async def select_pipeline():
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"https://tavusapi.com/v2/personas/{PERSONA_ID}",
                             headers={"x-api-key": TAVUS_API_KEY},
                             timeout=aiohttp.ClientTimeout(total=2)) as r:
                if r.status == 200:
                    return "full"
    except Exception:
        pass
    return "echo"
```

## 不实现的部分

我们 v1.0 暂时**不写** LiveKit echo agent 代码（只写文档）：
- 需要 Python 团队 / LiveKit 集成经验
- Tavus full pipeline 99% 情况下可用
- 一旦需要，从这份文档开始

## 验证清单

- [ ] Tavus full pipeline 在 sandbox 测试能开 conversation
- [ ] tavus-bridge 14 工具都能调通
- [ ] 4 画像占位符替换正确
- [ ] transcript 完整回传
- [ ] （可选）echo mode 跑通 fallback 路径

## 常见问题

### Q: 切换到 echo 后 latency 高很多怎么办？

- 优化 STT（用 deepgram 实时模式）
- 优化 LLM 流式（gpt-4o stream=True）
- 优化 TTS 预热（elevenlabs streaming）
- 减少不必要的工具调用

### Q: echo 模式能用 Raven 多模态吗？

不能。Raven 是 Tavus full pipeline 的一部分。echo 模式需要自己实现：
- 视觉线索：用 LiveKit vision plugin
- 语气线索：用 silero VAD 检测停顿

### Q: 两个 pipeline 能并存吗？

能。建议架构：
- 主：full pipeline（99% 时间）
- 备：echo pipeline（failover）
- 选：探测机制 + 自动切换
