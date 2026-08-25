import { describe, expect, it, vi } from "vitest";
import { isTerminalVideoStatus, pollVideoTask } from "./video.js";

describe("video polling service", () => {
  it("polls through queued and in_progress to completed", async () => {
    const responses = [
      { status: "queued", progress: 0 },
      { status: "in_progress", progress: 50 },
      { status: "completed", metadata: { url: "https://cdn.example/video.mp4" } },
    ];
    const updates: unknown[] = [];
    const fetchImpl = vi.fn(async () => jsonResponse(responses.shift()!));

    const result = await pollVideoTask({
      videoId: "video-1",
      model: "agnes-video-v2.0",
      signal: new AbortController().signal,
      intervalMs: 0,
      onUpdate(payload) { updates.push(payload); },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("video-1?model=agnes-video-v2.0");
    expect(updates).toHaveLength(3);
    expect(result.status).toBe("completed");
  });

  it("stops polling on failed", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "failed", message: "generation failed" }));

    const result = await pollVideoTask({
      videoId: "video-1",
      signal: new AbortController().signal,
      intervalMs: 0,
      onUpdate() {},
      fetchImpl,
    });

    expect(result.status).toBe("failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts while waiting without another retrieve", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "queued" }));
    const result = pollVideoTask({
      videoId: "video-1",
      signal: controller.signal,
      intervalMs: 10_000,
      onUpdate() {},
      fetchImpl,
    });
    await Promise.resolve();
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("recognizes only terminal statuses", () => {
    expect(isTerminalVideoStatus("completed")).toBe(true);
    expect(isTerminalVideoStatus("failed")).toBe(true);
    expect(isTerminalVideoStatus("queued")).toBe(false);
    expect(isTerminalVideoStatus("in_progress")).toBe(false);
  });
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
