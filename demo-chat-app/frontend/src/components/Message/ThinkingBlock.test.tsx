// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ThinkingBlock } from "./ThinkingBlock.js";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("ThinkingBlock", () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
  });

  it("expands while reasoning, collapses once when the answer starts, and respects reopening", async () => {
    const container = document.createElement("div");
    root = createRoot(container);

    await act(async () => root?.render(<ThinkingBlock
      reasoningContent="First reasoning step"
      answerStarted={false}
      generating
    />));

    let toggle = container.querySelector<HTMLButtonElement>(".thinking-toggle")!;
    expect(toggle.textContent).toContain("正在思考");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("First reasoning step");

    await act(async () => root?.render(<ThinkingBlock
      reasoningContent="First reasoning step"
      answerStarted
      generating
    />));

    toggle = container.querySelector<HTMLButtonElement>(".thinking-toggle")!;
    expect(toggle.textContent).toContain("已思考");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("First reasoning step");

    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await act(async () => root?.render(<ThinkingBlock
      reasoningContent="First reasoning step and another detail"
      answerStarted
      generating
    />));

    toggle = container.querySelector<HTMLButtonElement>(".thinking-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("another detail");
  });

  it("defaults completed historical reasoning to collapsed", async () => {
    const container = document.createElement("div");
    root = createRoot(container);

    await act(async () => root?.render(<ThinkingBlock
      reasoningContent="Historical reasoning"
      answerStarted
      generating={false}
    />));

    const toggle = container.querySelector<HTMLButtonElement>(".thinking-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Historical reasoning");
  });
});
