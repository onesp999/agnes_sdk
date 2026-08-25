export interface VideoPollingOptions {
  videoId: string;
  model?: string;
  signal: AbortSignal;
  onUpdate(payload: Record<string, unknown>): void;
  intervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function pollVideoTask(options: VideoPollingOptions): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const intervalMs = options.intervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  while (true) {
    if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const query = options.model ? `?model=${encodeURIComponent(options.model)}` : "";
    const response = await fetchImpl(`/api/videos/${encodeURIComponent(options.videoId)}${query}`, {
      signal: options.signal,
    });
    const payload = await response.json() as unknown;
    if (!response.ok) throw new Error(readError(payload, response.status));
    if (!isRecord(payload)) throw new Error("视频状态响应格式不正确。");
    options.onUpdate(payload);

    const status = readStatus(payload);
    if (status === "completed" || status === "failed") return payload;
    if (Date.now() - startedAt >= timeoutMs) throw new Error("视频生成等待超时，可稍后重试。");
    await abortableDelay(intervalMs, options.signal);
  }
}

export function isTerminalVideoStatus(status?: string): boolean {
  return status === "completed" || status === "failed";
}

function readStatus(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.status === "string") return payload.status.toLowerCase();
  if (isRecord(payload.data) && typeof payload.data.status === "string") {
    return payload.data.status.toLowerCase();
  }
  return undefined;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      globalThis.clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function readError(payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  return `视频状态查询失败（HTTP ${status}）。`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
