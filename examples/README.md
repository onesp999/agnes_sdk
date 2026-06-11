# Agnes AI Examples

This directory contains local backend proxy examples for integrating the SDKs.
They are intended for local development and playground testing, not as
production-ready service templates.

## Available Examples

| Example | SDK | Default Port |
| --- | --- | --- |
| `python-fastapi` | Python SDK | `3001` |
| `node-express` | TypeScript SDK | `3001` |

Both examples expose the same route shape:

- `GET /health`
- `POST /api/chat`
- `POST /api/images`
- `POST /api/videos`
- `GET /api/videos/:videoId`
- `POST /api/videos/:videoId/wait`

## Security

- The browser must not send an Agnes API key.
- Backends read `AGNES_API_KEY` and `AGNES_BASE_URL` from environment variables.
- Error responses are intended to be readable without exposing API keys.
- Tests use fake SDK clients and do not call the real Agnes API.

## Running With The Playground

Start one backend on port `3001`, then start `apps/playground`.

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

```bash
cd apps/playground
npm install
npm run dev
```
