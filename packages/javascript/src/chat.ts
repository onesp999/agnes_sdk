import { CHAT_COMPLETIONS_ENDPOINT, CHAT_MODEL } from "./constants.js";
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

export class ChatResource {
  constructor(private readonly http: AgnesHTTPClient) {}

  create(options: ChatCreateOptions): Promise<JsonObject> {
    return this.http.request("POST", CHAT_COMPLETIONS_ENDPOINT, {
      body: buildChatBody(options, false),
    });
  }

  stream(options: ChatCreateOptions): AsyncIterable<string> {
    return this.http.stream("POST", CHAT_COMPLETIONS_ENDPOINT, {
      body: buildChatBody(options, true),
    });
  }
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
