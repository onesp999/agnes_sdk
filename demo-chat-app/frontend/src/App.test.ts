import { describe, expect, it } from "vitest";
import { buildParameters, defaultSettings, readImageUrl, readVideoResult } from "./App.js";

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

describe("image workspace mapping", () => {
  it("reads URL and Base64 image results", () => {
    expect(readImageUrl({ data: [{ url: "https://cdn.example/image.png" }] })).toBe(
      "https://cdn.example/image.png",
    );
    expect(readImageUrl({ data: [{ b64_json: "ZmFrZQ==" }] })).toBe(
      "data:image/png;base64,ZmFrZQ==",
    );
  });

  it("maps normal image settings without exposing prompt ownership", () => {
    expect(buildParameters({
      ...defaultSettings,
      model: "agnes-image-2.1-flash",
      imageSize: "1024x768",
      imageResponseFormat: "b64_json",
      imageReference: " https://example.test/reference.png ",
    }, "image")).toEqual({
      model: "agnes-image-2.1-flash",
      size: "1024x768",
      responseFormat: "b64_json",
      image: "https://example.test/reference.png",
    });
  });
});

describe("video workspace mapping", () => {
  it("maps normal aspect ratio and duration controls to SDK video parameters", () => {
    expect(buildParameters({
      ...defaultSettings,
      model: "agnes-video-2.5-flash",
      videoAspectRatio: "9:16",
      videoDurationSeconds: "3",
    }, "video")).toEqual({
      model: "agnes-video-2.5-flash",
      width: 720,
      height: 1280,
      frameRate: 24,
      numFrames: 73,
    });
  });

  it("rejects secret-bearing fields anywhere in advanced JSON", () => {
    expect(() => buildParameters({
      ...defaultSettings,
      advanced: JSON.stringify({ extraBody: { headers: { Authorization: "secret" } } }),
    }, "chat")).toThrow("extraBody.headers");
  });
});
