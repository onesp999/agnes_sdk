import { VIDEO_CREATE_ENDPOINT, VIDEO_MODEL, VIDEO_QUERY_ENDPOINT } from "./constants.js";
import { AgnesVideoTaskFailedError, AgnesAPITimeoutError } from "./errors.js";
import type { JsonObject } from "./http.js";
import { AgnesHTTPClient } from "./http.js";

export interface VideoValidationOptions {
  numFrames?: number;
  frameRate?: number;
}

export interface VideoCreateOptions extends VideoValidationOptions {
  prompt: string;
  model?: string;
  image?: string | string[];
  height?: number;
  width?: number;
  numInferenceSteps?: number;
  seed?: number;
  negativePrompt?: string;
  extraBody?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VideoWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export class VideosResource {
  constructor(private readonly http: AgnesHTTPClient) {}

  async create(options: VideoCreateOptions): Promise<JsonObject> {
    validateVideoOptions(options);
    const {
      prompt,
      model = VIDEO_MODEL,
      image,
      height,
      width,
      numFrames,
      frameRate,
      numInferenceSteps,
      seed,
      negativePrompt,
      extraBody,
      ...extra
    } = options;

    return this.http.request("POST", VIDEO_CREATE_ENDPOINT, {
      body: dropUndefined({
        model,
        prompt,
        image,
        height,
        width,
        num_frames: numFrames,
        frame_rate: frameRate,
        num_inference_steps: numInferenceSteps,
        seed,
        negative_prompt: negativePrompt,
        extra_body: extraBody && Object.keys(extraBody).length > 0 ? extraBody : undefined,
        ...extra,
      }),
    });
  }

  retrieve(videoId: string, options: { modelName?: string } = {}): Promise<JsonObject> {
    return this.http.request("GET", VIDEO_QUERY_ENDPOINT, {
      params: {
        video_id: videoId,
        model_name: options.modelName,
      },
    });
  }

  retrieveLegacy(taskId: string): Promise<JsonObject> {
    return this.http.request("GET", `${VIDEO_CREATE_ENDPOINT}/${taskId}`);
  }

  async wait(videoId: string, options: VideoWaitOptions = {}): Promise<JsonObject> {
    const timeoutMs = options.timeoutMs ?? 600_000;
    const pollIntervalMs = options.pollIntervalMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const data = await this.retrieve(videoId);
      const status = getStatus(data);

      if (status === "completed") {
        const videoUrl = extractVideoUrl(data);
        return videoUrl === undefined ? data : { ...data, video_url: videoUrl };
      }

      if (status === "failed") {
        throw new AgnesVideoTaskFailedError("Agnes video task failed.", {
          endpoint: VIDEO_QUERY_ENDPOINT,
        });
      }

      if (Date.now() >= deadline) {
        throw new AgnesAPITimeoutError("Timed out waiting for Agnes video task.", {
          endpoint: VIDEO_QUERY_ENDPOINT,
        });
      }

      await sleep(pollIntervalMs);
    }
  }
}

export function validateVideoOptions(options: VideoValidationOptions): void {
  const { numFrames, frameRate } = options;

  if (numFrames !== undefined) {
    if (numFrames > 441) {
      throw new RangeError("numFrames must be less than or equal to 441.");
    }
    if ((numFrames - 1) % 8 !== 0) {
      throw new RangeError("numFrames must satisfy 8n + 1.");
    }
  }

  if (frameRate !== undefined && (frameRate < 1 || frameRate > 60)) {
    throw new RangeError("frameRate must be between 1 and 60.");
  }
}

export interface VideoResultLike {
  video_url?: unknown;
  remixed_from_video_id?: unknown;
}

export function extractVideoUrl(data: VideoResultLike): string | undefined {
  if (typeof data.video_url === "string" && data.video_url.length > 0) {
    return data.video_url;
  }

  if (
    typeof data.remixed_from_video_id === "string" &&
    data.remixed_from_video_id.length > 0
  ) {
    return data.remixed_from_video_id;
  }

  return undefined;
}

function getStatus(data: JsonObject): string | undefined {
  if (typeof data.status === "string") {
    return data.status.toLowerCase();
  }

  if (typeof data.data === "object" && data.data !== null && !Array.isArray(data.data)) {
    const nestedData = data.data as Record<string, unknown>;
    if (typeof nestedData.status === "string") {
      return nestedData.status.toLowerCase();
    }
  }

  return undefined;
}

function dropUndefined(data: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
