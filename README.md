# Agnes AI SDK

Agnes AI SDK is a monorepo for server-side SDKs and local development examples
that wrap the Agnes AI APIs for Chat, Image, and Video workflows.

The project is intentionally split into small modules so each SDK and example
can evolve independently while sharing the same API semantics.

## Repository Layout

```text
docs/                    API notes and SDK design decisions
packages/python/          Python SDK package
packages/javascript/      JavaScript / TypeScript SDK package
examples/python-fastapi/  FastAPI proxy example for local integration testing
examples/node-express/    Node / Express proxy example for local integration testing
apps/playground/          Frontend debugging playground
```

## Planned Packages

| Module | Purpose |
| --- | --- |
| `packages/python` | Python SDK for backend projects such as FastAPI services. |
| `packages/javascript` | TypeScript SDK for Node.js server-side projects. |
| `examples/python-fastapi` | Local backend proxy using the Python SDK. |
| `examples/node-express` | Local backend proxy using the TypeScript SDK. |
| `apps/playground` | Browser UI for testing Chat, Image, and Video through a local backend. |

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

## Current Status

This repository is being initialized from the Codex execution plan. The first
milestone creates the monorepo structure and design documentation only; SDK
implementation and examples will be added in later tasks.
