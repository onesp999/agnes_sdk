import {
  AgnesAPIError,
  AgnesClient,
  type AgnesRequestOptions,
  type ChatStreamEvent,
} from "@agnes-ai/sdk";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };
type RequestParameters = Record<string, unknown>;
type ChatCreatePayload = RequestParameters & { messages: ChatMessage[] };
type MediaCreatePayload = RequestParameters & { prompt: string };

export interface AgnesDemoClient {
  chat: {
    create(payload: ChatCreatePayload): Promise<Record<string, unknown>>;
    streamEvents(
      payload: ChatCreatePayload,
      options?: AgnesRequestOptions,
    ): AsyncIterable<ChatStreamEvent>;
  };
  images: {
    generate(payload: MediaCreatePayload): Promise<Record<string, unknown>>;
  };
  videos: {
    create(payload: MediaCreatePayload): Promise<Record<string, unknown>>;
    retrieve(videoId: string, options?: { modelName?: string }): Promise<Record<string, unknown>>;
  };
}

export interface AppOptions {
  clientFactory?: () => AgnesDemoClient;
  staticDir?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const clientFactory = options.clientFactory ?? createAgnesClient;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", mode: process.env.AGNES_API_KEY ? "agnes" : "demo" });
  });

  app.post("/api/chat", async (request, response, next) => {
    try {
      const messages = validateMessages(request.body?.messages);
      const parameters = validateParameters(request.body?.parameters, "chat");
      if (!process.env.AGNES_API_KEY && !options.clientFactory) {
        response.json(mockCompletion(messages, parameters));
        return;
      }
      response.json(await clientFactory().chat.create({ ...parameters, messages }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat/stream", async (request, response, next) => {
    const controller = new AbortController();
    let completed = false;
    const onDisconnect = () => {
      if (!completed) controller.abort();
    };
    request.once("aborted", onDisconnect);
    response.once("close", onDisconnect);

    try {
      const messages = validateMessages(request.body?.messages);
      const parameters = validateParameters(request.body?.parameters, "chat");
      const events = !process.env.AGNES_API_KEY && !options.clientFactory
        ? mockChatStream(messages, parameters, controller.signal)
        : clientFactory().chat.streamEvents(
          { ...parameters, messages },
          { signal: controller.signal },
        );

      response.status(200);
      response.set({
        "Cache-Control": "no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
      });
      response.flushHeaders();

      for await (const event of events) {
        if (controller.signal.aborted) return;
        writeNdjson(response, browserStreamEvent(event));
      }
      completed = true;
      response.end();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!response.headersSent) {
        next(error);
        return;
      }
      writeNdjson(response, {
        type: "error",
        error: {
          type: error instanceof Error ? error.name : "Error",
          message: safeMessage(error),
        },
      });
      completed = true;
      response.end();
    } finally {
      request.removeListener("aborted", onDisconnect);
      response.removeListener("close", onDisconnect);
    }
  });

  app.post("/api/images", async (request, response, next) => {
    try {
      const prompt = validatePrompt(request.body?.prompt);
      const parameters = validateParameters(request.body?.parameters, "image");
      if (!process.env.AGNES_API_KEY && !options.clientFactory) {
        response.json(mockImage(parameters));
        return;
      }
      response.json(await clientFactory().images.generate({ ...parameters, prompt }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/videos", async (request, response, next) => {
    try {
      const prompt = validatePrompt(request.body?.prompt);
      const parameters = validateParameters(request.body?.parameters, "video");
      if (!process.env.AGNES_API_KEY && !options.clientFactory) {
        response.json(mockVideoCreation(parameters));
        return;
      }
      response.json(await clientFactory().videos.create({ ...parameters, prompt }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/videos/:videoId", async (request, response, next) => {
    try {
      const videoId = validateVideoId(request.params.videoId);
      const modelName = validateOptionalModel(request.query.model);
      if (!process.env.AGNES_API_KEY && !options.clientFactory) {
        response.json(mockVideoStatus(videoId, modelName));
        return;
      }
      response.json(await clientFactory().videos.retrieve(videoId, modelName ? { modelName } : {}));
    } catch (error) {
      next(error);
    }
  });

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api/")) return next();
      response.sendFile(path.join(options.staticDir!, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

function createAgnesClient(): AgnesDemoClient {
  return new AgnesClient({
    apiKey: process.env.AGNES_API_KEY,
    baseUrl: process.env.AGNES_BASE_URL,
  });
}

function validatePrompt(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 8000) {
    throw new RequestValidationError("prompt 必须是 1 到 8000 个字符的字符串。");
  }
  return value.trim();
}

function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new RequestValidationError("messages 必须包含 1 到 50 条消息。");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") throw new RequestValidationError("消息格式不正确。");
    const { role, content } = item as Record<string, unknown>;
    if (role !== "user" && role !== "assistant" && role !== "system") {
      throw new RequestValidationError("消息角色不受支持。");
    }
    if (typeof content !== "string" || !content.trim() || content.length > 8000) {
      throw new RequestValidationError("消息内容必须是 1 到 8000 个字符。");
    }
    return { role, content: content.trim() };
  });
}

function validateParameters(value: unknown, kind: "chat" | "image" | "video"): RequestParameters {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    throw new RequestValidationError("parameters 必须是 JSON 对象。");
  }

  if (Object.keys(value).length > 50) {
    throw new RequestValidationError("parameters 最多包含 50 个字段。");
  }
  const reservedField = kind === "chat" ? "messages" : "prompt";
  if (reservedField in value) {
    throw new RequestValidationError(`parameters 不能覆盖 ${reservedField}。`);
  }
  if ("stream" in value) {
    throw new RequestValidationError("当前接口不支持通过 parameters 设置 stream。");
  }

  const parameters = { ...value };
  if (parameters.model !== undefined) {
    if (typeof parameters.model !== "string" || !parameters.model.trim() || parameters.model.length > 200) {
      throw new RequestValidationError("model 必须是 1 到 200 个字符的字符串。");
    }
    parameters.model = parameters.model.trim();
  }
  if (kind === "chat") {
    validateOptionalNumber(parameters, "temperature", 0, 2);
    validateOptionalNumber(parameters, "topP", 0, 1);
    if (parameters.maxTokens !== undefined && (
      typeof parameters.maxTokens !== "number"
      || !Number.isInteger(parameters.maxTokens)
      || parameters.maxTokens < 1
      || parameters.maxTokens > 1_000_000
    )) {
      throw new RequestValidationError("maxTokens 必须是 1 到 1000000 之间的整数。");
    }
    if (parameters.tools !== undefined && !Array.isArray(parameters.tools)) {
      throw new RequestValidationError("tools 必须是数组。");
    }
    if (parameters.toolChoice !== undefined
      && typeof parameters.toolChoice !== "string"
      && !isPlainObject(parameters.toolChoice)) {
      throw new RequestValidationError("toolChoice 必须是字符串或 JSON 对象。");
    }
    for (const key of ["chatTemplateKwargs", "thinking"]) {
      if (parameters[key] !== undefined && !isPlainObject(parameters[key])) {
        throw new RequestValidationError(`${key} 必须是 JSON 对象。`);
      }
    }
  }
  return parameters;
}

function validateOptionalNumber(parameters: RequestParameters, key: string, minimum: number, maximum: number) {
  const value = parameters[key];
  if (value !== undefined && (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  )) {
    throw new RequestValidationError(`${key} 必须是 ${minimum} 到 ${maximum} 之间的数字。`);
  }
}

function validateVideoId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    throw new RequestValidationError("videoId 格式不正确。");
  }
  return value.trim();
}

function validateOptionalModel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new RequestValidationError("model 格式不正确。");
  }
  return value.trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mockCompletion(messages: ChatMessage[], parameters: RequestParameters) {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return {
    id: `demo-${Date.now()}`,
    model: typeof parameters.model === "string" ? `${parameters.model}-demo` : "agnes-2.0-flash-demo",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: `这是 Agnes AI 的本地演示回复。你刚才问的是：“${latest}”\n\n在 backend/.env 中配置 AGNES_API_KEY 后，后端会改为调用真实 Agnes SDK。`,
      },
      finish_reason: "stop",
    }],
  };
}

async function* mockChatStream(
  messages: ChatMessage[],
  parameters: RequestParameters,
  signal: AbortSignal,
): AsyncIterable<ChatStreamEvent> {
  const completion = mockCompletion(messages, parameters);
  const content = String(((completion.choices[0] as { message: { content: string } }).message.content));
  const chunks = content.match(/.{1,18}/gs) ?? [content];
  for (const chunk of chunks) {
    if (signal.aborted) return;
    yield { type: "delta", choiceIndex: 0, delta: { content: chunk }, content: chunk };
    await delay(15);
  }
  yield { type: "finish", choiceIndex: 0, finishReason: "stop" };
  yield { type: "done" };
}

function browserStreamEvent(event: ChatStreamEvent): Record<string, unknown> {
  switch (event.type) {
    case "delta":
      return {
        type: event.type,
        choiceIndex: event.choiceIndex,
        ...(event.role ? { role: event.role } : {}),
        ...(event.content !== undefined ? { content: event.content } : {}),
        ...(event.reasoningContent !== undefined ? { reasoningContent: event.reasoningContent } : {}),
      };
    case "finish":
      return {
        type: event.type,
        choiceIndex: event.choiceIndex,
        finishReason: event.finishReason,
      };
    case "usage":
      return { type: event.type, usage: event.usage };
    case "done":
      return { type: event.type };
  }
}

function writeNdjson(response: Response, event: Record<string, unknown>) {
  response.write(`${JSON.stringify(event)}\n`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function mockImage(parameters: RequestParameters) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="100%" height="100%" fill="#ece9ff"/><text x="50%" y="50%" text-anchor="middle" fill="#5540cb" font-family="sans-serif" font-size="42">Agnes image demo</text></svg>`;
  return {
    model: parameters.model ?? "agnes-image-2.1-flash-demo",
    data: [{ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }],
  };
}

function mockVideoCreation(parameters: RequestParameters) {
  return {
    video_id: `demo-video-${Date.now()}`,
    model: parameters.model ?? "agnes-video-v2.0-demo",
    status: "queued",
  };
}

function mockVideoStatus(videoId: string, modelName?: string) {
  return {
    video_id: videoId,
    model: modelName ?? "agnes-video-v2.0-demo",
    status: "completed",
    message: "本地演示模式不会生成真实视频。",
  };
}

function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  const status = error instanceof RequestValidationError || error instanceof RangeError
    ? 400
    : error instanceof AgnesAPIError && error.statusCode
      ? error.statusCode
      : 500;
  response.status(status).json({
    error: {
      type: error instanceof Error ? error.name : "Error",
      message: safeMessage(error),
    },
  });
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "服务暂时不可用。";
  const key = process.env.AGNES_API_KEY;
  return key ? message.replaceAll(key, "[redacted]") : message;
}

class RequestValidationError extends Error {
  name = "RequestValidationError";
}
