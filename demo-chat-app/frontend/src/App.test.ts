import { describe, expect, it } from "vitest";
import { readVideoResult } from "./App.js";

describe("video result presentation", () => {
  it("reads the current API video URL from metadata.url", () => {
    const result = readVideoResult({
      status: "completed",
      metadata: { url: "https://cdn.example/video.mp4" },
    }, "agnes-video-2.5-flash");

    expect(result.media).toEqual({ kind: "video", url: "https://cdn.example/video.mp4" });
    expect(result.videoStatus).toBe("completed");
    expect(result.content).toContain("视频生成完成");
  });

  it("updates completed status even when a polling response omits video_id", () => {
    const result = readVideoResult({ status: "completed" }, "agnes-video-v2.0");

    expect(result.videoId).toBeUndefined();
    expect(result.videoStatus).toBe("completed");
    expect(result.content).toContain("没有可播放的视频地址");
  });

  it("keeps compatibility with top-level video URL fields", () => {
    const result = readVideoResult({
      status: "completed",
      video_url: "https://cdn.example/legacy.mp4",
    }, "agnes-video-v2.0");

    expect(result.media).toEqual({ kind: "video", url: "https://cdn.example/legacy.mp4" });
  });
});
