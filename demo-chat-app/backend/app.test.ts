import request from "supertest";
import { describe, expect, it } from "vitest";
import http from "node:http";
import { createApp, type AgnesDemoClient } from "./app.js";

describe("local chat backend", () => {
  it("reports health", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("returns a demo response without an API key", async () => {
    const response = await request(createApp())
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "你好" }] });
    expect(response.status).toBe(200);
    expect(response.body.choices[0].message.content).toContain("本地演示回复");
  });

  it("offers local image and video experiences without an API key", async () => {
    const app = createApp();
    const image = await request(app)
      .post("/api/images")
      .send({ prompt: "showcase image", parameters: { model: "agnes-image-2.1-flash" } });
    const video = await request(app)
      .post("/api/videos")
      .send({ prompt: "showcase video", parameters: { model: "agnes-video-v2.0" } });
    const videoStatus = await request(app).get(`/api/videos/${video.body.video_id}`);

    expect(image.status).toBe(200);
    expect(image.body.data[0].url).toContain("data:image/svg+xml");
    expect(video.status).toBe(200);
    expect(video.body.status).toBe("queued");
    expect(videoStatus.status).toBe(200);
    expect(videoStatus.body.status).toBe("completed");
    expect(videoStatus.body.message).toContain("本地演示模式");
  });

  it("passes validated messages to an injected SDK client", async () => {
    let received: unknown;
    const client = fakeClient({ chat: { async create(payload) { received = payload; return { choices: [] }; } } });
    const response = await request(createApp({ clientFactory: () => client }))
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "test" }] });
    expect(response.status).toBe(200);
    expect(received).toEqual({ messages: [{ role: "user", content: "test" }] });
  });

  it("streams mock chat events as NDJSON without an API key", async () => {
    const response = await request(createApp())
      .post("/api/chat/stream")
      .send({ messages: [{ role: "user", content: "test" }] });
    const events = parseNdjson(response.text);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    expect(events.some((event) => event.type === "delta")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("bridges parsed SDK events without exposing raw SSE framing", async () => {
    let received: unknown;
    const client = fakeClient({
      chat: {
        async create() { return { choices: [] }; },
        async *streamEvents(payload, options) {
          received = { payload, signal: options?.signal };
          yield {
            type: "delta",
            choiceIndex: 0,
            delta: { content: "Hello" },
            content: "Hello",
          };
          yield { type: "finish", choiceIndex: 0, finishReason: "stop" };
          yield { type: "usage", usage: { total_tokens: 3 } };
          yield { type: "done" };
        },
      },
    });
    const response = await request(createApp({ clientFactory: () => client }))
      .post("/api/chat/stream")
      .send({ messages: [{ role: "user", content: "test" }] });
    const events = parseNdjson(response.text);

    expect(events).toEqual([
      { type: "delta", choiceIndex: 0, content: "Hello" },
      { type: "finish", choiceIndex: 0, finishReason: "stop" },
      { type: "usage", usage: { total_tokens: 3 } },
      { type: "done" },
    ]);
    expect(received).toMatchObject({
      payload: { messages: [{ role: "user", content: "test" }] },
      signal: { aborted: false },
    });
    expect(response.text).not.toContain("data:");
  });

  it("aborts the SDK signal when the browser disconnects", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveAborted: (() => void) | undefined;
    const aborted = new Promise<void>((resolve) => { resolveAborted = resolve; });
    const client = fakeClient({
      chat: {
        async create() { return { choices: [] }; },
        async *streamEvents(_payload, options) {
          capturedSignal = options?.signal;
          yield { type: "delta", choiceIndex: 0, delta: { content: "one" }, content: "one" };
          await new Promise<void>((resolve) => {
            options?.signal?.addEventListener("abort", () => {
              resolveAborted?.();
              resolve();
            }, { once: true });
          });
        },
      },
    });
    const server = createApp({ clientFactory: () => client }).listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind.");

    await new Promise<void>((resolve, reject) => {
      const outgoing = http.request({
        hostname: "127.0.0.1",
        port: address.port,
        path: "/api/chat/stream",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      outgoing.on("response", (incoming) => {
        incoming.once("data", () => {
          incoming.destroy();
          resolve();
        });
      });
      outgoing.on("error", reject);
      outgoing.end(JSON.stringify({ messages: [{ role: "user", content: "test" }] }));
    });

    await Promise.race([
      aborted,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Abort was not propagated.")), 1_000)),
    ]);
    expect(capturedSignal?.aborted).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("passes validated request parameters to an injected SDK client", async () => {
    let received: unknown;
    const client = fakeClient({ chat: { async create(payload) { received = payload; return { choices: [] }; } } });
    const response = await request(createApp({ clientFactory: () => client }))
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "test" }],
        parameters: {
          model: "agnes-2.0-flash",
          temperature: 0.4,
          topP: 0.9,
          maxTokens: 1024,
          thinking: { type: "enabled" },
        },
      });
    expect(response.status).toBe(200);
    expect(received).toEqual({
      model: "agnes-2.0-flash",
      temperature: 0.4,
      topP: 0.9,
      maxTokens: 1024,
      thinking: { type: "enabled" },
      messages: [{ role: "user", content: "test" }],
    });
  });

  it("routes image models through the image SDK resource", async () => {
    let received: unknown;
    const client = fakeClient({
      images: { async generate(payload) { received = payload; return { data: [{ url: "image.png" }] }; } },
    });
    const response = await request(createApp({ clientFactory: () => client }))
      .post("/api/images")
      .send({
        prompt: "a glass cube",
        parameters: { model: "agnes-image-2.0-flash", size: "1024x1024" },
      });
    expect(response.status).toBe(200);
    expect(received).toEqual({ model: "agnes-image-2.0-flash", size: "1024x1024", prompt: "a glass cube" });
  });

  it("creates and retrieves video tasks through the video SDK resource", async () => {
    const calls: unknown[] = [];
    const client = fakeClient({
      videos: {
        async create(payload) { calls.push(payload); return { video_id: "video-1" }; },
        async retrieve(videoId, options) { calls.push({ videoId, options }); return { status: "completed" }; },
      },
    });
    const app = createApp({ clientFactory: () => client });
    const created = await request(app).post("/api/videos").send({
      prompt: "waves at sunset",
      parameters: { model: "agnes-video-2.5-flash", numFrames: 121, frameRate: 24 },
    });
    const retrieved = await request(app).get("/api/videos/video-1?model=agnes-video-2.5-flash");
    expect(created.status).toBe(200);
    expect(retrieved.status).toBe(200);
    expect(calls).toEqual([
      { model: "agnes-video-2.5-flash", numFrames: 121, frameRate: 24, prompt: "waves at sunset" },
      { videoId: "video-1", options: { modelName: "agnes-video-2.5-flash" } },
    ]);
  });

  it.each(["/api/images", "/api/videos"])("rejects an empty media prompt on %s", async (endpoint) => {
    const response = await request(createApp()).post(endpoint).send({ prompt: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("prompt");
  });

  it.each([
    [{ temperature: 3 }, "temperature"],
    [{ topP: -0.1 }, "topP"],
    [{ maxTokens: 1.5 }, "maxTokens"],
    [{ stream: true }, "stream"],
    [{ messages: [] }, "messages"],
  ])("rejects invalid or reserved parameters: %s", async (parameters, expectedMessage) => {
    const response = await request(createApp())
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "test" }], parameters });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain(expectedMessage);
  });

  it("rejects empty conversations", async () => {
    const response = await request(createApp()).post("/api/chat").send({ messages: [] });
    expect(response.status).toBe(400);
  });
});

function fakeClient(overrides: Partial<AgnesDemoClient> = {}): AgnesDemoClient {
  return {
    chat: { async create() { return { choices: [] }; } },
    images: { async generate() { return { data: [] }; } },
    videos: {
      async create() { return { video_id: "video-1" }; },
      async retrieve(videoId) { return { video_id: videoId, status: "queued" }; },
    },
    ...overrides,
  };
}

function parseNdjson(text: string): Array<Record<string, unknown>> {
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
