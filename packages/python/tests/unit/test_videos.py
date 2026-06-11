from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from agnes_ai import AgnesClient
from agnes_ai.errors import AgnesAPITimeoutError, AgnesVideoTaskFailedError
from agnes_ai.videos import extract_video_url


def test_video_create_returns_video_id():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/videos"
        return httpx.Response(200, json={"video_id": "video-1"})

    client = _client(handler)

    assert client.videos.create(prompt="A beach", num_frames=121)["video_id"] == "video-1"


def test_video_get_status():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"status": "in_progress"})

    client = _client(handler)

    result = client.videos.retrieve("video-1")

    assert result["status"] == "in_progress"
    assert requests[0].method == "GET"
    assert requests[0].url.path == "/agnesapi"
    assert requests[0].url.params["video_id"] == "video-1"


def test_video_poll_completed():
    responses = iter(
        [
            {"status": "queued"},
            {"status": "in_progress"},
            {"status": "completed", "video_url": "https://cdn.example/video.mp4"},
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=next(responses))

    client = _client(handler)

    result = client.videos.wait("video-1", timeout_seconds=1, poll_interval_seconds=0)

    assert result["status"] == "completed"
    assert result["video_url"] == "https://cdn.example/video.mp4"


def test_video_poll_failed_raises_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "failed"})

    client = _client(handler)

    with pytest.raises(AgnesVideoTaskFailedError):
        client.videos.wait("video-1", timeout_seconds=1, poll_interval_seconds=0)


def test_video_poll_timeout_raises_timeout():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "queued"})

    client = _client(handler)

    with pytest.raises(AgnesAPITimeoutError):
        client.videos.wait("video-1", timeout_seconds=0, poll_interval_seconds=0)


def test_video_url_field_compatibility():
    assert (
        extract_video_url(
            {
                "video_url": "https://cdn.example/video.mp4",
                "remixed_from_video_id": "https://cdn.example/fallback.mp4",
            }
        )
        == "https://cdn.example/video.mp4"
    )
    assert extract_video_url({"remixed_from_video_id": "https://cdn.example/fallback.mp4"}) == (
        "https://cdn.example/fallback.mp4"
    )


def _client(handler: Any) -> AgnesClient:
    return AgnesClient(
        api_key="test-key",
        base_url="https://api.test",
        max_retries=0,
        transport=httpx.MockTransport(handler),
    )


def _json_body(request: httpx.Request) -> dict[str, Any]:
    return json.loads(request.content.decode("utf-8"))
