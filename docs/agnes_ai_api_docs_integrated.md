# Agnes AI API Integrated Notes

This placeholder is derived from `agnes_sdk_codex_execution_plan.md` because the
full source API document is not present in this repository yet. Replace this
file with the complete integrated API documentation when it is available.

## Common Settings

- Base URL: `https://apihub.agnes-ai.com`
- Authentication: `Authorization: Bearer YOUR_API_KEY`
- Content type: `application/json`
- API keys must be injected through backend environment variables.

## Chat API

- Model: `agnes-2.0-flash`
- Endpoint: `POST /v1/chat/completions`
- Planned SDK support: chat completions, multi-turn messages, image URL input,
  tools, thinking parameters, and streaming pass-through.

## Image API

- Model: `agnes-image-2.1-flash`
- Endpoint: `POST /v1/images/generations`
- URL output uses `extra_body.response_format = "url"`.
- Base64 output uses `return_base64 = true`.
- Image-to-image examples prefer `extra_body.image`.
- Compatibility note: a top-level `image` field is mentioned in the plan, but
  examples prefer `extra_body.image`; SDKs should default to `extra_body.image`
  while allowing callers to pass through compatible fields.

## Video API

- Model: `agnes-video-v2.0`
- Create endpoint: `POST /v1/videos`
- Recommended query endpoint: `GET /agnesapi?video_id=<VIDEO_ID>`
- Legacy query endpoint: `GET /v1/videos/{task_id}`
- `num_frames` must be `<= 441` and satisfy `8n + 1`.
- `frame_rate` supports `1-60`.
- Recommended polling interval: 5 seconds.
- Compatibility note: final video URL may appear as `video_url` or
  `remixed_from_video_id`; SDKs should read `video_url || remixed_from_video_id`.
