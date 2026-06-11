import pytest

from agnes_ai.config import AgnesConfig
from agnes_ai.constants import (
    CHAT_COMPLETIONS_ENDPOINT,
    CHAT_MODEL,
    DEFAULT_BASE_URL,
    IMAGE_GENERATIONS_ENDPOINT,
    IMAGE_MODEL,
    NON_RETRYABLE_STATUS_CODES,
    RETRYABLE_STATUS_CODES,
    VIDEO_CREATE_ENDPOINT,
    VIDEO_MODEL,
    VIDEO_QUERY_ENDPOINT,
)
from agnes_ai.errors import AgnesAPIAuthenticationError, AgnesConfigurationError
from agnes_ai.videos import extract_video_url, validate_video_options


def test_api_constants_match_design():
    assert DEFAULT_BASE_URL == "https://apihub.agnes-ai.com"
    assert CHAT_MODEL == "agnes-2.0-flash"
    assert IMAGE_MODEL == "agnes-image-2.1-flash"
    assert VIDEO_MODEL == "agnes-video-v2.0"
    assert CHAT_COMPLETIONS_ENDPOINT == "/v1/chat/completions"
    assert IMAGE_GENERATIONS_ENDPOINT == "/v1/images/generations"
    assert VIDEO_CREATE_ENDPOINT == "/v1/videos"
    assert VIDEO_QUERY_ENDPOINT == "/agnesapi"


def test_retry_status_sets_are_conservative():
    assert {400, 401, 404}.issubset(NON_RETRYABLE_STATUS_CODES)
    assert {500, 503}.issubset(RETRYABLE_STATUS_CODES)


def test_config_requires_api_key(monkeypatch):
    monkeypatch.delenv("AGNES_API_KEY", raising=False)

    with pytest.raises(AgnesConfigurationError):
        AgnesConfig.from_env()


def test_config_reads_environment(monkeypatch):
    monkeypatch.setenv("AGNES_API_KEY", "test-key")
    monkeypatch.setenv("AGNES_BASE_URL", "https://example.test/")

    config = AgnesConfig.from_env()

    assert config.api_key == "test-key"
    assert config.base_url == "https://example.test"


def test_error_message_does_not_include_api_key():
    error = AgnesAPIAuthenticationError(
        "Authentication failed.",
        status_code=401,
        endpoint="/v1/chat/completions",
    )

    assert "secret-key" not in str(error)
    assert error.status_code == 401
    assert error.endpoint == "/v1/chat/completions"


@pytest.mark.parametrize("num_frames", [1, 9, 121, 441])
def test_validate_video_options_accepts_valid_num_frames(num_frames):
    validate_video_options(num_frames=num_frames, frame_rate=24)


@pytest.mark.parametrize("num_frames", [0, 2, 122, 442])
def test_validate_video_options_rejects_invalid_num_frames(num_frames):
    with pytest.raises(ValueError):
        validate_video_options(num_frames=num_frames, frame_rate=24)


@pytest.mark.parametrize("frame_rate", [0, 61])
def test_validate_video_options_rejects_invalid_frame_rate(frame_rate):
    with pytest.raises(ValueError):
        validate_video_options(num_frames=121, frame_rate=frame_rate)


def test_extract_video_url_prefers_video_url():
    assert (
        extract_video_url(
            {
                "video_url": "https://cdn.example/video.mp4",
                "remixed_from_video_id": "fallback",
            }
        )
        == "https://cdn.example/video.mp4"
    )


def test_extract_video_url_falls_back_to_remixed_from_video_id():
    assert extract_video_url({"remixed_from_video_id": "https://cdn.example/fallback.mp4"}) == (
        "https://cdn.example/fallback.mp4"
    )
