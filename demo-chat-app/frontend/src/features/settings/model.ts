import type { RequestSettings } from "../../types/settings.js";

export type ModelKind = "chat" | "image" | "video";

export const modelPresetGroups = [
  {
    label: "文本",
    models: ["agnes-2.0-flash", "agnes-2.5-flash", "agnes-2.5-pro-alpha", "agnes-2.5-pro"],
  },
  {
    label: "图像",
    models: ["agnes-image-2.0-flash", "agnes-image-2.1-flash"],
  },
  {
    label: "视频",
    models: ["agnes-video-v2.0", "agnes-video-2.5", "agnes-video-2.5-flash"],
  },
] as const;

export const modelPresets = modelPresetGroups.flatMap((group) => group.models);

export function getModelKind(model: string): ModelKind {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith("agnes-image-")) return "image";
  if (normalized.startsWith("agnes-video-")) return "video";
  return "chat";
}

export function composerPlaceholder(kind: ModelKind): string {
  return kind === "image" ? "描述你想生成的图片" : kind === "video" ? "描述你想生成的视频" : "给 Agnes AI 发送消息";
}

export function advancedHelp(kind: ModelKind): string {
  if (kind === "image") return "可设置 size、responseFormat、returnBase64、image、extraBody 等图片参数；prompt 和 model 由界面管理。";
  if (kind === "video") return "可设置 width、height、numFrames、frameRate、numInferenceSteps、seed、negativePrompt、image、extraBody 等视频参数；prompt 和 model 由界面管理。";
  return "可设置 tools、toolChoice、thinking、chatTemplateKwargs 或 SDK 支持的其他字段；messages 和 stream 由应用管理。";
}

export function buildParameters(settings: RequestSettings, kind: ModelKind): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(settings.advanced || "{}");
  } catch {
    throw new Error("高级参数不是有效的 JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("高级参数必须是 JSON 对象。");
  }

  const parameters = { ...(parsed as Record<string, unknown>) };
  if ("messages" in parameters || "prompt" in parameters || "stream" in parameters) {
    throw new Error("高级参数不能设置 messages、prompt 或 stream。");
  }
  const forbiddenKey = findForbiddenAdvancedKey(parameters);
  if (forbiddenKey) {
    throw new Error(`高级参数不能设置敏感或传输字段：${forbiddenKey}。`);
  }
  if (settings.model.trim()) parameters.model = settings.model.trim();
  if (kind === "chat") {
    setOptionalNumber(parameters, "temperature", settings.temperature, 0, 2);
    setOptionalNumber(parameters, "topP", settings.topP, 0, 1);
    setOptionalNumber(parameters, "maxTokens", settings.maxTokens, 1, 1_000_000, true);
  } else if (kind === "image") {
    if (settings.imageSize) parameters.size = settings.imageSize;
    parameters.responseFormat = settings.imageResponseFormat;
    if (settings.imageReference.trim()) parameters.image = settings.imageReference.trim();
  } else {
    const dimensions = settings.videoAspectRatio === "9:16"
      ? { width: 720, height: 1280 }
      : settings.videoAspectRatio === "1:1"
        ? { width: 1024, height: 1024 }
        : { width: 1280, height: 720 };
    Object.assign(parameters, dimensions, {
      frameRate: 24,
      numFrames: settings.videoDurationSeconds === "3" ? 73 : 121,
    });
  }
  return parameters;
}

const forbiddenAdvancedKeys = new Set([
  "apikey",
  "api_key",
  "authorization",
  "defaultheaders",
  "headers",
  "signal",
]);

function findForbiddenAdvancedKey(value: unknown, path = ""): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (forbiddenAdvancedKeys.has(key.toLowerCase())) return childPath;
    const nested = findForbiddenAdvancedKey(child, childPath);
    if (nested) return nested;
  }
  return undefined;
}

function setOptionalNumber(
  target: Record<string, unknown>,
  key: string,
  rawValue: string,
  minimum: number,
  maximum: number,
  integer = false,
): void {
  if (!rawValue.trim()) return;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${key} 必须是 ${minimum} 到 ${maximum} 之间${integer ? "的整数" : "的数字"}。`);
  }
  target[key] = value;
}
