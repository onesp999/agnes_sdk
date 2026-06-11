export const DEFAULT_BASE_URL = "https://apihub.agnes-ai.com" as const;

export const CHAT_MODEL = "agnes-2.0-flash" as const;
export const IMAGE_MODEL = "agnes-image-2.1-flash" as const;
export const VIDEO_MODEL = "agnes-video-v2.0" as const;

export const CHAT_COMPLETIONS_ENDPOINT = "/v1/chat/completions" as const;
export const IMAGE_GENERATIONS_ENDPOINT = "/v1/images/generations" as const;
export const VIDEO_CREATE_ENDPOINT = "/v1/videos" as const;
export const VIDEO_QUERY_ENDPOINT = "/agnesapi" as const;

export const RETRYABLE_STATUS_CODES = new Set([500, 503]);
export const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 404]);
