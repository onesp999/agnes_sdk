# Agnes AI SDK

Agnes AI SDK is a monorepo for server-side SDKs and local development examples
that wrap the Agnes AI APIs for Chat, Image, and Video workflows.

The repository includes Python and TypeScript SDKs, local backend proxies, and a
browser playground for manual debugging. Default tests use mocks and do not call
the real Agnes API.

## Repository Layout

```text
docs/                    API notes, design decisions, smoke test guide
packages/python/          Python SDK package for backend projects
packages/javascript/      TypeScript SDK package for Node.js backends
examples/python-fastapi/  FastAPI proxy example
examples/node-express/    Express proxy example
apps/playground/          Vite React debugging playground
```

## Supported Capabilities

| Capability | Python SDK | TypeScript SDK | Playground |
| --- | --- |
| Chat completions | Yes | Yes | Yes |
| Chat streaming | Raw chunk pass-through | Raw chunk pass-through | Not yet |
| Image generation | Yes | Yes | Yes |
| Image-to-image input | `extra_body.image` default | `extra_body.image` default | URL input |
| Video create/retrieve/wait | Yes | Yes | Yes |
| Real API smoke tests | Manual only | Manual only | Through local backend |

## Security Rules

- Store Agnes API credentials only in backend environment variables.
- Do not put real API keys in frontend code, screenshots, logs, commits, or
  documentation.
- The playground must call a local backend proxy, not the Agnes API directly.
- Logs and errors should not include full `Authorization` headers, Base64 image
  payloads, or sensitive user content.

## Environment

Copy `.env.example` to `.env` in the relevant backend package or example app,
then provide your own local values.

```env
AGNES_API_KEY=YOUR_API_KEY
AGNES_BASE_URL=https://apihub.agnes-ai.com
```

## Python SDK

```bash
cd packages/python
python -m pip install -e ".[dev]"
python -m pytest
```

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

## TypeScript SDK

The TypeScript SDK is intended for server-side Node.js projects. Do not use it
directly in browser code because that exposes API credentials.

```bash
cd packages/javascript
npm install
npm test
npm run build
```

```ts
import { AgnesClient } from "@agnes-ai/sdk";

const client = new AgnesClient({
  apiKey: process.env.AGNES_API_KEY!,
});

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
const videoResult = await client.videos.wait(String(videoTask.video_id));
```

## Local Backends

Use one backend as a local proxy for the playground or for integration testing.
The browser should call these backends, never the Agnes API directly.

```bash
cd examples/python-fastapi
python -m pip install -r requirements.txt
uvicorn app:app --reload --port 3001
```

```bash
cd examples/node-express
npm install
npm run dev
```

Both examples expose:

- `GET /health`
- `POST /api/chat`
- `POST /api/images`
- `POST /api/videos`
- `GET /api/videos/:videoId`
- `POST /api/videos/:videoId/wait`

## Playground

```bash
cd apps/playground
npm install
npm run dev
```

Set `VITE_PLAYGROUND_API_BASE_URL` if the backend is not
`http://localhost:3001`.

## Compatibility Notes

- Image input fields are not fully confirmed. SDKs default image-to-image input
  to `extra_body.image` while preserving caller-provided extra fields.
- Video result URL fields are not fully confirmed. SDKs normalize
  `video_url || remixed_from_video_id` into `video_url`.
- Chat stream event format still needs real API verification. SDKs currently
  expose raw stream chunks.

## Real API Smoke Tests

See `docs/smoke-test.md`. Smoke tests require an explicit real
`AGNES_API_KEY` and may consume quota or take time, especially Image and Video
requests.

## Default Verification

The default verification path is mock-only:

```bash
cd packages/python && python -m pytest
cd packages/javascript && npm test && npm run build
cd examples/python-fastapi && python -m pytest
cd examples/node-express && npm test && npm run build
cd apps/playground && npm test && npm run build
```
