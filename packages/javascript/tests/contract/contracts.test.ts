import { describe, expect, it, vi } from "vitest";

import { AgnesClient } from "../../src/client.js";
import {
  CHAT_COMPLETIONS_ENDPOINT,
  IMAGE_GENERATIONS_ENDPOINT,
  VIDEO_CREATE_ENDPOINT,
  VIDEO_QUERY_ENDPOINT,
} from "../../src/constants.js";
import type { AgnesFetch } from "../../src/config.js";
import { AgnesConfigurationError } from "../../src/errors.js";

describe("SDK contracts", () => {
  it("core endpoints match Agnes contract", () => {
    expect(CHAT_COMPLETIONS_ENDPOINT).toBe("/v1/chat/completions");
    expect(IMAGE_GENERATIONS_ENDPOINT).toBe("/v1/images/generations");
    expect(VIDEO_CREATE_ENDPOINT).toBe("/v1/videos");
    expect(VIDEO_QUERY_ENDPOINT).toBe("/agnesapi");
  });

  it("missing api key throws clear error", () => {
    vi.stubEnv("AGNES_API_KEY", "");

    expect(() => new AgnesClient()).toThrow(AgnesConfigurationError);
    expect(() => new AgnesClient()).toThrow("Missing Agnes API key");
  });

  it("does not include API key in error messages", async () => {
    const secret = "agnes-secret-test-key";
    const fetchImpl: AgnesFetch = async () =>
      jsonResponse(
        { error: { message: `bad Authorization: Bearer ${secret}` } },
        { status: 401 },
      );
    const client = new AgnesClient({
      apiKey: secret,
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      maxRetries: 0,
    });

    await expect(client.chat.create({ messages: [{ role: "user", content: "Hello" }] })).rejects
      .toThrow("Bearer [REDACTED]");
    await expect(client.chat.create({ messages: [{ role: "user", content: "Hello" }] })).rejects
      .not.toThrow(secret);
  });
});

function jsonResponse(data: unknown, init: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: init.status,
  });
}
