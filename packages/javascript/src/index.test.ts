import { describe, expect, it, vi } from "vitest";

import {
  CHAT_COMPLETIONS_ENDPOINT,
  CHAT_MODEL,
  DEFAULT_BASE_URL,
  IMAGE_GENERATIONS_ENDPOINT,
  IMAGE_MODEL,
  NON_RETRYABLE_STATUS_CODES,
  RETRYABLE_STATUS_CODES,
  VIDEO_CREATE_ENDPOINT,
  VIDEO_MODEL,
  VIDEO_QUERY_ENDPOINT,
} from "./constants.js";
import { resolveConfig } from "./config.js";
import { AgnesAPIAuthenticationError, AgnesConfigurationError } from "./errors.js";
import { extractVideoUrl, validateVideoOptions } from "./videos.js";

describe("shared semantics", () => {
  it("matches the designed constants", () => {
    expect(DEFAULT_BASE_URL).toBe("https://apihub.agnes-ai.com");
    expect(CHAT_MODEL).toBe("agnes-2.0-flash");
    expect(IMAGE_MODEL).toBe("agnes-image-2.1-flash");
    expect(VIDEO_MODEL).toBe("agnes-video-v2.0");
    expect(CHAT_COMPLETIONS_ENDPOINT).toBe("/v1/chat/completions");
    expect(IMAGE_GENERATIONS_ENDPOINT).toBe("/v1/images/generations");
    expect(VIDEO_CREATE_ENDPOINT).toBe("/v1/videos");
    expect(VIDEO_QUERY_ENDPOINT).toBe("/agnesapi");
  });

  it("uses conservative retry sets", () => {
    expect(NON_RETRYABLE_STATUS_CODES.has(400)).toBe(true);
    expect(NON_RETRYABLE_STATUS_CODES.has(401)).toBe(true);
    expect(NON_RETRYABLE_STATUS_CODES.has(404)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(500)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(503)).toBe(true);
  });

  it("requires an API key", () => {
    vi.stubEnv("AGNES_API_KEY", "");

    expect(() => resolveConfig()).toThrow(AgnesConfigurationError);

    vi.unstubAllEnvs();
  });

  it("reads environment config", () => {
    vi.stubEnv("AGNES_API_KEY", "test-key");
    vi.stubEnv("AGNES_BASE_URL", "https://example.test/");

    expect(resolveConfig()).toMatchObject({
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    vi.unstubAllEnvs();
  });

  it("keeps API key out of authentication error messages", () => {
    const error = new AgnesAPIAuthenticationError("Authentication failed.", {
      endpoint: "/v1/chat/completions",
      statusCode: 401,
    });

    expect(error.message).not.toContain("secret-key");
    expect(error.statusCode).toBe(401);
    expect(error.endpoint).toBe("/v1/chat/completions");
  });

  it.each([1, 9, 121, 441])("accepts valid numFrames %i", (numFrames) => {
    expect(() => validateVideoOptions({ numFrames, frameRate: 24 })).not.toThrow();
  });

  it.each([0, 2, 122, 442])("rejects invalid numFrames %i", (numFrames) => {
    expect(() => validateVideoOptions({ numFrames, frameRate: 24 })).toThrow(RangeError);
  });

  it.each([0, 61])("rejects invalid frameRate %i", (frameRate) => {
    expect(() => validateVideoOptions({ numFrames: 121, frameRate })).toThrow(RangeError);
  });

  it("prefers video_url", () => {
    expect(
      extractVideoUrl({
        video_url: "https://cdn.example/video.mp4",
        remixed_from_video_id: "fallback",
      }),
    ).toBe("https://cdn.example/video.mp4");
  });

  it("falls back to remixed_from_video_id", () => {
    expect(extractVideoUrl({ remixed_from_video_id: "https://cdn.example/fallback.mp4" })).toBe(
      "https://cdn.example/fallback.mp4",
    );
  });
});
