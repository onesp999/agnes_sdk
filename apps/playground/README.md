# Agnes AI Playground

Vite + React debugging UI for Agnes AI Chat, Image, and Video flows.

The playground only calls a local backend proxy. It does not ask for, store, or
send Agnes API keys from the browser.

## Setup

```bash
npm install
```

Optional local environment:

```env
VITE_PLAYGROUND_API_BASE_URL=http://localhost:3001
```

## Run

Start one backend first:

```bash
# examples/python-fastapi
uvicorn app:app --reload --port 3001

# or examples/node-express
npm run dev
```

Then start the playground:

```bash
npm run dev
```

## Test And Build

```bash
npm test
npm run build
```

The tests cover request routing helpers and video parameter validation. They do
not call the real Agnes API.
