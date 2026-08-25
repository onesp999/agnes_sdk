# Agnes Studio

Agnes Studio 是一个本地优先的多模态 AI 产品示例：同一套 React 界面支持流式 Chat、Image 生成和异步 Video 任务，并用真实产品需求反向验证 `@agnes-ai/sdk` 的流式解析、取消和错误边界。

它不是需要部署的公开服务。浏览器只访问本机 Express Backend；`AGNES_API_KEY` 始终留在 Backend 环境中。

## 能力

- 流式 Chat：增量渲染、停止、重试、重新生成、编辑并重发。
- Image：尺寸、URL / Base64、参考图、预览、下载和复用提示词。
- Video：创建任务、自动轮询、状态恢复、失败重试和完成后播放。
- 安全 Markdown：标题、列表、强调、代码块和复制，不渲染原始 HTML。
- 本地对话：IndexedDB 保存对话、消息、媒体和可恢复的视频任务。
- 产品设置：普通模式只显示常用参数；Developer Mode 才显示自定义模型与 Advanced JSON。
- 两种运行模式：无 Key 的 Showcase Mode 与有 Key 的 Real Agnes Mode。

## Architecture

```text
Browser (React + IndexedDB)
  └─ same-origin /api requests
       └─ Express Backend
            ├─ Showcase Mode: deterministic local mocks
            └─ Real Agnes Mode: @agnes-ai/sdk → Agnes API
```

Frontend 只处理产品状态和 Backend 已归一化的 NDJSON 事件，不解析 Agnes SSE；Backend 负责输入校验、安全错误、流式桥接和断连取消。SDK 提供 `chat.streamEvents()` 的缓冲 SSE parser，同时保留原 `chat.stream()` raw stream 兼容接口。

主要目录：

```text
backend/                 Express 入口、验证、Mock 与 SDK bridge
frontend/src/components UI 组件
frontend/src/features/  conversations、settings、media 领域逻辑
frontend/src/services/  Chat NDJSON 与 Video polling API
frontend/src/storage/   IndexedDB conversations 与 localStorage preferences
frontend/src/types/     持久化数据和设置类型
```

## Quick Start

要求 Node.js `>=18` 与 npm：

```powershell
cd demo-chat-app
npm install --ignore-scripts
npm run dev
```

打开 [http://localhost:5174](http://localhost:5174)。默认 Backend 端口为 `3101`，Vite 会把 `/api/*` 和 `/health` 代理到本地 Backend。

也可在 `demo-chat-app` 目录运行：

```powershell
.\restart.ps1
```

脚本只管理自己记录的本地进程树，并等待 Frontend 与 Backend 就绪。

## Showcase Mode（无 API Key）

没有配置 `AGNES_API_KEY` 时，应用正常启动并显示 `Showcase 演示模式`：

- Chat 返回本地流式 Mock；
- Image 返回本地内联 SVG；
- Video 模拟 `queued → completed` 任务状态，不生成真实视频；
- 不会访问真实 Agnes API，也不会产生 API 用量。

若机器上已有 `backend/.env`，可为当前 PowerShell 会话显式覆盖为空值后启动：

```powershell
$env:AGNES_API_KEY = ''
npm run dev
```

## Real Agnes Mode（有 API Key）

```powershell
Copy-Item backend/.env.example backend/.env
```

编辑未跟踪的 `backend/.env`：

```env
AGNES_API_KEY=YOUR_API_KEY
AGNES_BASE_URL=https://apihub.agnes-ai.com
PORT=3101
```

重启后状态显示 `Real Agnes 已连接`，Chat / Image / Video 通过 Backend 使用真实 SDK。Key 不会进入前端 bundle、IndexedDB、localStorage 或浏览器请求体。

> 不要把带真实 Key 且没有额外鉴权的 Backend 暴露到公网；本项目的交付边界是本机开发与作品展示。

## Product Settings 与 Developer Mode

点击顶部模型名称打开设置：

- Chat：模型、System Prompt、Temperature、Top P、Max tokens。
- Image：模型、尺寸、输出格式、参考图片 URL。
- Video：模型、用户可理解的比例与时长；应用映射为 SDK 的宽高、帧率与帧数。

Developer Mode 默认关闭。开启后可使用 custom model、`tools`、`toolChoice`、`thinking`、`chatTemplateKwargs` 与其他 Advanced JSON 扩展字段。应用保留 `messages`、`prompt`、`stream`，并拒绝 `apiKey`、`Authorization`、`headers`、`signal` 等敏感或传输字段。

普通 preferences 和 Developer Mode 开关写入 localStorage；Advanced JSON 不持久化。对话与媒体元数据写入 IndexedDB，浏览器不保存服务器 secret。

## Build 与 Test

```powershell
npm test
npm run build
npm start
```

`npm start` 使用生产构建，由 Express 同时提供静态页面和 `/api/*`。默认测试全部使用 Mock / injected client，不需要真实 Key，也不调用真实 Agnes API。

TypeScript SDK 可独立验证：

```powershell
cd ..\packages\javascript
npm test
npm run build
```

真实 API smoke test 是显式 opt-in 的单独验收层，参见 SDK 测试说明；不要把它与默认离线测试混在一起运行。

## SDK 与 Product 的关系

Studio 促成了 SDK 的增量 `streamEvents()` 契约：处理分片 / 合并 SSE、`[DONE]`、usage、协议错误、AbortSignal 与覆盖完整流生命周期的 timeout。产品层仍只依赖 Backend 的安全 NDJSON contract，因此 Agnes-specific transport 不会泄漏到 React 组件。

## 已知限制

- Video Showcase 只演示任务生命周期，不生成可播放文件；播放器需要 Real Agnes 返回视频 URL。
- 本地对话没有跨浏览器或云同步。
- 当前没有用户鉴权、配额与多租户隔离，因此不适合作为公开 Key proxy 部署。
- Markdown 禁止原始 HTML；这是有意的安全边界。
