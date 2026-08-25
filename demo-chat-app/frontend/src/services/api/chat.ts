export interface ChatStreamRequest {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  parameters?: Record<string, unknown>;
}

export type BrowserChatStreamEvent =
  | {
      type: "delta";
      choiceIndex: number;
      content?: string;
      reasoningContent?: string;
      role?: string;
    }
  | { type: "finish"; choiceIndex: number; finishReason: string }
  | { type: "usage"; usage: Record<string, unknown> }
  | { type: "done" };

export class ChatStreamError extends Error {
  constructor(message: string, readonly serverType?: string) {
    super(message);
    this.name = "ChatStreamError";
  }
}

export async function streamChat(
  request: ChatStreamRequest,
  options: {
    signal: AbortSignal;
    onEvent(event: BrowserChatStreamEvent): void;
    fetchImpl?: typeof fetch;
  },
): Promise<void> {
  const response = await (options.fetchImpl ?? fetch)("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new ChatStreamError(await readHttpError(response));
  }
  if (!response.body) {
    throw new ChatStreamError("后端未返回可读取的消息流。");
  }

  let sawDone = false;
  for await (const event of parseNdjsonStream(response.body)) {
    if (event.type === "error") {
      throw new ChatStreamError(event.error.message, event.error.type);
    }
    if (event.type === "done") sawDone = true;
    options.onEvent(event);
  }
  if (!sawDone) throw new ChatStreamError("消息流在完成前意外中断。");
}

export async function* parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<BrowserChatStreamEvent | {
  type: "error";
  error: { type?: string; message: string };
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.trim()) yield parseEvent(line);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield parseEvent(buffer.replace(/\r$/, ""));
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(line: string): BrowserChatStreamEvent | {
  type: "error";
  error: { type?: string; message: string };
} {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new ChatStreamError("后端返回了无法解析的消息流事件。");
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new ChatStreamError("后端返回了格式不正确的消息流事件。");
  }
  if (value.type === "done") return { type: "done" };
  if (value.type === "delta" && typeof value.choiceIndex === "number") {
    return {
      type: "delta",
      choiceIndex: value.choiceIndex,
      ...optionalStringFields(value, ["content", "reasoningContent", "role"]),
    };
  }
  if (value.type === "finish"
    && typeof value.choiceIndex === "number"
    && typeof value.finishReason === "string") {
    return { type: "finish", choiceIndex: value.choiceIndex, finishReason: value.finishReason };
  }
  if (value.type === "usage" && isRecord(value.usage)) {
    return { type: "usage", usage: value.usage };
  }
  if (value.type === "error" && isRecord(value.error) && typeof value.error.message === "string") {
    return {
      type: "error",
      error: {
        message: value.error.message,
        ...(typeof value.error.type === "string" ? { type: value.error.type } : {}),
      },
    };
  }
  throw new ChatStreamError("后端返回了不受支持的消息流事件。");
}

async function readHttpError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as unknown;
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message;
    }
  } catch {
    // Use the safe status fallback.
  }
  return `请求失败（HTTP ${response.status}）。`;
}

function optionalStringFields(
  value: Record<string, unknown>,
  keys: string[],
): Record<string, string> {
  return Object.fromEntries(keys.flatMap((key) => typeof value[key] === "string" ? [[key, value[key]]] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
