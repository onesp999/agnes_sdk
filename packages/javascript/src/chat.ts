import { CHAT_COMPLETIONS_ENDPOINT, CHAT_MODEL } from "./constants.js";
import type { AgnesRequestOptions } from "./config.js";
import { AgnesAPIError, AgnesAPIStreamProtocolError } from "./errors.js";
import type { JsonObject } from "./http.js";
import { AgnesHTTPClient } from "./http.js";

export interface ChatCreateOptions {
  messages: Array<Record<string, unknown>>;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  tools?: Array<Record<string, unknown>>;
  toolChoice?: string | Record<string, unknown>;
  chatTemplateKwargs?: Record<string, unknown>;
  thinking?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatStreamDeltaEvent {
  type: "delta";
  choiceIndex: number;
  delta: JsonObject;
  role?: string;
  content?: string;
  reasoningContent?: string;
}

export interface ChatStreamFinishEvent {
  type: "finish";
  choiceIndex: number;
  finishReason: string;
}

export interface ChatStreamUsageEvent {
  type: "usage";
  usage: JsonObject;
}

export interface ChatStreamDoneEvent {
  type: "done";
}

export type ChatStreamEvent =
  | ChatStreamDeltaEvent
  | ChatStreamFinishEvent
  | ChatStreamUsageEvent
  | ChatStreamDoneEvent;

export class ChatResource {
  constructor(private readonly http: AgnesHTTPClient) {}

  create(options: ChatCreateOptions, requestOptions: AgnesRequestOptions = {}): Promise<JsonObject> {
    return this.http.request("POST", CHAT_COMPLETIONS_ENDPOINT, {
      body: buildChatBody(options, false),
      signal: requestOptions.signal,
    });
  }

  stream(options: ChatCreateOptions, requestOptions: AgnesRequestOptions = {}): AsyncIterable<string> {
    return this.http.stream("POST", CHAT_COMPLETIONS_ENDPOINT, {
      body: buildChatBody(options, true),
      signal: requestOptions.signal,
    });
  }

  async *streamEvents(
    options: ChatCreateOptions,
    requestOptions: AgnesRequestOptions = {},
  ): AsyncIterable<ChatStreamEvent> {
    yield* parseChatStream(this.stream(options, requestOptions));
  }
}

async function* parseChatStream(chunks: AsyncIterable<string>): AsyncIterable<ChatStreamEvent> {
  let buffer = "";
  let sawDone = false;

  for await (const chunk of chunks) {
    buffer += chunk;
    while (true) {
      const boundary = findEventBoundary(buffer);
      if (!boundary) break;
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      for (const event of parseEventFrame(frame)) {
        if (sawDone) {
          throw protocolError("Agnes API stream returned data after the done marker.");
        }
        if (event.type === "done") sawDone = true;
        yield event;
      }
    }
  }

  if (buffer.trim()) {
    for (const event of parseEventFrame(buffer)) {
      if (sawDone) {
        throw protocolError("Agnes API stream returned data after the done marker.");
      }
      if (event.type === "done") sawDone = true;
      yield event;
    }
  }
  if (!sawDone) {
    throw protocolError("Agnes API stream ended without a done marker.");
  }
}

function findEventBoundary(buffer: string): { index: number; length: number } | undefined {
  const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : undefined;
}

function* parseEventFrame(frame: string): Iterable<ChatStreamEvent> {
  const dataLines = frame
    .split(/\r\n|\r|\n/)
    .filter((line) => line === "data" || line.startsWith("data:"))
    .map((line) => line === "data" ? "" : line.slice(5).replace(/^ /, ""));
  if (dataLines.length === 0) return;

  const payload = dataLines.join("\n");
  if (payload.trim() === "[DONE]") {
    yield { type: "done" };
    return;
  }

  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    throw protocolError("Agnes API stream returned invalid JSON.");
  }
  if (!isJsonObject(data)) {
    throw protocolError("Agnes API stream returned a non-object event.");
  }
  if (data.error !== undefined) {
    throw new AgnesAPIError("Agnes API stream returned an error event.", {
      endpoint: CHAT_COMPLETIONS_ENDPOINT,
    });
  }

  if (data.choices !== undefined && !Array.isArray(data.choices)) {
    throw protocolError("Agnes API stream returned invalid choices.");
  }
  for (const choice of data.choices ?? []) {
    if (!isJsonObject(choice) || typeof choice.index !== "number") {
      throw protocolError("Agnes API stream returned an invalid choice.");
    }
    if (choice.delta !== undefined) {
      if (!isJsonObject(choice.delta)) {
        throw protocolError("Agnes API stream returned an invalid delta.");
      }
      if (Object.keys(choice.delta).length > 0) {
        const role = optionalString(choice.delta, "role");
        const content = optionalString(choice.delta, "content");
        const reasoningContent = optionalString(choice.delta, "reasoning_content");
        yield dropUndefined({
          type: "delta",
          choiceIndex: choice.index,
          delta: choice.delta,
          role,
          content,
          reasoningContent,
        }) as unknown as ChatStreamDeltaEvent;
      }
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      if (typeof choice.finish_reason !== "string") {
        throw protocolError("Agnes API stream returned an invalid finish reason.");
      }
      yield {
        type: "finish",
        choiceIndex: choice.index,
        finishReason: choice.finish_reason,
      };
    }
  }

  if (data.usage !== undefined) {
    if (!isJsonObject(data.usage)) {
      throw protocolError("Agnes API stream returned invalid usage data.");
    }
    yield { type: "usage", usage: data.usage };
  }
}

function optionalString(data: JsonObject, key: string): string | undefined {
  const value = data[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw protocolError(`Agnes API stream returned an invalid ${key} field.`);
  }
  return value;
}

function protocolError(message: string): AgnesAPIStreamProtocolError {
  return new AgnesAPIStreamProtocolError(message, { endpoint: CHAT_COMPLETIONS_ENDPOINT });
}

function isJsonObject(data: unknown): data is JsonObject {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function buildChatBody(options: ChatCreateOptions, stream: boolean): JsonObject {
  const {
    messages,
    model = CHAT_MODEL,
    temperature,
    topP,
    maxTokens,
    tools,
    toolChoice,
    chatTemplateKwargs,
    thinking,
    signal: _signal,
    stream: _stream,
    ...extra
  } = options;

  return dropUndefined({
    model,
    messages,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stream: stream ? true : undefined,
    tools,
    tool_choice: toolChoice,
    chat_template_kwargs: chatTemplateKwargs,
    thinking,
    ...extra,
  });
}

function dropUndefined(data: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
