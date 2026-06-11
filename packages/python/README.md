# Agnes AI Python SDK

Python SDK for Agnes AI Chat, Image, and Video APIs.

## Install For Local Development

```bash
python -m pip install -e ".[dev]"
```

## Configuration

Pass the API key explicitly or set `AGNES_API_KEY`.

```python
from agnes_ai import AgnesClient

client = AgnesClient(api_key="YOUR_API_KEY")
```

`AGNES_BASE_URL` can override the default base URL for testing.

## Chat

```python
from agnes_ai import AgnesClient

client = AgnesClient()

chat_result = client.chat.create(
    messages=[{"role": "user", "content": "Hello"}],
)
```

`chat.stream(...)` currently returns raw text chunks from the HTTP stream. The
Agnes stream event format still needs real API verification.

## Image

```python
image_result = client.images.generate(
    prompt="A clean product photo of a glass cube",
    size="1024x768",
    response_format="url",
)
```

For image-to-image requests, `image=` is placed in `extra_body.image` by default
to match the documented examples. Callers can also pass `extra_body`.

## Video

```python
video_task = client.videos.create(
    prompt="A cat walking on the beach at sunset",
    num_frames=121,
    frame_rate=24,
)

video_result = client.videos.wait(video_task["video_id"])
```

Video requests validate `num_frames <= 441`, `(num_frames - 1) % 8 == 0`, and
`1 <= frame_rate <= 60`. Completed video responses normalize
`video_url || remixed_from_video_id` into `video_url`.

## Safety

Do not log API keys, full `Authorization` headers, Base64 image payloads, or
sensitive prompt content. Tests use mocked HTTP and do not call the real Agnes
API.

## Development

```bash
python -m pytest
```
