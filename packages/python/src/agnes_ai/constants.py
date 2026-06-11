DEFAULT_BASE_URL = "https://apihub.agnes-ai.com"

CHAT_MODEL = "agnes-2.0-flash"
IMAGE_MODEL = "agnes-image-2.1-flash"
VIDEO_MODEL = "agnes-video-v2.0"

CHAT_COMPLETIONS_ENDPOINT = "/v1/chat/completions"
IMAGE_GENERATIONS_ENDPOINT = "/v1/images/generations"
VIDEO_CREATE_ENDPOINT = "/v1/videos"
VIDEO_QUERY_ENDPOINT = "/agnesapi"

RETRYABLE_STATUS_CODES = frozenset({500, 503})
NON_RETRYABLE_STATUS_CODES = frozenset({400, 401, 404})
