import { RETRYABLE_STATUS_CODES } from "./constants.js";
import type { ResolvedAgnesClientConfig } from "./config.js";
import {
  AgnesAPIAuthenticationError,
  AgnesAPIBadRequestError,
  AgnesAPIError,
  AgnesAPIRateLimitError,
  AgnesAPIServerError,
  AgnesAPITimeoutError,
} from "./errors.js";

export type JsonObject = Record<string, unknown>;

export interface RequestOptions {
  body?: JsonObject;
  params?: Record<string, string | number | boolean | undefined>;
}

export class AgnesHTTPClient {
  constructor(private readonly config: ResolvedAgnesClientConfig) {}

  async request(method: string, endpoint: string, options: RequestOptions = {}): Promise<JsonObject> {
    const response = await this.sendWithRetries(method, endpoint, options);
    await raiseForStatus(response, endpoint);
    return parseJsonObject(response, endpoint);
  }

  async *stream(
    method: string,
    endpoint: string,
    options: RequestOptions = {},
  ): AsyncIterable<string> {
    const response = await this.send(method, endpoint, options);
    await raiseForStatus(response, endpoint);

    const body = response.body;
    if (!body) {
      return;
    }

    const decoder = new TextDecoder();
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      yield decoder.decode(chunk, { stream: true });
    }
  }

  private async sendWithRetries(
    method: string,
    endpoint: string,
    options: RequestOptions,
  ): Promise<Response> {
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const response = await this.send(method, endpoint, options);
      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      lastResponse = response;
      if (attempt < this.config.maxRetries) {
        await sleep(this.config.retryBackoff * 2 ** attempt);
      }
    }

    return lastResponse!;
  }

  private async send(method: string, endpoint: string, options: RequestOptions): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      return await this.config.fetch(buildUrl(this.config.baseUrl, endpoint, options.params), {
        method,
        headers: this.headers(),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AgnesAPITimeoutError("Agnes API request timed out.", { endpoint });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private headers(): Record<string, string> {
    return {
      ...this.config.defaultHeaders,
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}

async function raiseForStatus(response: Response, endpoint: string): Promise<void> {
  if (response.status < 400) {
    return;
  }

  const message = await safeErrorMessage(response);
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

async function safeErrorMessage(response: Response): Promise<string> {
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
    return error.message;
  }

  if (typeof data.message === "string" && data.message.length > 0) {
    return data.message;
  }

  return fallback;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
