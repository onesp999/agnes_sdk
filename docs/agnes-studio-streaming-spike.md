# Agnes Studio Streaming and Cancellation Spike

Date: 2026-08-25

## Result

Status: **Success**

Two minimal real Agnes requests confirmed the current chat streaming transport and
client-side cancellation behavior. The experiment used a fixed, non-sensitive
prompt and emitted structural diagnostics only. It did not log response text,
the API key, or the `Authorization` header.

## Wire-format evidence

- HTTP status was `200` and `Content-Type` was `text/event-stream`.
- Every observed event used an SSE `data:` field.
- The stream ended with `data: [DONE]`.
- Non-terminal `data:` payloads were JSON objects with top-level fields including
  `id`, `object`, `created`, `model`, and `choices`.
- Observed choice deltas included `role`, `content`, and `reasoning_content`.
- A terminal choice carried `finish_reason`.
- A separate final JSON event carried `usage`.
- No error event was observed in these successful requests, so the real streaming
  error-event shape remains unverified.

The first run returned 22 SSE frames in 20 network chunks. The second run returned
6 SSE frames in 4 network chunks; two chunks each contained two complete SSE
frames. Therefore a network chunk is not an event boundary. No fragmented SSE
frame happened to appear in these two runs, but an SDK parser must buffer across
chunks because HTTP response-body chunking does not preserve SSE frame boundaries.

## Cancellation evidence

A direct request used an external `AbortController`, read the first response-body
chunk, and then called `abort()`. The next body read rejected with `AbortError` in
2 ms during the confirming run. This proves that the Node fetch transport can stop
local response consumption promptly. It does not prove that the upstream service
stops already-scheduled model computation or billing.

The current SDK does not expose a caller `AbortSignal`. Its internal timeout signal
is passed to `fetch`, but the timer is cleared as soon as response headers arrive,
so it does not bound streaming body consumption. The current demo BFF has no
streaming route, and therefore has no client-disconnect propagation path today.

## SDK decision gate

Task 1 is justified by real evidence:

1. Parse SSE with a buffer rather than exposing arbitrary decoded network chunks.
2. Preserve content deltas, reasoning deltas, `finish_reason`, `usage`, `[DONE]`,
   and an explicit protocol-error path.
3. Accept a caller `AbortSignal` without serializing it into the Agnes JSON body.
4. Keep timeout and caller cancellation distinguishable and active for the full
   lifetime of stream consumption.
5. Let the BFF abort the SDK request when the browser connection closes.

The public event contract must be defined and tested in Task 1. Error-event
normalization should remain conservative until a real error event or authoritative
protocol documentation is available.

## Temporary-code cleanup

The isolated spike script was deleted after both runs. No spike code was added to
the SDK or demo production paths.
