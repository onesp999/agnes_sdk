import { describe, expect, it, vi } from "vitest";

import {
  callBackend,
  extractAssistantContent,
  extractImagePreview,
  extractVideoUrl,
  validateVideoFrames,
} from "./api";

describe("api helpers", () => {
  it("builds backend requests without Agnes credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callBackend("http://localhost:3001", "/api/chat", {
      method: "POST",
      body: { messages: [] },
    })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:3001/api/chat"),
      expect.objectContaining({
        body: JSON.stringify({ messages: [] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
  });

  it.each([1, 9, 121, 441])("accepts valid video frame count %i", (numFrames) => {
    expect(validateVideoFrames(numFrames)).toBeUndefined();
  });

  it.each([0, 2, 122, 442])("rejects invalid video frame count %i", (numFrames) => {
    expect(validateVideoFrames(numFrames)).toBeTruthy();
  });

  it("extracts assistant content", () => {
    expect(
      extractAssistantContent({
        choices: [{ message: { content: "Hello" } }],
      }),
    ).toBe("Hello");
  });

  it("extracts image previews", () => {
    expect(extractImagePreview({ data: [{ url: "https://cdn.example/image.png" }] })).toBe(
      "https://cdn.example/image.png",
    );
    expect(extractImagePreview({ data: [{ b64_json: "abc" }] })).toBe(
      "data:image/png;base64,abc",
    );
  });

  it("extracts compatible video URLs", () => {
    expect(extractVideoUrl({ remixed_from_video_id: "https://cdn.example/video.mp4" })).toBe(
      "https://cdn.example/video.mp4",
    );
  });
});
