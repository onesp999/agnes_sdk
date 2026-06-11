import { describe, expect, it } from "vitest";

import { AgnesClient } from "../../src/client.js";
import type { AgnesFetch } from "../../src/config.js";

describe("image unit tests", () => {
  it("image generation url response", async () => {
    const client = clientWithFetch(async () =>
      jsonResponse({ data: [{ url: "https://cdn.example/image.png" }] }),
    );

    const result = await client.images.generate({ prompt: "A glass cube", responseFormat: "url" });

    expect(result.data).toEqual([{ url: "https://cdn.example/image.png" }]);
  });

  it("image generation base64 response", async () => {
    const client = clientWithFetch(async () => jsonResponse({ data: [{ b64_json: "ZmFrZQ==" }] }));

    const result = await client.images.generate({ prompt: "A glass cube", returnBase64: true });

    expect(result.data).toEqual([{ b64_json: "ZmFrZQ==" }]);
  });

  it("image-to-image request uses extra_body.image", async () => {
    const requests: CapturedRequest[] = [];
    const client = clientWithFetch(async (input, init) => {
      requests.push(capture(input, init));
      return jsonResponse({ data: [{ url: "https://cdn.example/edited.png" }] });
    });

    await client.images.generate({
      prompt: "Edit image",
      image: ["https://example.test/input.png"],
      extraBody: { strength: 0.5 },
    });

    expect(requests[0]!.body).not.toHaveProperty("image");
    expect(requests[0]!.body).toMatchObject({
      extra_body: {
        image: ["https://example.test/input.png"],
        strength: 0.5,
      },
    });
  });
});

interface CapturedRequest {
  body?: Record<string, unknown>;
  url: string;
}

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

function capture(input: RequestInfo | URL, init: RequestInit | undefined): CapturedRequest {
  return {
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    url: String(input),
  };
}
