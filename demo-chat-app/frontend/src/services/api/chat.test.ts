import { describe, expect, it } from "vitest";
import { ChatStreamError, parseNdjsonStream, streamChat } from "./chat.js";

describe("browser chat stream", () => {
  it("parses fragmented UTF-8 and multiple NDJSON events per chunk", async () => {
    const text = [
      '{"type":"delta","choiceIndex":0,"content":"你"}\n',
      '{"type":"finish","choiceIndex":0,"finishReason":"stop"}\n',
      '{"type":"done"}\n',
    ].join("");
    const bytes = new TextEncoder().encode(text);
    const unicodeOffset = new TextEncoder().encode(text.slice(0, text.indexOf("你"))).length + 1;
    const body = byteStream([bytes.slice(0, unicodeOffset), bytes.slice(unicodeOffset)]);
    const events = [];

    for await (const event of parseNdjsonStream(body)) events.push(event);

    expect(events).toEqual([
      { type: "delta", choiceIndex: 0, content: "你" },
      { type: "finish", choiceIndex: 0, finishReason: "stop" },
      { type: "done" },
    ]);
  });

  it("surfaces a safe terminal error event", async () => {
    const fetchImpl = async () => new Response(
      '{"type":"error","error":{"type":"AgnesAPIError","message":"Safe failure"}}\n',
      { status: 200 },
    );

    await expect(streamChat(
      { messages: [{ role: "user", content: "Hello" }] },
      { signal: new AbortController().signal, onEvent() {}, fetchImpl },
    )).rejects.toMatchObject({
      name: "ChatStreamError",
      message: "Safe failure",
      serverType: "AgnesAPIError",
    });
  });

  it("preserves reasoning and content from the same delta", async () => {
    const body = byteStream([new TextEncoder().encode(
      '{"type":"delta","choiceIndex":0,"reasoningContent":"Plan","content":"Answer"}\n',
    )]);
    const events = [];

    for await (const event of parseNdjsonStream(body)) events.push(event);

    expect(events).toEqual([{
      type: "delta",
      choiceIndex: 0,
      reasoningContent: "Plan",
      content: "Answer",
    }]);
  });

  it("rejects malformed NDJSON without echoing the payload", async () => {
    const body = byteStream([new TextEncoder().encode("not-json-secret\n")]);
    const consume = async () => {
      for await (const _event of parseNdjsonStream(body)) {
        // Consume the stream.
      }
    };

    let failure: unknown;
    try {
      await consume();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ChatStreamError);
    expect((failure as Error).message).not.toContain("not-json-secret");
  });

  it("passes the caller signal to fetch", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedSignal = init?.signal;
      return new Response('{"type":"done"}\n', { status: 200 });
    };

    await streamChat(
      { messages: [{ role: "user", content: "Hello" }] },
      { signal: controller.signal, onEvent() {}, fetchImpl },
    );

    expect(receivedSignal).toBe(controller.signal);
  });
});

function byteStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
