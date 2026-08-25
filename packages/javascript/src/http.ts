import { RETRYABLE_STATUS_CODES } from "./constants.js";
import type { AgnesRequestOptions, ResolvedAgnesClientConfig } from "./config.js";
import {
  AgnesAPIAbortError,
  AgnesAPIAuthenticationError,
  AgnesAPIBadRequestError,
  AgnesAPIError,
  AgnesAPIRateLimitError,
  AgnesAPIServerError,
  AgnesAPITimeoutError,
} from "./errors.js";

export type JsonObject = Record<string, unknown>;

export interface RequestOptions extends AgnesRequestOptions {
  body?: JsonObject;
  params?: Record<string, string | number | boolean | undefined>;
}

export class AgnesHTTPClient {
  constructor(private readonly config: ResolvedAgnesClientConfig) {}

  async request(method: string, endpoint: string, options: RequestOptions = {}): Promise<JsonObject> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const lifecycle = createAbortLifecycle(options.signal, this.config.timeout);
      let shouldRetry = false;

      try {
        const response = await this.send(method, endpoint, options, lifecycle.signal);
        shouldRetry = RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.config.maxRetries;
        if (shouldRetry) {
          await cancelBody(response);
        } else {
          await raiseForStatus(response, endpoint, this.config.apiKey);
          return await parseJsonObject(response, endpoint);
        }
      } catch (error) {
        throw lifecycle.translate(error, endpoint);
      } finally {
        lifecycle.cleanup();
      }

      if (shouldRetry) {
        await sleep(this.config.retryBackoff * 2 ** attempt, options.signal, endpoint);
      }
    }

    throw new AgnesAPIError("Agnes API request failed without a response.", { endpoint });
  }

  async *stream(
    method: string,
    endpoint: string,
    options: RequestOptions = {},
  ): AsyncIterable<string> {
    const lifecycle = createAbortLifecycle(options.signal, this.config.timeout);
    try {
      const response = await this.send(method, endpoint, options, lifecycle.signal);
      await raiseForStatus(response, endpoint, this.config.apiKey);

      const body = response.body;
      if (!body) {
        return;
      }

      const decoder = new TextDecoder();
      for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        const text = decoder.decode(chunk, { stream: true });
        if (text) yield text;
      }
      const tail = decoder.decode();
      if (tail) yield tail;
    } catch (error) {
      throw lifecycle.translate(error, endpoint);
    } finally {
      lifecycle.cleanup();
    }
  }

  private send(
    method: string,
    endpoint: string,
    options: RequestOptions,
    signal: AbortSignal,
  ): Promise<Response> {
    return this.config.fetch(buildUrl(this.config.baseUrl, endpoint, options.params), {
      method,
      headers: this.headers(),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  }

  private headers(): Record<string, string> {
    return {
      ...this.config.defaultHeaders,
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}

async function raiseForStatus(
  response: Response,
  endpoint: string,
  apiKey?: string,
): Promise<void> {
  if (response.status < 400) {
    return;
  }

  const message = await safeErrorMessage(response, { apiKey });
  const options = {
    endpoint,
    requestId: response.headers.get("x-request-id") ?? undefined,
    statusCode: response.status,
  };

  if (response.status === 401) {
    throw new AgnesAPIAuthenticationError(message, options);
  }
  if (response.status === 400) {
    throw new AgnesAPIBadRequestError(message, options);
  }
  if (response.status === 429) {
    throw new AgnesAPIRateLimitError(message, options);
  }
  if (response.status >= 500) {
    throw new AgnesAPIServerError(message, options);
  }
  throw new AgnesAPIError(message, options);
}

async function parseJsonObject(response: Response, endpoint: string): Promise<JsonObject> {
  const data = (await response.json()) as unknown;
  if (isJsonObject(data)) {
    return data;
  }

  throw new AgnesAPIError("Agnes API returned an unexpected JSON response.", {
    endpoint,
    statusCode: response.status,
  });
}

async function safeErrorMessage(
  response: Response,
  options: { apiKey?: string } = {},
): Promise<string> {
  const fallback = `Agnes API request failed with status ${response.status}.`;
  let data: unknown;

  try {
    data = await response.clone().json();
  } catch {
    return fallback;
  }

  if (!isJsonObject(data)) {
    return fallback;
  }

  const error = data.error;
  if (isJsonObject(error) && typeof error.message === "string" && error.message.length > 0) {
    return redactSecret(error.message, options.apiKey);
  }

  if (typeof data.message === "string" && data.message.length > 0) {
    return redactSecret(data.message, options.apiKey);
  }

  return fallback;
}

function redactSecret(message: string, apiKey?: string): string {
  let redacted = apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message;
  redacted = redacted.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
  return redacted;
}

function buildUrl(
  baseUrl: string,
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(endpoint, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isJsonObject(data: unknown): data is JsonObject {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

interface AbortLifecycle {
  signal: AbortSignal;
  cleanup(): void;
  translate(error: unknown, endpoint: string): unknown;
}

function createAbortLifecycle(callerSignal: AbortSignal | undefined, timeout: number): AbortLifecycle {
  const controller = new AbortController();
  let abortKind: "caller" | "timeout" | undefined;

  const abort = (kind: "caller" | "timeout") => {
    if (abortKind) return;
    abortKind = kind;
    controller.abort();
  };
  const onCallerAbort = () => abort("caller");

  if (callerSignal?.aborted) {
    abort("caller");
  } else {
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timeoutId = setTimeout(() => abort("timeout"), timeout);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
    translate(error, endpoint) {
      if (error instanceof AgnesAPIAbortError || error instanceof AgnesAPITimeoutError) {
        return error;
      }
      if (abortKind === "caller") {
        return new AgnesAPIAbortError("Agnes API request was cancelled by the caller.", { endpoint });
      }
      if (abortKind === "timeout") {
        return new AgnesAPITimeoutError("Agnes API request timed out.", { endpoint });
      }
      return error;
    },
  };
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A retry is already replacing this response; cancellation is best effort.
  }
}

function sleep(ms: number, signal: AbortSignal | undefined, endpoint: string): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new AgnesAPIAbortError("Agnes API request was cancelled by the caller.", {
      endpoint,
    }));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new AgnesAPIAbortError("Agnes API request was cancelled by the caller.", { endpoint }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
