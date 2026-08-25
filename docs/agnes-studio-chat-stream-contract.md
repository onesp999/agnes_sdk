# Contract: Agnes Studio browser chat stream

## Endpoint

`POST /api/chat/stream`

The request body matches `/api/chat`:

```json
{
  "messages": [{ "role": "user", "content": "Hello" }],
  "parameters": { "model": "agnes-2.0-flash" }
}
```

Existing validation remains in force. `messages` and `stream` cannot be
overridden through `parameters`.

## Response

Successful responses use `application/x-ndjson; charset=utf-8`. Each line is one
JSON event:

```text
{"type":"delta","choiceIndex":0,"content":"..."}
{"type":"finish","choiceIndex":0,"finishReason":"stop"}
{"type":"usage","usage":{...}}
{"type":"done"}
```

`reasoningContent` and `role` may be present on a delta. The BFF does not expose
SSE framing or raw network chunks.

If streaming fails after headers are sent, the BFF emits one safe terminal line:

```text
{"type":"error","error":{"type":"AgnesAPIError","message":"..."}}
```

Validation failures before streaming retain the existing JSON HTTP error shape.

## Cancellation

The BFF creates one `AbortController` per request. Browser request abort, request
abortion, or premature response close aborts the signal passed to
`chat.streamEvents()`. Normal completion does not re-abort the SDK call.

## Frontend lifecycle

- A submitted user message is `completed`.
- Its assistant placeholder starts `pending`, becomes `streaming` after a delta,
  then `completed` on `done`.
- Caller abort becomes `cancelled`.
- Transport, protocol, or server errors become `failed` with a retry action.
- Only one generation is active at a time; switching conversations does not move
  the request or its result to the newly selected conversation.

Retry resets a failed/cancelled assistant message and reuses the preceding user
turn. Regenerate replaces a completed assistant answer for the same user turn.
Edit and resend replaces the selected user message and removes later branch
messages before generating a new answer.

## Security and compatibility

- `AGNES_API_KEY` remains Backend-only.
- Errors pass through the existing secret redaction boundary.
- Existing `/api/chat`, Image, Video, and Showcase behavior remain available.
- No stream content, prompt, Authorization header, or API key is logged.
