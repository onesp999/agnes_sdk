import { AgnesAPIAuthenticationError, AgnesConfigurationError } from "@agnes-ai/sdk";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp, type ExampleAgnesClient } from "./app.js";

describe("Express example app", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns health status", async () => {
    const response = await request(createApp(fakeFactory())).get("/health");

    expect(response.body).toEqual({ status: "ok" });
  });

  it("routes chat requests without requiring a frontend API key", async () => {
    const response = await request(createApp(fakeFactory()))
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "Hello" }] });

    expect(response.status).toBe(200);
    expect(response.body.payload).toEqual({
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("routes image requests", async () => {
    const response = await request(createApp(fakeFactory()))
      .post("/api/images")
      .send({ prompt: "image" });

    expect(response.status).toBe(200);
    expect(response.body.data[0].url).toBe("https://cdn.example/image.png");
  });

  it("routes video requests", async () => {
    const app = createApp(fakeFactory());

    expect((await request(app).post("/api/videos").send({ prompt: "video" })).body.video_id).toBe(
      "video-1",
    );
    expect((await request(app).get("/api/videos/video-1")).body.status).toBe("completed");
    expect(
      (await request(app).post("/api/videos/video-1/wait").send({ pollIntervalMs: 0 })).body
        .payload.pollIntervalMs,
    ).toBe(0);
  });

  it("redacts API keys from error responses", async () => {
    vi.stubEnv("AGNES_API_KEY", "secret-key");
    const response = await request(
      createApp(() => {
        throw new AgnesConfigurationError("missing secret-key");
      }),
    )
      .post("/api/chat")
      .send({ messages: [] });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("secret-key");
    expect(JSON.stringify(response.body)).toContain("[redacted]");
  });

  it("preserves Agnes API status codes", async () => {
    const response = await request(
      createApp(() => ({
        ...fakeClient(),
        chat: {
          async create() {
            throw new AgnesAPIAuthenticationError("bad credentials", { statusCode: 401 });
          },
        },
      })),
    )
      .post("/api/chat")
      .send({ messages: [] });

    expect(response.status).toBe(401);
    expect(response.body.error.type).toBe("AgnesAPIAuthenticationError");
  });
});

function fakeFactory(): () => ExampleAgnesClient {
  return () => fakeClient();
}

function fakeClient(): ExampleAgnesClient {
  return {
    chat: {
      async create(payload) {
        return { id: "chat-1", payload };
      },
    },
    images: {
      async generate(payload) {
        return { data: [{ url: "https://cdn.example/image.png" }], payload };
      },
    },
    videos: {
      async create(payload) {
        return { video_id: "video-1", payload };
      },
      async retrieve(videoId) {
        return { video_id: videoId, status: "completed" };
      },
      async wait(videoId, options) {
        return { video_id: videoId, status: "completed", payload: options };
      },
    },
  };
}
