export type ApiJson = Record<string, unknown>;

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: ApiJson;
}

export async function callBackend<T extends ApiJson>(
  backendBaseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(path, ensureTrailingSlash(backendBaseUrl));
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const data = (await response.json().catch(() => ({}))) as ApiJson;
  if (!response.ok) {
    throw new Error(extractErrorMessage(data) ?? `Request failed with status ${response.status}.`);
  }

  return data as T;
}

export function defaultBackendBaseUrl(): string {
  return import.meta.env.VITE_PLAYGROUND_API_BASE_URL ?? "http://localhost:3001";
}

export function validateVideoFrames(numFrames: number): string | undefined {
  if (!Number.isInteger(numFrames)) {
    return "num_frames must be an integer.";
  }
  if (numFrames > 441) {
    return "num_frames must be less than or equal to 441.";
  }
  if ((numFrames - 1) % 8 !== 0) {
    return "num_frames must satisfy 8n + 1.";
  }
  return undefined;
}

export function extractAssistantContent(data: ApiJson): string {
  const choices = data.choices;
  if (!Array.isArray(choices)) {
    return "";
  }
  const firstChoice = choices[0] as ApiJson | undefined;
  const message = firstChoice?.message as ApiJson | undefined;
  const content = message?.content;
  return typeof content === "string" ? content : "";
}

export function extractImagePreview(data: ApiJson): string | undefined {
  const items = data.data;
  if (!Array.isArray(items)) {
    return undefined;
  }
  const first = items[0] as ApiJson | undefined;
  const url = first?.url;
  const b64 = first?.b64_json;
  if (typeof url === "string" && url.length > 0) {
    return url;
  }
  if (typeof b64 === "string" && b64.length > 0) {
    return `data:image/png;base64,${b64}`;
  }
  return undefined;
}

export function extractVideoUrl(data: ApiJson): string | undefined {
  const videoUrl = data.video_url;
  if (typeof videoUrl === "string" && videoUrl.length > 0) {
    return videoUrl;
  }
  const remixedFromVideoId = data.remixed_from_video_id;
  if (typeof remixedFromVideoId === "string" && remixedFromVideoId.length > 0) {
    return remixedFromVideoId;
  }
  return undefined;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function extractErrorMessage(data: ApiJson): string | undefined {
  const error = data.error as ApiJson | undefined;
  if (typeof error?.message === "string") {
    return error.message;
  }
  const detail = data.detail as ApiJson | undefined;
  const detailError = detail?.error as ApiJson | undefined;
  if (typeof detailError?.message === "string") {
    return detailError.message;
  }
  if (typeof data.message === "string") {
    return data.message;
  }
  return undefined;
}
