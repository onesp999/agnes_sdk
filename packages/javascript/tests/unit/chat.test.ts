import { describe, expect, it } from "vitest";

import { AgnesClient } from "../../src/client.js";
import { CHAT_MODEL } from "../../src/constants.js";
import {
  AgnesAPIAbortError,
  AgnesAPIError,
  AgnesAPIStreamProtocolError,
  AgnesAPITimeoutError,
} from "../../src/errors.js";
import type { AgnesFetch } from "../../src/config.js";

describe("chat unit tests", () => {
  it("chat completion builds correct request", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ id: "chat-1" });
    });

    await client.chat.create({ messages: [{ role: "user", content: "Hello" }] });

    expect(new URL(requests[0]!.url).pathname).toBe("/v1/chat/completions");
    expect(requests[0]!.body).toEqual({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("chat completion parses response", async () => {
    const client = clientWithFetch(async () =>
      jsonResponse({
        choices: [{ message: { content: "Hello from Agnes" } }],
        usage: { total_tokens: 12 },
      }),
    );

    const result = await client.chat.create({ messages: [{ role: "user", content: "Hello" }] });

    expect(result.choices).toEqual([{ message: { content: "Hello from Agnes" } }]);
    expect(result.usage).toEqual({ total_tokens: 12 });
  });

  it("chat stream yields chunks", async () => {
    const client = clientWithFetch(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true });
      return new Response("data: one\n\ndata: two\n\n", { status: 200 });
    });

    let chunks = "";
    for await (const chunk of client.chat.stream({
      messages: [{ role: "user", content: "Hello" }],
    })) {
      chunks += chunk;
    }

    expect(chunks).toBe("data: one\n\ndata: two\n\n");
  });

  it("parses fragmented and coalesced SSE events", async () => {
    const payload = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"你","reasoning_content":"think"}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{}}],"usage":{"total_tokens":7}}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    const bytes = new TextEncoder().encode(payload);
    const firstBoundary = payload.indexOf("你");
    const firstBoundaryBytes = new TextEncoder().encode(payload.slice(0, firstBoundary)).length + 1;
    const secondBoundary = payload.indexOf("data: [DONE]");
    const secondBoundaryBytes = new TextEncoder().encode(payload.slice(0, secondBoundary)).length;
    const client = clientWithFetch(async () => byteStreamResponse([
      bytes.slice(0, firstBoundaryBytes),
      bytes.slice(firstBoundaryBytes, secondBoundaryBytes),
      bytes.slice(secondBoundaryBytes),
    ]));

    const events = [];
    for await (const event of client.chat.streamEvents({
      messages: [{ role: "user", content: "Hello" }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "delta",
        choiceIndex: 0,
        delta: { role: "assistant", content: "你", reasoning_content: "think" },
        role: "assistant",
        content: "你",
        reasoningContent: "think",
      },
      { type: "finish", choiceIndex: 0, finishReason: "stop" },
      { type: "usage", usage: { total_tokens: 7 } },
      { type: "done" },
    ]);
  });

  it("rejects malformed SSE without echoing the payload", async () => {
    const client = clientWithFetch(async () =>
      new Response("data: {not-json-secret-payload}\n\n", { status: 200 }),
    );

    const consume = async () => {
      for await (const _event of client.chat.streamEvents({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        // Consume the stream.
      }
    };

    await expect(consume()).rejects.toThrow(AgnesAPIStreamProtocolError);
    await expect(consume()).rejects.not.toThrow(/not-json-secret-payload/);
  });

  it("rejects a stream that closes without a done marker", async () => {
    const client = clientWithFetch(async () =>
      new Response('data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n', {
        status: 200,
      }),
    );

    const consume = async () => {
      for await (const _event of client.chat.streamEvents({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        // Consume the stream.
      }
    };

    await expect(consume()).rejects.toThrow(AgnesAPIStreamProtocolError);
    await expect(consume()).rejects.toThrow("without a done marker");
  });

  it("classifies a top-level error event without echoing its payload", async () => {
    const client = clientWithFetch(async () =>
      new Response('data: {"error":{"message":"secret-upstream-detail"}}\n\n', { status: 200 }),
    );

    const consume = async () => {
      for await (const _event of client.chat.streamEvents({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        // Consume the stream.
      }
    };

    await expect(consume()).rejects.toThrow(AgnesAPIError);
    await expect(consume()).rejects.not.toThrow(/secret-upstream-detail/);
  });

  it("propagates caller cancellation as AgnesAPIAbortError", async () => {
    const controller = new AbortController();
    const client = clientWithFetch(async (_input, init) =>
      abortAwareStreamResponse(init?.signal, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"one\"}}]}\n\n"),
    );
    const iterator = client.chat.streamEvents(
      { messages: [{ role: "user", content: "Hello" }] },
      { signal: controller.signal },
    )[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "delta", content: "one" },
      done: false,
    });
    controller.abort();

    await expect(iterator.next()).rejects.toThrow(AgnesAPIAbortError);
  });

  it("keeps the timeout active while consuming a stream", async () => {
    const client = clientWithFetch(
      async (_input, init) => abortAwareStreamResponse(init?.signal),
      { timeout: 10 },
    );

    const consume = async () => {
      for await (const _event of client.chat.streamEvents({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        // Wait for timeout.
      }
    };

    await expect(consume()).rejects.toThrow(AgnesAPITimeoutError);
  });

  it("does not serialize the caller signal into the request body", async () => {
    const requests: CapturedRequest[] = [];
    const controller = new AbortController();
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return new Response("data: [DONE]\n\n", { status: 200 });
    });

    for await (const _event of client.chat.streamEvents(
      { messages: [{ role: "user", content: "Hello" }] },
      { signal: controller.signal },
    )) {
      // Consume the stream.
    }

    expect(requests[0]!.body).not.toHaveProperty("signal");
  });

  it("supports caller cancellation for non-stream chat", async () => {
    const controller = new AbortController();
    const client = clientWithFetch(async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }),
    );

    const result = client.chat.create(
      { messages: [{ role: "user", content: "Hello" }] },
      { signal: controller.signal },
    );
    controller.abort();

    await expect(result).rejects.toThrow(AgnesAPIAbortError);
  });

  it("strips transport-only fields from chat payload extensions", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return new Response("data: [DONE]\n\n", { status: 200 });
    });

    for await (const _event of client.chat.streamEvents({
      messages: [{ role: "user", content: "Hello" }],
      signal: new AbortController().signal,
      stream: false,
    })) {
      // Consume the stream.
    }

    expect(requests[0]!.body).not.toHaveProperty("signal");
    expect(requests[0]!.body?.stream).toBe(true);
  });

  it("passes tools and image_url message payloads through", async () => {
    const requests: CapturedRequest[] = [];
    const message = {
      role: "user",
      content: [
        { type: "text", text: "Describe this" },
        { type: "image_url", image_url: { url: "https://example.test/image.png" } },
      ],
    };
    const tool = {
      type: "function",
      function: { name: "lookup", parameters: { type: "object" } },
    };
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ id: "chat-tools" });
    });

    await client.chat.create({
      messages: [message],
      tools: [tool],
      toolChoice: "auto",
    });

    expect(requests[0]!.body).toMatchObject({
      messages: [message],
      tools: [tool],
      tool_choice: "auto",
    });
  });
});

interface CapturedRequest {
  url: string;
  body?: Record<string, unknown>;
}

function clientWithFetch(fetchImpl: AgnesFetch, options: { timeout?: number } = {}): AgnesClient {
  return new AgnesClient({
    apiKey: "test-key",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    maxRetries: 0,
    retryBackoff: 0,
    timeout: options.timeout,
  });
}

function byteStreamResponse(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function abortAwareStreamResponse(signal?: AbortSignal | null, firstChunk?: string): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      if (firstChunk) controller.enqueue(new TextEncoder().encode(firstChunk));
      signal?.addEventListener("abort", () => {
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: init.status ?? 200,
  });
}

function capture(input: RequestInfo | URL, init: RequestInit | undefined): CapturedRequest {
  return {
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    url: String(input),
  };
}
