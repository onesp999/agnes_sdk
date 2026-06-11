# Agnes AI SDK Project - Codex 执行单

## 0. 需求理解

用户希望新建一个项目，将 Agnes AI API 封装为可复用 SDK：

- 提供 Python SDK，方便 Python / FastAPI / 后端项目集成。
- 提供 JavaScript / TypeScript SDK，方便 Node.js / Web 后端项目集成。
- 项目内提供一个简单前端调试页面，用于测试 Chat、Image、Video 三类接口。
- 目标不是只写几个请求示例，而是形成可被其他项目引入、配置、测试和维护的 SDK 工程。

本执行单基于用户提供的 `agnes_ai_api_docs_integrated.md`。当前是新项目需求，未读取既有 GitHub 仓库；如果 Codex 实际执行时发现已有仓库结构，应以真实仓库为准，并说明差异。

---

## 1. 关键产品与工程判断

### 1.1 推荐项目定位

将项目定位为一个 monorepo：

```text
agnes-ai-sdk/
  docs/
  packages/
    python/
    javascript/
  examples/
    python-fastapi/
    node-express/
  apps/
    playground/
```

原因：

1. Python SDK、JS SDK、示例后端和调试前端属于同一 API 接入体系，放在一个仓库便于同步维护。
2. 两个 SDK 需要共享同一份 API 语义：模型名、endpoint、错误结构、视频轮询规则、图片参数兼容策略。
3. 前端调试页不能直接持有 API Key，必须通过本地示例后端代理调用。
4. Video API 是异步任务接口，SDK 必须提供 `create`、`retrieve`、`wait` 等能力，而不只是普通 POST 封装。

### 1.2 非目标

本期不做以下内容：

- 不做正式商业控制台。
- 不做用户登录、权限系统、计费系统。
- 不做云端部署流水线。
- 不发布到 PyPI / npm，只把包结构、构建配置和发布前准备做好。
- 不在前端页面填写或保存真实 API Key。
- 不承诺 Agnes API 文档中未确认字段一定正确，必须在 SDK 中保留兼容与实测说明。

---

## 2. API 文档摘要

### 2.1 通用信息

- Base URL: `https://apihub.agnes-ai.com`
- 认证方式：`Authorization: Bearer YOUR_API_KEY`
- Content-Type: `application/json`
- API Key 必须通过环境变量注入，禁止出现在前端、日志、截图和公开代码中。

### 2.2 Chat API

- Model: `agnes-2.0-flash`
- Endpoint: `POST /v1/chat/completions`
- 支持：普通 Chat Completion、多轮对话、图片 URL 输入、工具调用、Thinking 参数、流式输出。
- 关键请求字段：`model`、`messages`、`temperature`、`top_p`、`max_tokens`、`stream`、`tools`、`tool_choice`、`chat_template_kwargs`、`thinking`。

### 2.3 Image API

- Model: `agnes-image-2.1-flash`
- Endpoint: `POST /v1/images/generations`
- 支持：文生图、图生图、URL 输出、Base64 输出。
- 文生图 URL 输出使用：`extra_body.response_format = "url"`
- 文生图 Base64 输出使用：`return_base64 = true`
- 图生图示例优先使用：`extra_body.image = [...]`
- 文档中图片字段存在未确认点：参数表提到顶层 `image`，示例多使用 `extra_body.image`。SDK 需要默认使用 `extra_body.image`，并允许调用方切换或透传顶层 `image`。

### 2.4 Video API

- Model: `agnes-video-v2.0`
- 创建任务：`POST /v1/videos`
- 推荐查询：`GET /agnesapi?video_id=<VIDEO_ID>`
- 旧版兼容查询：`GET /v1/videos/{task_id}`
- 支持：文生视频、图生视频、多图视频、关键帧动画。
- `num_frames <= 441`，且必须满足 `8n + 1`。
- `frame_rate` 支持 `1-60`。
- 推荐轮询间隔：5 秒。
- 最终视频 URL 字段存在未确认点：示例返回 `remixed_from_video_id`，文档说明又提到 `video_url`。SDK 需要兼容读取：`video_url || remixed_from_video_id`。

---

## 3. 总体架构建议

### 3.1 目录结构

Codex 优先按以下结构创建项目：

```text
agnes-ai-sdk/
  README.md
  .gitignore
  .env.example
  docs/
    agnes_ai_api_docs_integrated.md
    sdk-design.md
  packages/
    python/
      pyproject.toml
      README.md
      src/
        agnes_ai/
          __init__.py
          client.py
          chat.py
          images.py
          videos.py
          errors.py
          types.py
          config.py
      tests/
    javascript/
      package.json
      tsconfig.json
      README.md
      src/
        index.ts
        client.ts
        chat.ts
        images.ts
        videos.ts
        errors.ts
        types.ts
      tests/
  examples/
    python-fastapi/
      README.md
      app.py
      requirements.txt
      .env.example
    node-express/
      README.md
      package.json
      src/
        server.ts
      .env.example
  apps/
    playground/
      package.json
      index.html
      src/
        main.tsx
        App.tsx
        api.ts
        components/
          ChatPanel.tsx
          ImagePanel.tsx
          VideoPanel.tsx
```

### 3.2 推荐技术栈

- Python SDK：Python 3.9+、`httpx`、`pydantic` 可选、`pytest`、`respx` 或 `pytest-httpx`。
- JS SDK：TypeScript、Node 18+ 原生 `fetch` 或 `undici`、`vitest`、`tsup`。
- Python 示例后端：FastAPI + Uvicorn。
- Node 示例后端：Express 或 Fastify。
- 调试前端：Vite + React + TypeScript。

如果 Codex 判断为了最小实现可以先不用 React，也可以用 Vite + 原生 TypeScript，但需要保持可维护的模块化结构。

### 3.3 关键安全约束

- 前端调试页只访问本地示例后端，例如 `http://localhost:3001/api/chat`。
- Agnes API Key 只存在于后端 `.env`，例如 `AGNES_API_KEY`。
- `.env.example` 只提供占位值，不放真实 Key。
- 日志中不得输出完整 Authorization Header、Base64 图片内容、敏感图片 URL 或用户隐私原文。
- SDK 错误对象可以包含 status code、request id、endpoint、简短错误消息，但不能包含 API Key。

---

# Codex Task 1 - 初始化 monorepo 与基础文档

## Goal

创建 Agnes AI SDK 新项目的基础结构，明确 Python SDK、JS SDK、示例后端、前端调试页的目录边界。

## Non-Goals

- 不实现具体 API 调用逻辑。
- 不接入真实 Agnes API。
- 不引入复杂发布流水线。

## Repository Context

- 项目类型：新建 SDK monorepo。
- 技术栈：Python SDK + TypeScript SDK + 示例后端 + Vite 调试前端。
- 相关目录：`packages/python`、`packages/javascript`、`examples`、`apps/playground`、`docs`。
- 当前逻辑摘要：无既有代码。
- 未确认信息：实际仓库是否已有结构，Codex 执行时以真实仓库为准。

## Required Behavior

- 创建清晰的 monorepo 目录。
- 添加根目录 `README.md`，说明项目目标、模块划分和安全注意事项。
- 添加 `.env.example`，包含 `AGNES_API_KEY`、`AGNES_BASE_URL`。
- 将用户提供的 API 整合文档放入 `docs/agnes_ai_api_docs_integrated.md`，如果仓库中已有该文档则不要重复创建。
- 添加 `docs/sdk-design.md`，说明 SDK 设计原则：统一认证、统一错误、视频轮询、前端不暴露 Key、Image 字段兼容。

## Implementation Plan

1. 创建基础目录结构。
2. 创建根 README，写清楚各模块用途。
3. 创建 `.gitignore`，至少忽略 `.env`、Python 缓存、Node 依赖、构建产物。
4. 创建 `.env.example`。
5. 创建 `docs/sdk-design.md`，沉淀本执行单中的架构决策。

## Constraints

- 只做项目骨架和文档，不写 SDK 实现。
- 不提交真实 API Key。
- 不创建过度复杂的 DevOps 配置。

## Suggested Tests

- 检查目录结构是否符合执行单。
- 检查 README 是否能让新开发者理解项目用途。
- 检查 `.gitignore` 是否覆盖 `.env`。

## Verification Commands

```bash
# 本任务主要为文件结构检查，无强制测试命令。
find . -maxdepth 3 -type f | sort
```

## Done Criteria

- [ ] 基础目录结构已创建。
- [ ] README、.env.example、.gitignore、docs/sdk-design.md 已创建。
- [ ] 文档明确说明前端不能暴露 API Key。
- [ ] 没有真实密钥进入仓库。

---

# Codex Task 2 - 定义共享 API 语义与错误模型

## Goal

在两个 SDK 实现前，先统一 API 常量、错误模型、请求配置和响应兼容策略，避免 Python 与 JS SDK 行为不一致。

## Non-Goals

- 不实现完整请求客户端。
- 不写前端页面。

## Repository Context

- 项目类型：SDK monorepo。
- 相关文件：`docs/sdk-design.md`、`packages/python/src/agnes_ai/*`、`packages/javascript/src/*`。
- 当前逻辑摘要：Task 1 完成后已有目录与基础文档。
- 未确认信息：Agnes API 的错误响应 body 真实结构，需要后续实测。

## Required Behavior

- 定义默认常量：
  - `DEFAULT_BASE_URL = "https://apihub.agnes-ai.com"`
  - `CHAT_MODEL = "agnes-2.0-flash"`
  - `IMAGE_MODEL = "agnes-image-2.1-flash"`
  - `VIDEO_MODEL = "agnes-video-v2.0"`
  - Chat endpoint: `/v1/chat/completions`
  - Image endpoint: `/v1/images/generations`
  - Video create endpoint: `/v1/videos`
  - Video query endpoint: `/agnesapi`
- 统一错误类型：
  - API authentication error。
  - API bad request error。
  - API rate/server error。
  - API timeout error。
  - Video task failed error。
- 统一配置项：
  - `apiKey`
  - `baseUrl`
  - `timeout`
  - `maxRetries`
  - `retryBackoff`
  - `defaultHeaders`
- 统一重试原则：
  - 400 不盲目重试。
  - 401 不重试。
  - 404 通常不重试。
  - 500 / 503 可有限指数退避重试。
- 统一日志约束：不得输出 API Key、Base64 原文、完整 Authorization Header。

## Implementation Plan

1. 在设计文档补充 API 常量与错误模型。
2. 在 Python SDK 与 JS SDK 中预留常量和错误类文件。
3. 明确 Image API 的 `extra_body.image` 默认策略。
4. 明确 Video API 的 `video_url || remixed_from_video_id` 兼容读取策略。
5. 明确视频参数校验函数：`num_frames <= 441` 且 `(num_frames - 1) % 8 == 0`，`frame_rate` 在 `1-60`。

## Constraints

- 不要因为追求抽象而引入复杂共享代码生成。
- Python 与 JS 可以各自实现类型，但语义必须一致。
- 未经实测的字段必须在文档中标注为兼容策略，而不是绝对事实。

## Suggested Tests

- 单元测试常量值。
- 单元测试错误对象不包含 API Key。
- 单元测试视频参数校验。
- 单元测试视频 URL 字段兼容读取。

## Verification Commands

```bash
# 具体命令等对应包初始化后执行。
# Python: pytest
# JavaScript: pnpm test 或 npm test
```

## Done Criteria

- [ ] 常量、错误模型、配置项已明确。
- [ ] Python 与 JS SDK 的语义命名一致。
- [ ] 视频参数校验规则有测试。
- [ ] Image 字段兼容策略有文档说明。
- [ ] Video URL 字段兼容策略有测试或计划。

---

# Codex Task 3 - 实现 Python SDK MVP

## Goal

实现可被 Python 项目直接引入的 Agnes AI Python SDK，覆盖 Chat、Image、Video 三类接口的最小可用能力。

## Non-Goals

- 不发布到 PyPI。
- 不做复杂异步双客户端，除非 Codex 判断成本很低。
- 不写业务系统集成逻辑。

## Repository Context

- 项目类型：Python SDK package。
- 相关目录：`packages/python`。
- 相关文件：`pyproject.toml`、`src/agnes_ai/client.py`、`chat.py`、`images.py`、`videos.py`、`errors.py`、`types.py`、`config.py`、`tests/`。
- 当前逻辑摘要：Task 1/2 应已完成骨架、常量、错误模型。
- 未确认信息：Agnes API 错误响应 body 的真实字段结构。

## Required Behavior

Python SDK 应至少提供：

```python
from agnes_ai import AgnesClient

client = AgnesClient(api_key="YOUR_API_KEY")

chat_result = client.chat.create(
    messages=[{"role": "user", "content": "Hello"}],
)

image_result = client.images.generate(
    prompt="A clean product photo of a glass cube",
    size="1024x768",
    response_format="url",
)

video_task = client.videos.create(
    prompt="A cat walking on the beach at sunset",
    num_frames=121,
    frame_rate=24,
)

video_result = client.videos.wait(video_task["video_id"])
```

必须覆盖的方法：

- `client.chat.create(...)`
  - 默认填充 `model="agnes-2.0-flash"`。
  - 支持 `messages`、`temperature`、`top_p`、`max_tokens`、`tools`、`tool_choice`、`chat_template_kwargs`、`thinking`。
- `client.chat.stream(...)`
  - 支持 `stream=True`。
  - 能返回可迭代的原始流式片段或解析后的文本片段。
  - 如果实际流式格式未确认，应先实现透明 pass-through，并在 README 标注。
- `client.images.generate(...)`
  - 默认填充 `model="agnes-image-2.1-flash"`。
  - 支持文生图 URL 输出。
  - 支持文生图 Base64 输出。
  - 支持图生图，默认使用 `extra_body.image`。
  - 支持调用方透传 `extra_body`。
- `client.videos.create(...)`
  - 默认填充 `model="agnes-video-v2.0"`。
  - 支持 `prompt`、`image`、`height`、`width`、`num_frames`、`frame_rate`、`num_inference_steps`、`seed`、`negative_prompt`、`extra_body`。
  - 校验 `num_frames` 和 `frame_rate`。
- `client.videos.retrieve(video_id, model_name=None)`
  - 默认请求 `/agnesapi?video_id=...`。
  - 可选传入 `model_name=agnes-video-v2.0`。
- `client.videos.retrieve_legacy(task_id)`
  - 请求 `/v1/videos/{task_id}`。
- `client.videos.wait(video_id, timeout_seconds=600, poll_interval_seconds=5)`
  - 轮询直到 `completed` 或 `failed` 或超时。
  - `completed` 时返回完整结果，并提供兼容字段 `video_url = data.get("video_url") or data.get("remixed_from_video_id")`。
  - `failed` 时抛出明确异常。

## Implementation Plan

1. 配置 `pyproject.toml`，包名建议 `agnes-ai-sdk` 或 `agnes-ai`，Codex 可按可用性选择，但 README 需一致。
2. 使用 `httpx.Client` 实现基础 HTTP Client。
3. 在 `config.py` 中处理环境变量：`AGNES_API_KEY`、`AGNES_BASE_URL`。
4. 在 `errors.py` 中定义 SDK 异常。
5. 在 `chat.py`、`images.py`、`videos.py` 中拆分资源客户端。
6. 在 `client.py` 中组合资源客户端。
7. 补充单元测试：使用 mock HTTP，不依赖真实 Agnes API。
8. 补充 Python README，给出安装、配置、Chat/Image/Video 示例。

## Constraints

- 不要把 API Key 打印到异常或日志中。
- 不要在测试中请求真实外部 API。
- 不要在 SDK 内硬编码用户业务 prompt。
- 不要吞掉 HTTP 错误，必须抛出可识别异常。
- 不要为了类型完美而阻塞 MVP；未知响应字段允许保留 `dict`。

## Suggested Tests

- `AgnesClient(api_key=None)` 且环境变量缺失时抛出配置错误。
- Chat 请求会发送正确 endpoint、headers、model、messages。
- Image 文生图 URL 输出时 `response_format` 位于 `extra_body`。
- Image Base64 输出时支持 `return_base64=True`。
- Image 图生图默认把输入图片放进 `extra_body.image`。
- Video 创建任务会校验 `num_frames`。
- Video `wait` 在 `queued -> in_progress -> completed` 时返回结果。
- Video `wait` 在 `failed` 时抛出 `AgnesVideoTaskFailedError`。
- Video URL 兼容 `video_url` 与 `remixed_from_video_id`。
- 401 响应不会重试。
- 503 响应可有限重试。

## Verification Commands

```bash
cd packages/python
python -m pip install -e ".[dev]"
python -m pytest
```

如果 Codex 选择了不同的 Python 包管理方式，请以实际配置为准，并在最终说明中写明。

## Done Criteria

- [ ] Python SDK 可本地安装。
- [ ] Chat/Image/Video 核心方法可被导入和调用。
- [ ] 关键请求体符合 API 文档。
- [ ] 单元测试通过。
- [ ] README 有最小使用示例。
- [ ] 错误处理不泄露 API Key。

---

# Codex Task 4 - 实现 JavaScript / TypeScript SDK MVP

## Goal

实现可被 Node.js 项目引入的 Agnes AI JS/TS SDK，覆盖 Chat、Image、Video 三类接口。

## Non-Goals

- 不发布到 npm。
- 不支持浏览器直连 Agnes API，因为会暴露 API Key。
- 不实现复杂前端状态管理。

## Repository Context

- 项目类型：TypeScript SDK package。
- 相关目录：`packages/javascript`。
- 相关文件：`package.json`、`tsconfig.json`、`src/client.ts`、`chat.ts`、`images.ts`、`videos.ts`、`errors.ts`、`types.ts`、`tests/`。
- 当前逻辑摘要：Task 1/2 应已完成骨架、常量、错误模型。
- 未确认信息：Agnes API 的真实错误响应结构和 Chat stream SSE 格式。

## Required Behavior

JS SDK 应至少提供：

```ts
import { AgnesClient } from "@agnes-ai/sdk";

const client = new AgnesClient({ apiKey: process.env.AGNES_API_KEY! });

const chatResult = await client.chat.create({
  messages: [{ role: "user", content: "Hello" }],
});

const imageResult = await client.images.generate({
  prompt: "A clean product photo of a glass cube",
  size: "1024x768",
  responseFormat: "url",
});

const videoTask = await client.videos.create({
  prompt: "A cat walking on the beach at sunset",
  numFrames: 121,
  frameRate: 24,
});

const videoResult = await client.videos.wait(videoTask.video_id);
```

必须覆盖的方法：

- `client.chat.create(options)`
  - 默认 `model="agnes-2.0-flash"`。
  - 支持多模态 content、tools、toolChoice、thinking、chatTemplateKwargs。
- `client.chat.stream(options)`
  - 自动添加 `stream: true`。
  - 若 SSE 格式未确认，先提供 `AsyncIterable<string | Uint8Array>` 或透明 chunk 迭代。
- `client.images.generate(options)`
  - 默认 `model="agnes-image-2.1-flash"`。
  - 支持 `responseFormat: "url" | "b64_json"`。
  - URL 输出通过 `extra_body.response_format`。
  - Base64 文生图支持 `return_base64`。
  - 图生图默认通过 `extra_body.image`。
- `client.videos.create(options)`
  - 默认 `model="agnes-video-v2.0"`。
  - 支持 `prompt`、`image`、`height`、`width`、`numFrames`、`frameRate`、`numInferenceSteps`、`seed`、`negativePrompt`、`extraBody`。
  - SDK 内部将 camelCase 转为 Agnes API 需要的 snake_case。
- `client.videos.retrieve(videoId, options?)`
  - 默认请求 `/agnesapi?video_id=...`。
- `client.videos.retrieveLegacy(taskId)`
  - 请求 `/v1/videos/{task_id}`。
- `client.videos.wait(videoId, options?)`
  - 支持 `timeoutMs`、`pollIntervalMs`。
  - 兼容读取 `video_url || remixed_from_video_id`。

## Implementation Plan

1. 配置 TypeScript 包结构。
2. 使用 Node 18+ `fetch` 或 `undici` 实现 HTTP Client。
3. 实现统一请求方法：baseUrl 拼接、headers、timeout、retry、JSON 解析。
4. 实现错误类，确保错误 message 不包含 API Key。
5. 实现 Chat、Image、Video resource clients。
6. 实现类型定义，优先覆盖请求参数；响应可保留扩展字段。
7. 使用 `vitest` 和 fetch mock 写单元测试。
8. 补充 JS SDK README。

## Constraints

- SDK 定位为 server-side SDK，不要鼓励浏览器端直接使用。
- 不要在 SDK 中依赖 Vite 或 React。
- 不要使用真实 API Key。
- 不要默认把 Base64 响应写入日志。
- 对未知响应字段保持兼容，不要过度收窄类型。

## Suggested Tests

- 构造 client 时缺少 apiKey 应报错，除非环境变量存在。
- Chat 请求体包含默认 model。
- Image `responseFormat: "url"` 映射到 `extra_body.response_format`。
- Image 图生图时图片进入 `extra_body.image`。
- Video 创建请求 camelCase 能正确转 snake_case。
- Video 参数校验覆盖非法 `numFrames` 与 `frameRate`。
- Video wait 覆盖 completed、failed、timeout。
- 401 不重试，503 可重试。

## Verification Commands

```bash
cd packages/javascript
pnpm install
pnpm test
pnpm build
```

如果 Codex 选择 npm 而不是 pnpm，请统一修改 README 与命令说明。

## Done Criteria

- [ ] JS/TS SDK 可构建。
- [ ] TypeScript 类型可用。
- [ ] Chat/Image/Video 核心方法可调用。
- [ ] 单元测试通过。
- [ ] README 明确说明该 SDK 不应在浏览器端直连使用。

---

# Codex Task 5 - 创建 Python 与 Node 示例后端

## Goal

提供两个最小示例后端，分别展示 Python SDK 和 JS SDK 如何被其他后端项目集成，同时为前端调试页提供安全代理能力。

## Non-Goals

- 不做生产级鉴权。
- 不做数据库持久化。
- 不做云端部署。
- 不做复杂队列系统。

## Repository Context

- 项目类型：SDK example apps。
- 相关目录：`examples/python-fastapi`、`examples/node-express`。
- 当前逻辑摘要：Task 3/4 完成后已有 Python SDK 与 JS SDK。
- 未确认信息：真实 API 调用需用户提供有效 `AGNES_API_KEY`。

## Required Behavior

两个示例后端都应提供类似接口，便于前端切换：

```text
GET  /health
POST /api/chat
POST /api/images
POST /api/videos
GET  /api/videos/:videoId
POST /api/videos/:videoId/wait    # 可选，避免前端自己轮询 Agnes
```

行为要求：

- 从环境变量读取 `AGNES_API_KEY` 和 `AGNES_BASE_URL`。
- 前端请求后端时不需要也不能传 Agnes API Key。
- `/api/chat` 调用 SDK 的 Chat 方法。
- `/api/images` 调用 SDK 的 Image 方法。
- `/api/videos` 创建视频任务。
- `/api/videos/:videoId` 查询视频状态。
- 返回给前端的错误信息要可读，但不泄露敏感信息。
- 两个示例后端都提供 `.env.example` 和 README。

## Implementation Plan

1. 在 `examples/python-fastapi` 中创建 FastAPI 示例。
2. 在 `examples/node-express` 中创建 Express 示例。
3. 两个后端都引用本仓库 SDK 包。
4. 统一 API request / response shape，减少前端适配成本。
5. 加入基础 CORS 配置，仅允许本地开发地址。
6. 加入健康检查接口。
7. README 写清楚启动方式和安全注意事项。

## Constraints

- 后端示例只作为本地调试和集成参考，不要伪装成生产模板。
- 不要把用户传入内容完整打入日志。
- 不要将 `.env` 提交到仓库。
- CORS 不要默认 `*` 用于生产说明；本地示例可以有限放开并在 README 标注。

## Suggested Tests

- 无 API Key 启动或调用时给出明确错误。
- `/health` 正常返回。
- 使用 mock SDK 或 mock API 测试路由能调用对应 SDK 方法。
- 错误响应不包含 API Key。

## Verification Commands

```bash
# Python example
cd examples/python-fastapi
python -m pip install -r requirements.txt
uvicorn app:app --reload

# Node example
cd examples/node-express
pnpm install
pnpm dev
```

实际命令以 Codex 创建的配置为准。

## Done Criteria

- [ ] Python FastAPI 示例能启动。
- [ ] Node Express 示例能启动。
- [ ] 两个示例都通过环境变量读取 API Key。
- [ ] 两个示例都不要求前端传 API Key。
- [ ] README 有启动说明和接口说明。

---

# Codex Task 6 - 创建前端调试 Playground

## Goal

创建一个简单前端页面，通过本地示例后端调试 Agnes Chat、Image、Video 能力。

## Non-Goals

- 不做正式 UI 设计系统。
- 不做用户账户、历史记录、云端保存。
- 不在浏览器中保存或输入 Agnes API Key。
- 不直接从浏览器请求 `https://apihub.agnes-ai.com`。

## Repository Context

- 项目类型：Vite + React + TypeScript 调试前端。
- 相关目录：`apps/playground`。
- 依赖：Task 5 的本地示例后端。
- 当前逻辑摘要：示例后端应已提供 `/api/chat`、`/api/images`、`/api/videos` 等接口。

## Required Behavior

前端至少包含三个 Tab 或三个区域：

### Chat 调试

- 输入 prompt。
- 可选输入 system prompt。
- 可选设置 temperature、max_tokens。
- 点击发送后展示原始 JSON 响应和 assistant content。
- 后续可扩展 stream，但 MVP 可以先做非流式。

### Image 调试

- 输入 prompt。
- 输入 size，默认 `1024x768`。
- 选择输出格式：URL 或 Base64。
- 可选输入图片 URL，用于图生图。
- 展示生成图片 URL 或 Base64 预览。
- 展示原始 JSON 响应。

### Video 调试

- 输入 prompt。
- 可选输入 image URL。
- 设置 width、height、num_frames、frame_rate。
- 前端对 `num_frames` 做基础校验：`<=441` 且满足 `8n+1`。
- 点击创建任务后展示 `task_id`、`video_id`、status、progress。
- 支持手动查询视频状态。
- 支持轮询查询，默认 5 秒一次。
- completed 后展示视频 URL，并可预览 `<video controls>`。
- failed 后展示错误。

## Implementation Plan

1. 创建 Vite + React + TS 应用。
2. 封装 `apps/playground/src/api.ts`，统一请求本地后端。
3. 创建 `ChatPanel`、`ImagePanel`、`VideoPanel`。
4. 页面顶部提供 Backend Base URL 输入，默认 `http://localhost:3001` 或 `.env` 中的 `VITE_PLAYGROUND_API_BASE_URL`。
5. 加入 loading、error、raw JSON 展示。
6. README 写清楚：先启动后端，再启动前端。

## Constraints

- 前端代码中不得出现 `AGNES_API_KEY`。
- 不要把 API Key 放入 localStorage、sessionStorage、URL query。
- 不要直接调用 Agnes 官方 API。
- UI 简洁即可，重点是调试闭环。

## Suggested Tests

- 前端 API 封装单元测试或轻量组件测试。
- 手动验证 Chat 能展示文本。
- 手动验证 Image 能展示 URL 图片。
- 手动验证 Video 能创建任务并查询状态。
- 检查构建产物不包含 `AGNES_API_KEY` 字符串。

## Verification Commands

```bash
cd apps/playground
pnpm install
pnpm dev
pnpm build
```

实际命令以 Codex 创建的配置为准。

## Done Criteria

- [ ] Playground 可启动。
- [ ] Chat/Image/Video 三个面板可用。
- [ ] 前端只请求本地后端。
- [ ] 前端没有 API Key 输入框或硬编码。
- [ ] Video 支持轮询与结果预览。

---

# Codex Task 7 - 补充测试、示例、文档与发布前检查

## Goal

让项目达到“可交给其他项目试集成”的状态：有 README、有示例、有 mock 测试、有安全说明、有真实 API smoke test 指南。

## Non-Goals

- 不执行正式发布。
- 不承诺真实 Agnes API 在无 Key 环境下通过。
- 不做复杂 CI/CD，除非仓库已有相关约定。

## Repository Context

- 项目类型：SDK monorepo。
- 相关目录：根目录、`packages/python`、`packages/javascript`、`examples`、`apps/playground`、`docs`。
- 当前逻辑摘要：Task 1-6 应已完成。
- 未确认信息：真实 API smoke test 需要用户提供有效 Key 和额度。

## Required Behavior

- 根 README 包含：
  - 项目简介。
  - 支持能力表：Chat、Image、Video。
  - Python SDK 使用示例。
  - JS SDK 使用示例。
  - 示例后端启动方式。
  - Playground 启动方式。
  - API Key 安全说明。
  - 文档未确认点：Image 图片字段、Video URL 字段。
- Python SDK README 包含：安装、配置、Chat/Image/Video 示例。
- JS SDK README 包含：安装、配置、Chat/Image/Video 示例，并明确 server-side only。
- examples README 包含：如何启动本地后端，如何配合 Playground。
- docs 增加 `smoke-test.md`：
  - 如何设置 `AGNES_API_KEY`。
  - 如何运行最小真实请求。
  - 哪些接口可能产生费用或耗时。
  - 失败时如何排查 400/401/503。
- 确保测试分为：
  - mock 单元测试：默认运行，不请求真实 API。
  - smoke test：需要显式环境变量，例如 `RUN_AGNES_SMOKE_TESTS=1` 才运行。

## Implementation Plan

1. 补齐各模块 README。
2. 补齐 smoke test 文档。
3. 检查测试是否默认不访问外网。
4. 检查所有 `.env.example` 都是占位值。
5. 检查日志与错误是否不泄露 Key。
6. 运行 Python 和 JS 的测试与构建命令。
7. 输出最终修改摘要、验证结果和剩余风险。

## Constraints

- 不要把 smoke test 做成默认测试。
- 不要将真实 API 返回的大体积 Base64 写进 fixture。
- 不要在 README 中宣传未实测的价格信息为确定事实。
- 价格、额度、模型可用性以 Agnes 控制台为准。

## Suggested Tests

- Python 单元测试全量通过。
- JS 单元测试全量通过。
- JS SDK build 通过。
- Playground build 通过。
- grep 检查是否有疑似密钥泄露。

## Verification Commands

```bash
# Python SDK
cd packages/python
python -m pytest

# JavaScript SDK
cd packages/javascript
pnpm test
pnpm build

# Playground
cd apps/playground
pnpm build

# Secret scan: 简单检查，不能替代专业密钥扫描
cd ../../
grep -R "Bearer " . --exclude-dir=node_modules --exclude-dir=.git || true
grep -R "AGNES_API_KEY=.*[^YOUR_API_KEY]" . --exclude-dir=node_modules --exclude-dir=.git || true
```

如果路径层级与实际仓库不同，请 Codex 按真实目录修正命令。

## Done Criteria

- [ ] 根 README 可指导新项目集成。
- [ ] Python SDK README 可独立使用。
- [ ] JS SDK README 可独立使用。
- [ ] 示例后端和 Playground 有明确启动步骤。
- [ ] mock 测试默认不访问真实外部 API。
- [ ] smoke test 需要显式启用。
- [ ] 没有真实 Key 或敏感数据进入仓库。
- [ ] Codex 最终说明修改文件、验证命令、验证结果、剩余风险。

---

## 4. 建议执行顺序

不要一次性让 Codex 完成全部任务。建议按以下顺序分批执行：

1. Task 1：初始化 monorepo 与基础文档。
2. Task 2：定义共享 API 语义与错误模型。
3. Task 3：实现 Python SDK MVP。
4. Task 4：实现 JS/TS SDK MVP。
5. Task 5：创建 Python 与 Node 示例后端。
6. Task 6：创建前端 Playground。
7. Task 7：补充测试、示例、文档与发布前检查。

每个任务完成后，要求 Codex 输出：

- 修改文件列表。
- 核心实现摘要。
- 已运行的测试 / 构建命令。
- 失败命令及原因。
- 与本执行单不一致的地方。
- 剩余风险。

---

## 5. 给 Codex 的总约束

- 只做当前任务相关的最小修改。
- 不要进行需求外重构。
- 不要修改无关文件。
- 不要引入新依赖，除非确有必要并说明理由。
- 不要提交真实 API Key。
- 不要让前端直接请求 Agnes 官方 API。
- 不要让前端输入、保存、展示 API Key。
- 不要在日志中输出 Authorization Header、Base64 大体积内容或用户敏感输入。
- 如果本执行单与真实 API 文档或真实代码不一致，以真实信息为准，并说明差异。
- Codex 负责真实代码修改、测试运行和验证结果说明。

---

## 6. 风险清单

### 6.1 API 文档字段未确认风险

- Image 图生图图片字段存在 `image` 顶层字段与 `extra_body.image` 两种说法。
- Video 最终 URL 字段存在 `video_url` 与 `remixed_from_video_id` 两种说法。
- Chat stream 的真实 SSE / chunk 格式未在整合文档中完全确认。

应对：SDK 采用兼容策略，并在 smoke test 中验证真实行为。

### 6.2 安全风险

- 前端调试页若直接请求 Agnes API，会暴露 API Key。
- 日志若打印完整请求体，可能暴露 Base64 图片、用户原文或敏感 URL。

应对：强制本地后端代理；日志脱敏；README 明确说明。

### 6.3 工程范围膨胀风险

- Python SDK、JS SDK、两个后端示例、前端 Playground 同时开发，容易形成大 diff。

应对：按 Task 1-7 分批执行，每批独立验证。

### 6.4 真实 API 可用性风险

- 没有有效 API Key 时无法运行 smoke test。
- Agnes API 价格、额度、模型可用性可能变化。

应对：默认测试只用 mock；真实 smoke test 需要显式启用并由用户提供 Key。

---

## 7. 最小验收标准

项目初版完成后，至少满足：

- [ ] Python SDK 可以被本地 Python 项目导入。
- [ ] JS SDK 可以被本地 Node 项目导入。
- [ ] 两个 SDK 都支持 Chat、Image、Video 三类核心接口。
- [ ] Video SDK 支持创建、查询、等待完成。
- [ ] Image SDK 正确处理 `extra_body.response_format` 与图生图输入。
- [ ] 前端 Playground 能通过本地后端调试 Chat/Image/Video。
- [ ] API Key 只存在于后端环境变量。
- [ ] mock 测试默认可运行。
- [ ] 文档能指导其他项目集成。

