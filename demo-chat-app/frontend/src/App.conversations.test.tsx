// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("conversation UI persistence", () => {
  let roots: Root[] = [];
  let chatResponse: (init?: RequestInit) => Response;
  let imageResponse: (init?: RequestInit) => Response;
  let videoCreateResponse: (init?: RequestInit) => Response;
  let videoStatusResponse: (init?: RequestInit) => Response;

  beforeEach(() => {
    roots = [];
    vi.stubGlobal("indexedDB", new IDBFactory());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
    chatResponse = () => new Response([
      '{"type":"delta","choiceIndex":0,"content":"Persisted answer"}',
      '{"type":"finish","choiceIndex":0,"finishReason":"stop"}',
      '{"type":"done"}',
      "",
    ].join("\n"), {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    });
    imageResponse = () => jsonResponse({ data: [{ url: "data:image/png;base64,ZmFrZQ==" }] });
    videoCreateResponse = () => jsonResponse({ video_id: "video-1", status: "queued" });
    videoStatusResponse = () => jsonResponse({
      video_id: "video-1",
      status: "completed",
      metadata: { url: "https://cdn.example/video.mp4" },
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/health") {
        return jsonResponse({ status: "ok", mode: "demo" });
      }
      if (String(input) === "/api/images") return imageResponse(init);
      if (String(input) === "/api/videos") return videoCreateResponse(init);
      if (String(input).startsWith("/api/videos/")) return videoStatusResponse(init);
      return chatResponse(init);
    }));
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
  });

  afterEach(async () => {
    for (const root of roots) {
      await act(async () => root.unmount());
    }
    vi.unstubAllGlobals();
  });

  it("restores the selected conversation and messages after remount", async () => {
    const first = await renderApp();
    await waitFor(() => !first.querySelector<HTMLButtonElement>(".new-chat")?.disabled);
    const textarea = first.querySelector<HTMLTextAreaElement>(".composer textarea")!;

    await act(async () => {
      setTextareaValue(textarea, "Persistent hello");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      first.querySelector<HTMLFormElement>(".composer")!.dispatchEvent(new Event("submit", {
        bubbles: true,
        cancelable: true,
      }));
    });
    await waitFor(() => first.textContent?.includes("Persisted answer") === true);
    expect(first.textContent).toContain("Persistent hello");
    const assistantCopy = [...first.querySelectorAll<HTMLButtonElement>(".assistant .message-actions button")]
      .find((button) => button.textContent === "复制")!;
    await act(async () => assistantCopy.click());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Persisted answer");

    const firstRoot = roots.shift()!;
    await act(async () => firstRoot.unmount());
    const second = await renderApp();
    await waitFor(() => second.textContent?.includes("Persisted answer") === true);

    expect(second.textContent).toContain("Persistent hello");
    expect(second.querySelector(".conversation-row.active")?.textContent).toContain("Persistent hello");
  });

  it("switches Chat, Image, and Video capabilities from the composer", async () => {
    const container = await renderApp();
    await waitFor(() => !container.querySelector<HTMLButtonElement>(".new-chat")?.disabled);

    const imageMode = findButton(container, "Image");
    await act(async () => imageMode.click());
    expect(imageMode.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLTextAreaElement>(".composer textarea")?.placeholder).toBe("描述你想生成的图片");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="模型"]')?.value).toBe("agnes-image-2.0-flash");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="图片尺寸"]')).not.toBeNull();

    const videoMode = findButton(container, "Video");
    await act(async () => videoMode.click());
    expect(videoMode.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLTextAreaElement>(".composer textarea")?.placeholder).toBe("描述你想生成的视频");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="画面比例"]')).not.toBeNull();
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="视频时长"]')).not.toBeNull();

    await act(async () => findButton(container, "Chat").click());
  });

  it("opens the settings drawer, validates Developer JSON, and closes with Escape", async () => {
    const container = await renderApp();
    await waitFor(() => !container.querySelector<HTMLButtonElement>(".new-chat")?.disabled);

    await act(async () => container.querySelector<HTMLButtonElement>('.settings-trigger')!.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    const advanced = container.querySelector<HTMLTextAreaElement>('[aria-label="高级 JSON 参数"]')!;
    await act(async () => {
      setTextareaValue(advanced, "{");
      advanced.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("不是有效的 JSON");
    await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("stops an active generation and prevents duplicate submit", async () => {
    chatResponse = (init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          '{"type":"delta","choiceIndex":0,"content":"Partial answer"}\n',
        ));
        init?.signal?.addEventListener("abort", () => {
          controller.error(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      },
    }), { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
    const container = await renderApp();
    await waitFor(() => !container.querySelector<HTMLButtonElement>(".new-chat")?.disabled);
    const textarea = container.querySelector<HTMLTextAreaElement>(".composer textarea")!;

    await act(async () => {
      setTextareaValue(textarea, "Stop test");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      const form = container.querySelector<HTMLFormElement>(".composer")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => container.textContent?.includes("Partial answer") === true);
    const stopButton = container.querySelector<HTMLButtonElement>('button[aria-label="停止生成"]')!;
    await act(async () => stopButton.click());
    await waitFor(() => container.textContent?.includes("重试") === true);

    expect(container.textContent).toContain("Partial answer");
    const streamCalls = vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === "/api/chat/stream");
    expect(streamCalls).toHaveLength(1);
  });

  it("retries a failed turn without duplicating the user message", async () => {
    let attempt = 0;
    chatResponse = () => {
      attempt += 1;
      return new Response(attempt === 1
        ? '{"type":"error","error":{"type":"AgnesAPIError","message":"Temporary failure"}}\n'
        : '{"type":"delta","choiceIndex":0,"content":"Recovered answer"}\n{"type":"done"}\n',
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
    };
    const container = await renderApp();
    await waitFor(() => !container.querySelector<HTMLButtonElement>(".new-chat")?.disabled);
    await submitText(container, "Retry question");
    await waitFor(() => container.textContent?.includes("Temporary failure") === true);
    const retry = findButton(container, "重试");

    await act(async () => retry.click());
    await waitFor(() => container.textContent?.includes("Recovered answer") === true);

    expect(container.querySelectorAll(".thread article.user")).toHaveLength(1);
    expect(container.querySelectorAll(".thread article.assistant")).toHaveLength(1);
    const requests = streamRequestBodies();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.messages).toEqual([{ role: "user", content: "Retry question" }]);
    expect(requests[1]?.messages).toEqual([{ role: "user", content: "Retry question" }]);
  });

  it("regenerates and edit-resends by replacing the existing branch", async () => {
    const responses = ["First answer", "Regenerated answer", "Edited answer"];
    chatResponse = () => new Response(
      `{"type":"delta","choiceIndex":0,"content":${JSON.stringify(responses.shift())}}\n{"type":"done"}\n`,
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
    );
    const container = await renderApp();
    await waitFor(() => !container.querySelector<HTMLButtonElement>(".new-chat")?.disabled);
    await submitText(container, "Original question");
    await waitFor(() => container.textContent?.includes("First answer") === true);

    await act(async () => findButton(container, "重新生成").click());
    await waitFor(() => container.textContent?.includes("Regenerated answer") === true);
    expect(container.textContent).not.toContain("First answer");

    vi.spyOn(window, "prompt").mockReturnValue("Edited question");
    await act(async () => findButton(container, "编辑并重发").click());
    await waitFor(() => container.textContent?.includes("Edited answer") === true);

    expect(container.textContent).not.toContain("Original question");
    expect(container.textContent).not.toContain("Regenerated answer");
    expect(container.querySelectorAll(".thread article.user")).toHaveLength(1);
    expect(container.querySelectorAll(".thread article.assistant")).toHaveLength(1);
    expect(streamRequestBodies().at(-1)?.messages).toEqual([{ role: "user", content: "Edited question" }]);
  });

  it("retries an image failure and exposes reuse and download actions", async () => {
    let attempt = 0;
    imageResponse = () => {
      attempt += 1;
      return attempt === 1
        ? new Response(JSON.stringify({ error: { message: "Image unavailable" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
        : jsonResponse({ data: [{ b64_json: "ZmFrZQ==" }] });
    };
    const container = await renderApp();
    await waitFor(() => !container.querySelector<HTMLButtonElement>(".new-chat")?.disabled);
    await act(async () => container.querySelector<HTMLButtonElement>(".model")!.click());
    const modelSelect = container.querySelector<HTMLSelectElement>(".settings-panel select")!;
    await act(async () => {
      setSelectValue(modelSelect, "agnes-image-2.1-flash");
      modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await submitText(container, "A glass cube");
    await waitFor(() => container.textContent?.includes("Image unavailable") === true);

    await act(async () => findButton(container, "重试图片").click());
    await waitFor(() => container.querySelector(".generated-media") !== null);

    expect(container.querySelector<HTMLImageElement>(".generated-media")?.src).toContain(
      "data:image/png;base64,ZmFrZQ==",
    );
    expect(container.querySelector<HTMLAnchorElement>(".download-media")?.download).toBe("agnes-image.png");
    await act(async () => findButton(container, "复用提示词").click());
    expect(container.querySelector<HTMLTextAreaElement>(".composer textarea")?.value).toBe("A glass cube");
    expect(container.querySelectorAll(".thread article.user")).toHaveLength(1);
    expect(container.querySelectorAll(".thread article.assistant")).toHaveLength(1);
    const imageCalls = vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === "/api/images");
    expect(imageCalls).toHaveLength(2);
    expect(JSON.parse(String(imageCalls[0]?.[1]?.body))).toMatchObject({
      prompt: "A glass cube",
      parameters: { model: "agnes-image-2.1-flash", size: "1024x1024", responseFormat: "url" },
    });
  });

  it("recovers and completes video polling after remount", async () => {
    videoStatusResponse = () => jsonResponse({ video_id: "video-1", status: "queued" });
    const first = await renderApp();
    await waitFor(() => !first.querySelector<HTMLButtonElement>(".new-chat")?.disabled);
    await act(async () => first.querySelector<HTMLButtonElement>(".model")!.click());
    const modelSelect = first.querySelector<HTMLSelectElement>(".settings-panel select")!;
    await act(async () => {
      setSelectValue(modelSelect, "agnes-video-v2.0");
      modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await submitText(first, "A short wave");
    await waitFor(() => vi.mocked(fetch).mock.calls.some(([input]) => String(input).startsWith("/api/videos/video-1")));
    expect(first.textContent).toContain("状态：queued");

    const firstRoot = roots.shift()!;
    await act(async () => firstRoot.unmount());
    videoStatusResponse = () => jsonResponse({
      video_id: "video-1",
      status: "completed",
      metadata: { url: "https://cdn.example/video.mp4" },
    });
    const second = await renderApp();
    await waitFor(() => second.querySelector<HTMLVideoElement>(".generated-media") !== null);

    expect(second.querySelector<HTMLVideoElement>(".generated-media")?.src).toBe("https://cdn.example/video.mp4");
    expect(second.textContent).not.toContain("刷新视频状态");
    expect(second.textContent).toContain("视频生成完成");
  });

  async function renderApp(): Promise<HTMLDivElement> {
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => root.render(<App />));
    return container;
  }
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(textarea, value);
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  setter.call(select, value);
}

async function submitText(container: HTMLElement, value: string): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>(".composer textarea")!;
  await act(async () => {
    setTextareaValue(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container.querySelector<HTMLFormElement>(".composer")!.dispatchEvent(new Event("submit", {
      bubbles: true,
      cancelable: true,
    }));
  });
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function streamRequestBodies(): Array<{ messages?: unknown }> {
  return vi.mocked(fetch).mock.calls
    .filter(([input]) => String(input) === "/api/chat/stream")
    .map(([, init]) => JSON.parse(String(init?.body)) as { messages?: unknown });
}

async function waitFor(assertion: () => boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    let passed = false;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      passed = assertion();
    });
    if (passed) return;
  }
  throw new Error("Timed out waiting for UI state.");
}
