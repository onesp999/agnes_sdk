# Contract: TypeScript SDK chat streaming and cancellation

## Purpose

Give Node products a parsed Agnes chat stream and an explicit cancellation
primitive without breaking callers that depend on the existing raw stream.

## Consumers and producer

- Consumers: Agnes Studio BFF and other server-side TypeScript SDK users.
- Producer: `ChatResource`, backed by `AgnesHTTPClient`.

## Inputs

`chat.create(options, requestOptions?)`, `chat.stream(options, requestOptions?)`,
and `chat.streamEvents(options, requestOptions?)` accept an optional second
argument:

```ts
interface AgnesRequestOptions {
  signal?: AbortSignal;
}
```

The signal is optional, has no default, and is never serialized into the Agnes
request body. An already-aborted signal fails before useful response processing.

## Outputs

`chat.stream()` remains `AsyncIterable<string>` and yields lossless decoded raw
HTTP response-body chunks for backward compatibility.

`chat.streamEvents()` returns `AsyncIterable<ChatStreamEvent>`:

```ts
type ChatStreamEvent =
  | {
      type: "delta";
      choiceIndex: number;
      delta: JsonObject;
      role?: string;
      content?: string;
      reasoningContent?: string;
    }
  | { type: "finish"; choiceIndex: number; finishReason: string }
  | { type: "usage"; usage: JsonObject }
  | { type: "done" };
```

The parser buffers across arbitrary network chunks and supports multiple SSE
events in one chunk. An SSE `[DONE]` marker produces exactly one `done` event.
Empty `delta: {}` placeholders do not produce a `delta` event.

## Errors

- Existing HTTP status errors retain their current SDK classes.
- Caller cancellation throws `AgnesAPIAbortError`.
- The configured timeout throws `AgnesAPITimeoutError` and remains active until
  stream consumption finishes or the iterator is closed.
- Invalid SSE JSON or a structurally invalid event throws
  `AgnesAPIStreamProtocolError` without echoing the raw event payload.
- A stream that closes without `[DONE]` is treated as truncated and throws
  `AgnesAPIStreamProtocolError`.
- A top-level `error` event throws a generic `AgnesAPIError` without exposing its
  unverified payload shape.
- A real upstream streaming error-event shape was not observed in the spike and
  is not speculatively normalized by this contract.

## Side effects

Allowed:

- Send the existing Agnes HTTP request.
- Abort local fetch/body consumption when the caller aborts, the timeout expires,
  or the consumer closes the iterator.

Forbidden:

- Logging API keys, headers, prompts, or response content.
- Persisting credentials or stream data.
- Retrying a streaming request automatically.

## Invariants

- Existing request option objects are not mutated.
- `signal` never appears in the JSON request body.
- Raw stream text is not dropped, including a final decoder flush.
- Product consumers need not parse `data:` framing or JSON event boundaries.
- Timeout and caller cancellation remain distinguishable.

## Compatibility

- Backward compatible: Yes.
- Migration required: No.
- Existing `chat.create()` and raw `chat.stream()` calls retain their output
  shapes; the optional request options and `streamEvents()` are additive.
