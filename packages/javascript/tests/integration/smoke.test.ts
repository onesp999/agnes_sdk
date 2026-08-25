import { describe, expect, it } from "vitest";

import { AgnesClient } from "../../src/client.js";

const runIntegration =
  process.env.RUN_AGNES_INTEGRATION_TESTS === "1" && Boolean(process.env.AGNES_API_KEY);
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("Agnes API smoke tests", () => {
  it("chat smoke returns choices", async () => {
    const client = new AgnesClient();

    const result = await client.chat.create({
      messages: [{ role: "user", content: "Reply with the word pong." }],
      maxTokens: 16,
    });

    expect(Array.isArray(result.choices)).toBe(true);
  });

  it("chat streaming smoke returns parsed events", async () => {
    const client = new AgnesClient();
    const eventTypes: string[] = [];
    let contentLength = 0;

    for await (const event of client.chat.streamEvents({
      messages: [{ role: "user", content: "Reply with the word pong." }],
      maxTokens: 16,
    })) {
      eventTypes.push(event.type);
      if (event.type === "delta") contentLength += event.content?.length ?? 0;
    }

    expect(contentLength).toBeGreaterThan(0);
    expect(eventTypes).toContain("finish");
    expect(eventTypes).toContain("usage");
    expect(eventTypes.at(-1)).toBe("done");
  });

  it("image smoke returns url", async () => {
    const client = new AgnesClient();

    const result = await client.images.generate({
      prompt: "A simple blue square on a white background",
      responseFormat: "url",
    });

    expect(Array.isArray(result.data)).toBe(true);
  });

  it("video create smoke returns video_id", async () => {
    const client = new AgnesClient();

    const result = await client.videos.create({
      prompt: "A simple static shot of a blue square",
      numFrames: 9,
    });

    expect(typeof result.video_id).toBe("string");
  });
});
