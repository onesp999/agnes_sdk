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

  it("renders GFM tables with Markdown inside cells", async () => {
    const root = createRoot(container);
    await act(async () => root.render(<MarkdownMessage content={[
      "| 类型 | 内容 |",
      "| --- | --- |",
      "| 强调 | **重要** |",
      "| 代码 | `npm test` |",
    ].join("\n")} />));

    expect(container.querySelector(".table-scroll > table")).not.toBeNull();
    expect(container.querySelector("thead th")?.textContent).toBe("类型");
    expect(container.querySelector("tbody strong")?.textContent).toBe("重要");
    expect(container.querySelector("tbody code")?.textContent).toBe("npm test");
    expect(container.textContent).not.toContain("| --- | --- |");
    await act(async () => root.unmount());
  });

  it("renders inline, display, and multiple math expressions", async () => {
    const root = createRoot(container);
    await act(async () => root.render(<MarkdownMessage content={[
      "不确定性关系为 $\\Delta x \\Delta p \\geq \\hbar/2$，这是量子力学中的重要关系。",
      "",
      "$$",
      "\\Delta x \\cdot \\Delta p \\geq \\frac{\\hbar}{2}",
      "$$",
      "",
      "另一个公式是 $E = mc^2$。",
    ].join("\n")} />));

    expect(container.textContent).toContain("不确定性关系为");
    expect(container.textContent).toContain("这是量子力学中的重要关系");
    expect(container.querySelectorAll(".katex")).toHaveLength(3);
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.textContent).not.toContain("$$");
    await act(async () => root.unmount());
  });

  it("distinguishes tall inline operators from a simple inline fraction", async () => {
    const root = createRoot(container);
    await act(async () => root.render(<MarkdownMessage content={[
      "比例为 $\\frac{a+b}{c+d}$。",
      "",
      "记忆连续性为 $C(t)=\\frac{\\int_{t_0}^{t}|M'(x)|dx}{\\int_{t_0}^{t_0+T}|M'(x)|dx}$。",
      "",
      "社会信任函数为 $T=\\frac{1}{N^2}\\sum_{i,j}\\frac{1}{1+e^{-\\lambda(A_{ij}^{new}-\\theta)}}$。",
    ].join("\n")} />));

    expect(container.querySelectorAll(":not(.katex-display) > .katex:has(.mfrac)")).toHaveLength(3);
    expect(container.querySelectorAll(":not(.katex-display) > .katex:has(.mop)")).toHaveLength(2);
    await act(async () => root.unmount());
  });

  it("keeps the message readable when one math expression is invalid", async () => {
    const root = createRoot(container);
    await act(async () => root.render(<MarkdownMessage content={
      "前文 $\\frac{$ 后文仍然可读。"
    } />));

    expect(container.textContent).toContain("前文");
    expect(container.textContent).toContain("后文仍然可读");
    expect(container.querySelector(".katex-error")).not.toBeNull();
    await act(async () => root.unmount());
  });
});
