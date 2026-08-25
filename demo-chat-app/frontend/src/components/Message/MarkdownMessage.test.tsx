// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownMessage } from "./MarkdownMessage.js";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("MarkdownMessage", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.replaceChildren(container);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders common Markdown and safe links", async () => {
    const root = createRoot(container);
    await act(async () => root.render(<MarkdownMessage content={[
      "# Heading",
      "",
      "- **Bold** and *italic* with `inline`",
      "",
      "[Example](https://example.test)",
    ].join("\n")} />));

    expect(container.querySelector("h1")?.textContent).toBe("Heading");
    expect(container.querySelector("li strong")?.textContent).toBe("Bold");
    expect(container.querySelector("li em")?.textContent).toBe("italic");
    expect(container.querySelector("li code")?.textContent).toBe("inline");
    expect(container.querySelector("a")?.getAttribute("target")).toBe("_blank");
    expect(container.querySelector("a")?.getAttribute("rel")).toBe("noreferrer noopener");
    await act(async () => root.unmount());
  });

  it("does not render untrusted raw HTML", async () => {
    const root = createRoot(container);
    await act(async () => root.render(<MarkdownMessage
      content={'<img src="x" onerror="alert(1)"><script>alert(1)</script>safe'}
    />));

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("safe");
    await act(async () => root.unmount());
  });

  it("copies fenced code without the trailing newline", async () => {
    const root = createRoot(container);
    await act(async () => root.render(<MarkdownMessage content={'```ts\nconst answer = 42;\n```'} />));
    const button = container.querySelector<HTMLButtonElement>(".code-block button")!;

    await act(async () => button.click());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const answer = 42;");
    expect(button.textContent).toBe("已复制");
    await act(async () => root.unmount());
  });
});
