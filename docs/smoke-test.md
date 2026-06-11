# Agnes AI Smoke Test Guide

Default tests in this repository are mock tests and do not call the real Agnes
API. Use this guide only when you intentionally want to verify real API
behavior with a valid key.

Real smoke tests may consume quota, produce billable API usage, and take time,
especially Image and Video requests.

## Prerequisites

Set a real key in your shell. Do not commit `.env` files.

```bash
export AGNES_API_KEY="YOUR_API_KEY"
export AGNES_BASE_URL="https://apihub.agnes-ai.com"
```

PowerShell:

```powershell
$env:AGNES_API_KEY = "YOUR_API_KEY"
$env:AGNES_BASE_URL = "https://apihub.agnes-ai.com"
```

## Python Minimal Checks

```bash
cd packages/python
python -m pip install -e ".[dev]"
```

Chat:

```bash
python - <<'PY'
from agnes_ai import AgnesClient

client = AgnesClient()
print(client.chat.create(messages=[{"role": "user", "content": "Hello"}]))
PY
```

Image:

```bash
python - <<'PY'
from agnes_ai import AgnesClient

client = AgnesClient()
print(client.images.generate(
    prompt="A clean product photo of a glass cube",
    size="1024x768",
    response_format="url",
))
PY
```

Video create and retrieve:

```bash
python - <<'PY'
from agnes_ai import AgnesClient

client = AgnesClient()
task = client.videos.create(
    prompt="A simple camera pan across a glass cube",
    num_frames=121,
    frame_rate=24,
)
print(task)
video_id = task.get("video_id") or task.get("task_id")
if video_id:
    print(client.videos.retrieve(str(video_id)))
PY
```

## TypeScript Minimal Checks

```bash
cd packages/javascript
npm install
npm run build
```

Create `smoke.mjs` locally:

```js
import { AgnesClient } from "./dist/index.js";

const client = new AgnesClient();

console.log(await client.chat.create({
  messages: [{ role: "user", content: "Hello" }],
}));
```

Run:

```bash
node smoke.mjs
```

Delete local smoke files after use if they contain prompts or response data you
do not want to keep.

## Backend And Playground Check

Start one local backend with `AGNES_API_KEY` set, then start the playground:

```bash
cd examples/node-express
npm install
npm run dev
```

```bash
cd apps/playground
npm install
npm run dev
```

Open the playground and use the backend URL `http://localhost:3001`.

## Troubleshooting

- `400`: check request shape, model-specific parameters, and video
  `num_frames` rules.
- `401`: check `AGNES_API_KEY`; the SDK does not retry authentication errors.
- `404`: verify the base URL and endpoint compatibility.
- `429`: retry later or check quota and rate limits.
- `500` or `503`: SDKs retry a small number of times, but repeated failures may
  indicate service availability or model capacity issues.

## Field Compatibility To Verify

- Image-to-image input: current SDK default is `extra_body.image`; verify whether
  the API also needs or accepts top-level `image`.
- Video URL result: current SDK reads `video_url || remixed_from_video_id`.
- Chat stream: current SDKs expose raw chunks until the real SSE format is
  confirmed.
