# Agnes AI TypeScript SDK

Server-side TypeScript SDK for Agnes AI Chat, Image, and Video APIs.

This package is intended for Node.js backends. Do not use it directly from a
browser application because that would expose the Agnes API key.

## Install For Local Development

```bash
npm install
```

## Configuration

Pass the API key explicitly or set `AGNES_API_KEY`.

```ts
import { AgnesClient } from "@agnes-ai/sdk";

const client = new AgnesClient({
  apiKey: process.env.AGNES_API_KEY!,
});
```

`AGNES_BASE_URL` can override the default base URL for testing.

## Chat

```ts
const chatResult = await client.chat.create({
  messages: [{ role: "user", content: "Hello" }],
});
```

`chat.stream(...)` currently returns raw text chunks from the HTTP stream. The
Agnes stream event format still needs real API verification.

## Image

```ts
const imageResult = await client.images.generate({
  prompt: "A clean product photo of a glass cube",
  size: "1024x768",
  responseFormat: "url",
});
```

For image-to-image requests, `image` is placed in `extra_body.image` by default
to match the documented examples. Callers can also pass `extraBody`.

## Video

```ts
const videoTask = await client.videos.create({
  prompt: "A cat walking on the beach at sunset",
  numFrames: 121,
  frameRate: 24,
});

const videoResult = await client.videos.wait(String(videoTask.video_id));
```

Video creation maps SDK camelCase options to Agnes API snake_case fields. It
validates `numFrames <= 441`, `(numFrames - 1) % 8 == 0`, and
`1 <= frameRate <= 60`. Completed video responses normalize
`video_url || remixed_from_video_id` into `video_url`.

## Safety

Do not log API keys, full `Authorization` headers, Base64 image payloads, or
sensitive prompt content. Tests use mocked `fetch` and do not call the real
Agnes API.

## Development

```bash
npm test
npm run build
```
