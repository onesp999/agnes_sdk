import { describe, expect, it } from "vitest";

import { AgnesClient } from "./client.js";
import { CHAT_MODEL, IMAGE_MODEL, VIDEO_MODEL } from "./constants.js";
import {
  AgnesAPIAuthenticationError,
  AgnesAPIServerError,
  AgnesVideoTaskFailedError,
} from "./errors.js";
import type { AgnesFetch } from "./config.js";

interface CapturedRequest {
  url: string;
  init: RequestInit;
  body?: Record<string, unknown>;
}

describe("AgnesClient MVP", () => {
  it("sends chat create requests with default model and messages", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ id: "chat-1" });
    });

    const result = await client.chat.create({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result).toEqual({ id: "chat-1" });
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/chat/completions");
    expect((requests[0]!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer " + "test-key",
    );
    expect(requests[0]!.body).toMatchObject({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("streams raw chat chunks", async () => {
    const client = clientWithFetch(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true });
      return new Response("data: first\n\ndata: second\n\n", { status: 200 });
    });

    let chunks = "";
    for await (const chunk of client.chat.stream({
      messages: [{ role: "user", content: "Hello" }],
    })) {
      chunks += chunk;
    }

    expect(chunks).toBe("data: first\n\ndata: second\n\n");
  });

  it("maps image responseFormat and image inputs into extra_body", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ data: [{ url: "https://cdn.example/image.png" }] });
    });

    await client.images.generate({
      prompt: "A clean product photo",
      size: "1024x768",
      responseFormat: "url",
      image: ["https://cdn.example/input.png"],
      extraBody: { strength: 0.5 },
    });

    expect(requests[0]!.body).toMatchObject({
      model: IMAGE_MODEL,
      prompt: "A clean product photo",
      size: "1024x768",
      extra_body: {
        response_format: "url",
        image: ["https://cdn.example/input.png"],
        strength: 0.5,
      },
    });
  });

  it("maps video camelCase options to snake_case request fields", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ video_id: "video-1" });
    });

    const result = await client.videos.create({
      prompt: "A cat walking on the beach",
      numFrames: 121,
      frameRate: 24,
      numInferenceSteps: 30,
      negativePrompt: "blur",
      width: 1280,
      height: 720,
    });

    expect(result).toEqual({ video_id: "video-1" });
    expect(requests[0]!.body).toMatchObject({
      model: VIDEO_MODEL,
      prompt: "A cat walking on the beach",
      num_frames: 121,
      frame_rate: 24,
      num_inference_steps: 30,
      negative_prompt: "blur",
      width: 1280,
      height: 720,
    });
  });

  it("rejects invalid video options before sending requests", async () => {
    let calls = 0;
    const client = clientWithFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });

    await expect(client.videos.create({ prompt: "bad", numFrames: 122 })).rejects.toThrow(
      RangeError,
    );
    expect(calls).toBe(0);
  });

  it("retrieves video status from the recommended endpoint", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ status: "completed" });
    });

    await client.videos.retrieve("video-1", { modelName: VIDEO_MODEL });

    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/agnesapi");
    expect(url.searchParams.get("video_id")).toBe("video-1");
    expect(url.searchParams.get("model_name")).toBe(VIDEO_MODEL);
  });

  it("retrieves legacy video status from the legacy endpoint", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ status: "completed" });
    });

    await client.videos.retrieveLegacy("task-1");

    expect(new URL(requests[0]!.url).pathname).toBe("/v1/videos/task-1");
  });

  it("waits until video completion and normalizes the URL", async () => {
    const responses = [
      { status: "queued" },
      { status: "in_progress" },
      { status: "completed", remixed_from_video_id: "https://cdn.example/video.mp4" },
    ];
    const client = clientWithFetch(async () => jsonResponse(responses.shift()!));

    const result = await client.videos.wait("video-1", {
      timeoutMs: 100,
      pollIntervalMs: 0,
    });

    expect(result).toMatchObject({
      status: "completed",
      video_url: "https://cdn.example/video.mp4",
    });
  });

  it("raises when a video task fails", async () => {
    const client = clientWithFetch(async () => jsonResponse({ status: "failed" }));

    await expect(
      client.videos.wait("video-1", { timeoutMs: 100, pollIntervalMs: 0 }),
    ).rejects.toThrow(AgnesVideoTaskFailedError);
  });

  it("does not retry 401 responses", async () => {
    let calls = 0;
    const client = clientWithFetch(
      async () => {
        calls += 1;
        return jsonResponse({ error: { message: "bad credentials" } }, { status: 401 });
      },
      { maxRetries: 3 },
    );

    await expect(
      client.chat.create({ messages: [{ role: "user", content: "Hello" }] }),
    ).rejects.toThrow(AgnesAPIAuthenticationError);
    expect(calls).toBe(1);
  });

  it("retries 503 responses and then succeeds", async () => {
    let calls = 0;
    const client = clientWithFetch(
      async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({ message: "try again" }, { status: 503 });
        }
        return jsonResponse({ ok: true });
      },
      { maxRetries: 2, retryBackoff: 0 },
    );

    await expect(client.chat.create({ messages: [{ role: "user", content: "Hello" }] })).resolves
      .toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it("raises after retryable errors are exhausted", async () => {
    const client = clientWithFetch(
      async () => jsonResponse({ message: "still down" }, { status: 503 }),
      { maxRetries: 1, retryBackoff: 0 },
    );

    await expect(
      client.chat.create({ messages: [{ role: "user", content: "Hello" }] }),
    ).rejects.toThrow(AgnesAPIServerError);
  });
});

function clientWithFetch(
  fetchImpl: AgnesFetch,
  options: { maxRetries?: number; retryBackoff?: number } = {},
): AgnesClient {
  return new AgnesClient({
    apiKey: "test-key",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    maxRetries: options.maxRetries ?? 0,
    retryBackoff: options.retryBackoff ?? 0,
  });
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: init.status ?? 200,
  });
}

function capture(input: RequestInfo | URL, init: RequestInit | undefined): CapturedRequest {
  const requestInit = init ?? {};
  const body =
    typeof requestInit.body === "string"
      ? (JSON.parse(requestInit.body) as Record<string, unknown>)
      : undefined;

  return {
    body,
    init: requestInit,
    url: String(input),
  };
}
