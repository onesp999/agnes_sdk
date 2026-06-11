# Agnes AI FastAPI Example

Local FastAPI proxy example for testing the Agnes AI Python SDK from a backend.

The browser must not send or store an Agnes API key. This backend reads
`AGNES_API_KEY` from the environment and calls the SDK server-side.

## Setup

```bash
python -m pip install -r requirements.txt
```

Create a local `.env` if needed:

```env
AGNES_API_KEY=YOUR_API_KEY
AGNES_BASE_URL=https://apihub.agnes-ai.com
PLAYGROUND_ORIGIN=http://localhost:5173
```

## Run

```bash
uvicorn app:app --reload --port 3001
```

## Routes

- `GET /health`
- `POST /api/chat`
- `POST /api/images`
- `POST /api/videos`
- `GET /api/videos/{video_id}`
- `POST /api/videos/{video_id}/wait`

## Test

```bash
python -m pytest
```

Tests replace the SDK client with a fake client and do not call the real Agnes
API.
