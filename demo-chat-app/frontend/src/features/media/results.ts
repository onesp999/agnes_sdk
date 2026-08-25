import type { Message } from "../../types/conversation.js";

export function readImageResult(
  payload: Record<string, unknown>,
): Pick<Message, "content"> & Partial<Pick<Message, "media">> {
  const url = readImageUrl(payload);
  return url
    ? { content: "图片生成完成。", media: { kind: "image", url } }
    : { content: `图片请求已完成，但返回中没有可预览的图片。\n${JSON.stringify(payload, null, 2)}` };
}

export function readImageUrl(payload: Record<string, unknown>): string | undefined {
  const items = Array.isArray(payload.data) ? payload.data : [];
  const first = isRecord(items[0]) ? items[0] : undefined;
  if (typeof first?.url === "string" && first.url) return first.url;
  if (typeof first?.b64_json === "string" && first.b64_json) return `data:image/png;base64,${first.b64_json}`;
  return undefined;
}

export function readVideoResult(
  payload: Record<string, unknown>,
  model: string,
): Pick<Message, "content"> & Partial<Pick<Message, "media" | "videoId" | "videoModel" | "videoStatus">> {
  const nested = isRecord(payload.data) ? payload.data : undefined;
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const nestedMetadata = nested && isRecord(nested.metadata) ? nested.metadata : undefined;
  const videoUrl = readString(payload, "video_url", "remixed_from_video_id", "url")
    ?? readString(metadata ?? {}, "url", "video_url")
    ?? (nested ? readString(nested, "video_url", "remixed_from_video_id", "url") : undefined)
    ?? readString(nestedMetadata ?? {}, "url", "video_url");
  const videoId = readString(payload, "video_id", "task_id", "id")
    ?? (nested ? readString(nested, "video_id", "task_id", "id") : undefined);
  const status = (readString(payload, "status") ?? (nested ? readString(nested, "status") : undefined) ?? "queued").toLowerCase();
  const progress = readNumberOrString(payload, "progress") ?? (nested ? readNumberOrString(nested, "progress") : undefined);
  const detail = readString(payload, "message")
    ?? (nested ? readString(nested, "message") : undefined)
    ?? readErrorDetail(payload.error)
    ?? (nested ? readErrorDetail(nested.error) : undefined);
  const completedWithoutUrl = status === "completed" && !videoUrl;
  const title = status === "failed"
    ? "视频生成失败。"
    : videoUrl
      ? "视频生成完成。"
      : completedWithoutUrl
        ? "视频任务已完成，但响应中没有可播放的视频地址。"
        : status === "in_progress"
          ? "视频正在生成。"
          : "视频任务已创建。";
  const content = [
    title,
    videoId ? `任务 ID：${videoId}` : "",
    `状态：${status}`,
    progress !== undefined ? `进度：${progress}%` : "",
    detail ?? "",
    completedWithoutUrl ? describeVideoResponse(payload, metadata ?? nestedMetadata) : "",
  ].filter(Boolean).join("\n");
  return {
    content,
    ...(videoUrl ? { media: { kind: "video" as const, url: videoUrl } } : {}),
    ...(videoId ? { videoId } : {}),
    videoModel: model,
    videoStatus: status,
  };
}

export function videoMessageStatus(status?: string): Message["status"] {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "streaming";
}

function readString(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof payload[key] === "string" && payload[key]) return payload[key] as string;
  }
  return undefined;
}

function readNumberOrString(payload: Record<string, unknown>, key: string): number | string | undefined {
  const value = payload[key];
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

function readErrorDetail(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  return isRecord(value) ? readString(value, "message", "detail") : undefined;
}

function describeVideoResponse(payload: Record<string, unknown>, metadata?: Record<string, unknown>): string {
  const topLevelFields = Object.keys(payload).sort().join(", ") || "无";
  const metadataFields = metadata ? Object.keys(metadata).sort().join(", ") || "无" : "无 metadata";
  return `诊断：未找到 metadata.url；响应字段：${topLevelFields}；metadata 字段：${metadataFields}。`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
