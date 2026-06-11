# Agnes AI SDK

Agnes AI SDK is a monorepo for backend SDKs and local debugging tools around
the Agnes AI Chat, Image, and Video APIs.

The repository currently contains:

- a Python SDK package for backend Python services
- a server-side TypeScript SDK package for Node.js backends
- FastAPI and Express proxy examples
- a Vite + React playground that talks only to a local backend proxy
- mock-first tests and optional real API smoke-test guidance

Default tests do not call the real Agnes API and do not require
`AGNES_API_KEY`.

## Table Of Contents

- [Repository Layout](#repository-layout)
- [Capabilities](#capabilities)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Quick Start](#quick-start)
- [Python SDK](#python-sdk)
- [TypeScript SDK](#typescript-sdk)
- [Local Backend Examples](#local-backend-examples)
- [Playground](#playground)
- [Testing](#testing)
- [Real API Smoke Tests](#real-api-smoke-tests)
- [Security Rules](#security-rules)
- [Compatibility Notes](#compatibility-notes)
- [Troubleshooting](#troubleshooting)

## Repository Layout

```text
docs/
  agnes_ai_api_docs_integrated.md   Integrated Agnes API notes
  sdk-design.md                     SDK design boundaries and compatibility notes
  smoke-test.md                     Manual real API smoke-test guide
  testing.md                        Mock, contract, and integration test guidance

packages/python/
  src/agnes_ai/                     Python SDK source
  tests/                            Python unit, contract, and integration tests
  pyproject.toml                    Python package metadata

packages/javascript/
  src/                              TypeScript SDK source
  tests/                            TypeScript unit, contract, and integration tests
  package.json                      Node package metadata and scripts

examples/python-fastapi/
  app.py                            FastAPI local backend proxy
  test_app.py                       FastAPI proxy tests

examples/node-express/
  src/app.ts                        Express local backend proxy
  src/server.ts                     Express server entry point
  src/app.test.ts                   Express proxy tests

apps/playground/
  src/                              Vite + React manual debugging UI
```

## Capabilities

| Capability | Python SDK | TypeScript SDK | Backend Examples | Playground |
| --- | --- | --- | --- | --- |
| Chat completions | Yes | Yes | Yes | Yes |
| Chat streaming | Raw chunk pass-through | Raw chunk pass-through | No dedicated route yet | Not yet |
| Image generation | Yes | Yes | Yes | Yes |
| Image-to-image input | request `extra_body.image` default | request `extra_body.image` default | Yes | URL input |
| Video create | Yes | Yes | Yes | Yes |
| Video retrieve | Yes | Yes | Yes | Yes |
| Video wait/poll | Yes | Yes | Yes | Yes |
| Real API smoke tests | Manual opt-in | Manual opt-in | Manual opt-in | Through local backend |

## Prerequisites

- Python `>=3.9` for the Python SDK and FastAPI example
- Node.js `>=18` for the TypeScript SDK, Express example, and playground
- npm for JavaScript package installation
- A valid Agnes API key only when running real API calls

## Environment Variables

Copy the closest `.env.example` file to `.env` when running a local backend.
Never commit `.env` files.

| Variable | Used By | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `AGNES_API_KEY` | SDKs and backend examples | Real API calls only | None | Agnes API credential |
| `AGNES_BASE_URL` | SDKs and backend examples | No | `https://apihub.agnes-ai.com` | Override API base URL |
| `PORT` | Express example | No | `3001` | Local Express proxy port |
| `PLAYGROUND_ORIGIN` | Backend examples | No | Example-specific | CORS origin for the playground |
| `VITE_PLAYGROUND_API_BASE_URL` | Playground | No | `http://localhost:3001` | Local backend URL used by the browser |
| `RUN_AGNES_INTEGRATION_TESTS` | SDK integration tests | Real smoke only | unset | Opt in to real API integration tests |

Root example:

```env
AGNES_API_KEY=YOUR_API_KEY
AGNES_BASE_URL=https://apihub.agnes-ai.com
```

## Quick Start

### 1. Run The Python SDK Tests

```bash
cd packages/python
python -m pip install -e ".[dev]"
python -m pytest
```

### 2. Run The TypeScript SDK Tests

```bash
cd packages/javascript
npm install
npm test
npm run build
```

### 3. Start A Local Backend

Use either backend. The playground expects a local backend on port `3001` by
default.

FastAPI:

```bash
cd examples/python-fastapi
python -m pip install -r requirements.txt
uvicorn app:app --reload --port 3001
```

Express:

```bash
cd examples/node-express
npm install
npm run dev
```

### 4. Start The Playground

```bash
cd apps/playground
npm install
npm run dev
```

If the backend is not running on `http://localhost:3001`, set
`VITE_PLAYGROUND_API_BASE_URL`.

## Python SDK

The Python package lives in `packages/python` and exposes `AgnesClient` plus
shared constants, configuration, validation helpers, and SDK error classes.

### Install For Local Development

```bash
cd packages/python
python -m pip install -e ".[dev]"
```

### Configure A Client

Pass the API key explicitly:

```python
from agnes_ai import AgnesClient

client = AgnesClient(api_key="YOUR_API_KEY")
```

Or read it from `AGNES_API_KEY`:

```python
from agnes_ai import AgnesClient

client = AgnesClient()
```

Supported configuration fields include:

| Field | Purpose |
| --- | --- |
| `api_key` | Agnes API key. Required unless `AGNES_API_KEY` is set. |
| `base_url` | API base URL. Defaults to `AGNES_BASE_URL` or the SDK default. |
| `timeout` | HTTP request timeout. |
| `max_retries` | Maximum retry attempts for retryable failures. |
| `retry_backoff` | Base retry backoff interval. |
| `default_headers` | Extra headers merged into SDK requests. |

### Chat

```python
chat_result = client.chat.create(
    messages=[{"role": "user", "content": "Hello"}],
)
```

Streaming is exposed as raw text chunks until the real Agnes stream event format
is confirmed:

```python
for chunk in client.chat.stream(
    messages=[{"role": "user", "content": "Tell me a short story"}],
):
    print(chunk, end="")
```

### Image

```python
image_result = client.images.generate(
    prompt="A clean product photo of a glass cube",
    size="1024x768",
    response_format="url",
)
```

For image-to-image requests, `image=` is placed in `extra_body.image` by
default while preserving caller-provided `extra_body` fields:

```python
image_result = client.images.generate(
    prompt="Restyle this image as a polished product render",
    image="https://example.com/source.png",
    response_format="url",
)
```

### Video

```python
video_task = client.videos.create(
    prompt="A simple camera pan across a glass cube",
    num_frames=121,
    frame_rate=24,
)

video_id = video_task["video_id"]
video_result = client.videos.wait(video_id)
```

Video requests validate:

- `num_frames <= 441`
- `(num_frames - 1) % 8 == 0`
- `1 <= frame_rate <= 60`

Completed video responses normalize `video_url || remixed_from_video_id` into
`video_url`.

### Python SDK Verification

```bash
cd packages/python
python -m pytest
python -m pytest tests/unit
python -m pytest tests/contract
python -m pytest tests/integration
```

Real integration checks are skipped unless `AGNES_API_KEY` and
`RUN_AGNES_INTEGRATION_TESTS=1` are set.

## TypeScript SDK

The TypeScript package lives in `packages/javascript`. It is intended for
server-side Node.js usage. Do not import it directly from browser code because
that would expose API credentials.

### Install For Local Development

```bash
cd packages/javascript
npm install
```

### Configure A Client

```ts
import { AgnesClient } from "@agnes-ai/sdk";

const client = new AgnesClient({
  apiKey: process.env.AGNES_API_KEY!,
});
```

If `apiKey` is omitted, the SDK reads `AGNES_API_KEY`.

Supported configuration fields include:

| Field | Purpose |
| --- | --- |
| `apiKey` | Agnes API key. Required unless `AGNES_API_KEY` is set. |
| `baseUrl` | API base URL. Defaults to `AGNES_BASE_URL` or the SDK default. |
| `timeout` | HTTP request timeout. |
| `maxRetries` | Maximum retry attempts for retryable failures. |
| `retryBackoff` | Base retry backoff interval. |
| `defaultHeaders` | Extra headers merged into SDK requests. |

### Chat

```ts
const chatResult = await client.chat.create({
  messages: [{ role: "user", content: "Hello" }],
});
```

Streaming returns raw text chunks until the real Agnes stream event format is
confirmed:

```ts
for await (const chunk of client.chat.stream({
  messages: [{ role: "user", content: "Tell me a short story" }],
})) {
  process.stdout.write(chunk);
}
```

### Image

```ts
const imageResult = await client.images.generate({
  prompt: "A clean product photo of a glass cube",
  size: "1024x768",
  responseFormat: "url",
});
```

For image-to-image requests, the SDK accepts `image` and places it in request
`extra_body.image` by default:

```ts
const imageResult = await client.images.generate({
  prompt: "Restyle this image as a polished product render",
  image: "https://example.com/source.png",
  responseFormat: "url",
});
```

### Video

```ts
const videoTask = await client.videos.create({
  prompt: "A simple camera pan across a glass cube",
  numFrames: 121,
  frameRate: 24,
});

const videoResult = await client.videos.wait(String(videoTask.video_id));
```

The SDK maps TypeScript camelCase options to Agnes API snake_case fields when
building requests.

### TypeScript SDK Verification

```bash
cd packages/javascript
npm test
npm run test:unit
npm run test:contract
npm run test:integration
npm run build
```

Real integration checks are skipped unless `AGNES_API_KEY` and
`RUN_AGNES_INTEGRATION_TESTS=1` are set.

## Local Backend Examples

The examples are local backend proxies. They are useful for playground testing
and integration experiments, but they are not production-ready service
templates.

The browser must call these backends instead of calling Agnes directly. The API
key stays on the backend.

### Shared Routes

Both backend examples expose the same route shape:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `POST` | `/api/chat` | Create a chat completion |
| `POST` | `/api/images` | Generate an image |
| `POST` | `/api/videos` | Create a video task |
| `GET` | `/api/videos/:videoId` | Retrieve video task status/result |
| `POST` | `/api/videos/:videoId/wait` | Poll until video completion or timeout |

### FastAPI Example

```bash
cd examples/python-fastapi
python -m pip install -r requirements.txt
uvicorn app:app --reload --port 3001
```

Run tests:

```bash
python -m pytest
```

### Express Example

```bash
cd examples/node-express
npm install
npm run dev
```

Run tests and build:

```bash
npm test
npm run build
```

## Playground

The playground is a local Vite + React debugging UI for Chat, Image, and Video
flows. It does not read, store, or send Agnes API keys.

```bash
cd apps/playground
npm install
npm run dev
```

Optional environment:

```env
VITE_PLAYGROUND_API_BASE_URL=http://localhost:3001
```

Verification:

```bash
npm test
npm run build
```

## Testing

The default verification path is mock-only:

```bash
cd packages/python && python -m pytest
cd packages/javascript && npm test && npm run build
cd examples/python-fastapi && python -m pytest
cd examples/node-express && npm test && npm run build
cd apps/playground && npm test && npm run build
```

Test layers:

| Layer | Location | Purpose |
| --- | --- | --- |
| Unit tests | `packages/*/tests/unit`, selected `src/*.test.ts` | Request construction, validation, parsing, and client behavior |
| Contract tests | `packages/*/tests/contract` | Shared endpoint paths, public semantics, and redaction expectations |
| Integration tests | `packages/*/tests/integration` | Mocked by default; real API only when explicitly enabled |
| Example tests | `examples/*` | Backend route behavior with fake SDK clients |
| Playground tests | `apps/playground` | Browser-side route helpers and UI-adjacent behavior |

See `docs/testing.md` for more detail.

## Real API Smoke Tests

Real smoke tests are manual opt-in because they may consume quota and take time,
especially image and video requests.

PowerShell:

```powershell
$env:AGNES_API_KEY = "YOUR_API_KEY"
$env:AGNES_BASE_URL = "https://apihub.agnes-ai.com"
$env:RUN_AGNES_INTEGRATION_TESTS = "1"
```

Bash:

```bash
export AGNES_API_KEY="YOUR_API_KEY"
export AGNES_BASE_URL="https://apihub.agnes-ai.com"
export RUN_AGNES_INTEGRATION_TESTS="1"
```

Then run the relevant integration tests or follow `docs/smoke-test.md`.

Do not paste real keys, full response payloads with sensitive data, or private
prompts into committed fixtures or docs.

## Security Rules

- Store Agnes API credentials only in backend environment variables.
- Do not put real API keys in frontend code, screenshots, logs, commits, or
  documentation.
- The playground must call a local backend proxy, not the Agnes API directly.
- SDKs and examples should not log full `Authorization` headers.
- Avoid logging Base64 image payloads, sensitive image URLs, private prompts, or
  full request bodies.
- Keep `.env` files local and untracked.

## Compatibility Notes

- Default base URL: `https://apihub.agnes-ai.com`
- Chat model constant: `agnes-2.0-flash`
- Image model constant: `agnes-image-2.1-flash`
- Video model constant: `agnes-video-v2.0`
- Chat endpoint: `/v1/chat/completions`
- Image endpoint: `/v1/images/generations`
- Video create endpoint: `/v1/videos`
- Video query endpoint: `/agnesapi`
- Retryable status codes: `500`, `503`
- Non-retryable status codes: `400`, `401`, `404`

Known open compatibility items:

- Image input fields are not fully confirmed. SDKs default image-to-image input
  to `extra_body.image` / `extraBody.image` while preserving caller-provided
  extra fields.
- Video result URL fields are not fully confirmed. SDKs normalize
  `video_url || remixed_from_video_id` into `video_url`.
- Chat stream event format still needs real API verification. SDKs currently
  expose raw stream chunks.

## Troubleshooting

| Symptom | Likely Cause | What To Check |
| --- | --- | --- |
| Missing API key error | `AGNES_API_KEY` is unset and no explicit key was passed | Set the key in the backend shell or pass it in SDK configuration |
| `401` from Agnes API | Invalid or missing credential | Check `AGNES_API_KEY`; authentication errors are not retried |
| `400` from video create | Invalid video parameters | Check `num_frames`, `(num_frames - 1) % 8`, and `frame_rate` |
| Playground cannot reach backend | Backend not running or wrong URL | Start a backend on `3001` or set `VITE_PLAYGROUND_API_BASE_URL` |
| CORS error in playground | Backend CORS origin mismatch | Check `PLAYGROUND_ORIGIN` and the Vite dev server URL |
| Real integration tests are skipped | Opt-in variables are missing | Set both `AGNES_API_KEY` and `RUN_AGNES_INTEGRATION_TESTS=1` |
| TypeScript build fails after dependency changes | Local package build is stale | Run `npm install` and `npm run build` in the affected package |

## Related Documents

- `docs/sdk-design.md`: design scope, constants, retries, compatibility notes
- `docs/testing.md`: test layers and mock-first expectations
- `docs/smoke-test.md`: manual real API smoke-test commands
- `packages/python/README.md`: Python package-specific guide
- `packages/javascript/README.md`: TypeScript package-specific guide
- `examples/README.md`: backend proxy examples
