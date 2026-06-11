export interface VideoValidationOptions {
  numFrames?: number;
  frameRate?: number;
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
