import { describe, expect, it } from "vitest";

import { AgnesClient } from "../../src/client.js";
import { CHAT_MODEL } from "../../src/constants.js";
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

function clientWithFetch(fetchImpl: AgnesFetch): AgnesClient {
  return new AgnesClient({
    apiKey: "test-key",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    maxRetries: 0,
    retryBackoff: 0,
  });
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
