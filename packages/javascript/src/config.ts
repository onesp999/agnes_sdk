import { DEFAULT_BASE_URL } from "./constants.js";
import { AgnesConfigurationError } from "./errors.js";

export type AgnesFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AgnesRequestOptions {
  signal?: AbortSignal;
}

export interface AgnesClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryBackoff?: number;
  defaultHeaders?: Record<string, string>;
  fetch?: AgnesFetch;
}

export interface ResolvedAgnesClientConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryBackoff: number;
  defaultHeaders: Record<string, string>;
  fetch: AgnesFetch;
}

export function resolveConfig(config: AgnesClientConfig = {}): ResolvedAgnesClientConfig {
  const apiKey = config.apiKey ?? process.env.AGNES_API_KEY;
  if (!apiKey) {
    throw new AgnesConfigurationError(
      "Missing Agnes API key. Set AGNES_API_KEY or pass apiKey.",
    );
  }

  const baseUrl = config.baseUrl ?? process.env.AGNES_BASE_URL ?? DEFAULT_BASE_URL;

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    timeout: config.timeout ?? 60_000,
    maxRetries: config.maxRetries ?? 2,
    retryBackoff: config.retryBackoff ?? 500,
    defaultHeaders: config.defaultHeaders ?? {},
    fetch: config.fetch ?? fetch,
  };
}
