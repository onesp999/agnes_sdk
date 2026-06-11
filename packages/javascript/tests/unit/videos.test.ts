import { describe, expect, it } from "vitest";

import { AgnesClient } from "../../src/client.js";
import type { AgnesFetch } from "../../src/config.js";
import { AgnesAPITimeoutError, AgnesVideoTaskFailedError } from "../../src/errors.js";
import { extractVideoUrl } from "../../src/videos.js";

describe("video unit tests", () => {
  it("video create returns video_id", async () => {
    const client = clientWithFetch(async () => jsonResponse({ video_id: "video-1" }));

    await expect(client.videos.create({ prompt: "A beach", numFrames: 121 })).resolves.toEqual({
      video_id: "video-1",
    });
  });

  it("video wait handles queued to completed", async () => {
    const responses = [
      { status: "queued" },
      { status: "in_progress" },
      { status: "completed", video_url: "https://cdn.example/video.mp4" },
    ];
    const client = clientWithFetch(async () => jsonResponse(responses.shift()!));

    await expect(
      client.videos.wait("video-1", { timeoutMs: 100, pollIntervalMs: 0 }),
    ).resolves.toMatchObject({
      status: "completed",
      video_url: "https://cdn.example/video.mp4",
    });
  });

  it("video wait handles failed", async () => {
    const client = clientWithFetch(async () => jsonResponse({ status: "failed" }));

    await expect(
      client.videos.wait("video-1", { timeoutMs: 100, pollIntervalMs: 0 }),
    ).rejects.toThrow(AgnesVideoTaskFailedError);
  });

  it("video wait handles timeout", async () => {
    const client = clientWithFetch(async () => jsonResponse({ status: "queued" }));

    await expect(
      client.videos.wait("video-1", { timeoutMs: 0, pollIntervalMs: 0 }),
    ).rejects.toThrow(AgnesAPITimeoutError);
  });

  it("video url field compatibility", () => {
    expect(
      extractVideoUrl({
        video_url: "https://cdn.example/video.mp4",
        remixed_from_video_id: "https://cdn.example/fallback.mp4",
      }),
    ).toBe("https://cdn.example/video.mp4");
    expect(extractVideoUrl({ remixed_from_video_id: "https://cdn.example/fallback.mp4" })).toBe(
      "https://cdn.example/fallback.mp4",
    );
  });
});

function clientWithFetch(fetchImpl: AgnesFetch): AgnesClient {
  return new AgnesClient({
    apiKey: "test-key",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    maxRetries: 0,
    retryBackoff: 0,
  });
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
