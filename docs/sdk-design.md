# SDK Design

## Scope

This project will provide Python and JavaScript / TypeScript SDKs for Agnes AI
Chat, Image, and Video APIs, plus local backend examples and a frontend
playground for manual debugging.

The first milestone only establishes repository boundaries and shared design
principles. API clients, tests, and examples will be implemented in later tasks.

## Module Boundaries

- `packages/python`: Python SDK package.
- `packages/javascript`: JavaScript / TypeScript SDK package for server-side
  Node.js usage.
- `examples/python-fastapi`: local FastAPI proxy using the Python SDK.
- `examples/node-express`: local Express proxy using the TypeScript SDK.
- `apps/playground`: browser playground that talks only to a local backend.
- `docs`: API notes, design decisions, smoke test guidance, and compatibility
  notes.

## Authentication

Both SDKs should accept an API key from explicit client configuration or from
`AGNES_API_KEY`. The default base URL should come from `AGNES_BASE_URL` or fall
back to `https://apihub.agnes-ai.com`.

API keys must never be exposed in frontend code. The playground must call a
local backend proxy, and the backend must read credentials from environment
variables.

## Errors

Both SDKs should expose consistent error categories:

- configuration errors
- authentication errors
- bad request errors
- rate limit and server errors
- timeout errors
- video task failure errors

Error messages may include status code, endpoint, request id, and short API
messages. They must not include full API keys, full `Authorization` headers,
large Base64 payloads, or sensitive request bodies.

## Retries

Default retry behavior should be conservative:

- do not retry `400`
- do not retry `401`
- usually do not retry `404`
- retry `500` and `503` only with a small maximum retry count and backoff

## Image Compatibility

Image generation should default to `extra_body.response_format = "url"` for URL
output and `return_base64 = true` for Base64 output. Image-to-image inputs should
default to `extra_body.image`, while preserving caller-provided `extra_body` and
allowing future top-level `image` compatibility if real API behavior requires it.

## Video Compatibility

Video creation should validate:

- `num_frames <= 441`
- `(num_frames - 1) % 8 == 0`
- `frame_rate` between `1` and `60`

Video retrieval should prefer `GET /agnesapi?video_id=<VIDEO_ID>` and keep
legacy support for `GET /v1/videos/{task_id}`. Completed video results should
normalize the playable URL from `video_url || remixed_from_video_id`.

## Logging

SDKs and examples should avoid logging complete request bodies by default. In
particular, they must not log API keys, full authorization headers, Base64 image
data, sensitive image URLs, or user-private prompts.
