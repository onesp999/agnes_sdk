# Agnes AI 本地聊天 Demo

这是一个完全在本机运行的前后端 Demo，不需要 Sites 或其他托管服务。

## 结构

```text
frontend/   Vite + React 聊天界面（开发端口 5174）
backend/    Express + Agnes TypeScript SDK（端口 3101）
```

原 SDK 源码保持不变。后端通过本地依赖 `../packages/javascript` 使用已经构建的 SDK。

## 直接启动

```powershell
npm install --ignore-scripts
npm run dev
```

然后打开：

- 前端：http://localhost:5174
- 后端状态：http://localhost:3101/health

`npm run dev` 会同时启动前端和后端。前端通过 Vite 代理访问本地后端，浏览器不会读取 API Key。

## 使用真实 Agnes API

```powershell
Copy-Item backend/.env.example backend/.env
```

编辑 `backend/.env`：

```env
AGNES_API_KEY=YOUR_API_KEY
AGNES_BASE_URL=https://apihub.agnes-ai.com
PORT=3101
```

未配置 `AGNES_API_KEY` 时，后端自动返回本地模拟回复。

## 配置模型请求

点击聊天页顶部的模型名称可以打开请求参数面板。每次请求都可以配置：

- 模型名称、System Prompt
- `temperature`、`topP`、`maxTokens`
- 高级 JSON 参数，例如 `tools`、`toolChoice`、`thinking`、`chatTemplateKwargs`，以及 SDK 支持的扩展字段

模型预设按类型分组，也可以直接输入自定义模型名称：

- 文本：`agnes-2.0-flash`、`agnes-2.5-flash`、`agnes-2.5-pro-alpha`、`agnes-2.5-pro`
- 图像：`agnes-image-2.0-flash`、`agnes-image-2.1-flash`
- 视频：`agnes-video-v2.0`、`agnes-video-2.5`、`agnes-video-2.5-flash`

前端会根据模型名称自动选择本地接口：

- 文本模型：`POST /api/chat`
- 图像模型：`POST /api/images`
- 视频模型：`POST /api/videos`，创建任务后通过 `GET /api/videos/:videoId` 刷新状态

图像结果支持 URL 和 Base64 预览；视频任务完成并返回地址后会显示播放器。

留空的数值参数会使用模型或服务端默认值。高级 JSON 中的 `messages`、`prompt` 和 `stream` 不可覆盖，因为请求内容和响应模式由 Demo 管理。

`POST /api/chat` 保持兼容原有的 `messages` 请求，并新增可选的 `parameters` 对象：

```json
{
  "messages": [{ "role": "user", "content": "你好" }],
  "parameters": {
    "model": "agnes-2.0-flash",
    "temperature": 0.7,
    "topP": 0.9,
    "maxTokens": 1024
  }
}
```

## 构建与单服务运行

```powershell
npm run build
npm start
```

构建后 Express 会在 `http://localhost:3101` 同时提供前端静态页面和本地 `/api/*` 代理接口。

也可以使用根目录的重启脚本：

```powershell
.\restart.ps1
```

脚本会停止它上一次启动的 Demo 进程树，在后台重新运行 `npm run dev`，并等待前后端就绪。

## 测试

```powershell
npm test
```
