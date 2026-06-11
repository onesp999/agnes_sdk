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
