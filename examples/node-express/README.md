# Agnes AI Express Example

Local Express proxy example for testing the Agnes AI TypeScript SDK from a
backend.

The browser must not send or store an Agnes API key. This backend reads
`AGNES_API_KEY` from the environment and calls the SDK server-side.

## Setup

```bash
npm install
```

Create a local `.env` if needed:

```env
AGNES_API_KEY=YOUR_API_KEY
AGNES_BASE_URL=https://apihub.agnes-ai.com
PORT=3001
PLAYGROUND_ORIGIN=http://localhost:5173
```

## Run

```bash
npm run dev
```

## Routes

- `GET /health`
- `POST /api/chat`
- `POST /api/images`
- `POST /api/videos`
- `GET /api/videos/:videoId`
- `POST /api/videos/:videoId/wait`

## Test

```bash
npm test
npm run build
```

Tests inject a fake SDK client and do not call the real Agnes API.
