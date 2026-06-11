from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from agnes_ai import AgnesClient
from agnes_ai.constants import CHAT_MODEL, IMAGE_MODEL, VIDEO_MODEL
from agnes_ai.errors import (
    AgnesAPIAuthenticationError,
    AgnesAPIServerError,
    AgnesVideoTaskFailedError,
)


def test_chat_create_sends_default_model_and_messages():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "chat-1"})

    client = _client(handler)

    result = client.chat.create(messages=[{"role": "user", "content": "Hello"}])

    assert result == {"id": "chat-1"}
    assert requests[0].url.path == "/v1/chat/completions"
    assert requests[0].headers["authorization"] == "Bearer " + "test-key"
    body = _json_body(requests[0])
    assert body["model"] == CHAT_MODEL
    assert body["messages"] == [{"role": "user", "content": "Hello"}]


def test_chat_stream_passes_through_raw_chunks():
    def handler(request: httpx.Request) -> httpx.Response:
        body = _json_body(request)
        assert body["stream"] is True
        return httpx.Response(200, text="data: first\n\ndata: second\n\n")

    client = _client(handler)

    assert "".join(client.chat.stream(messages=[{"role": "user", "content": "Hello"}])) == (
        "data: first\n\ndata: second\n\n"
    )


def test_images_generate_maps_response_format_to_extra_body():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [{"url": "https://cdn.example/image.png"}]})

    client = _client(handler)

    client.images.generate(
        prompt="A clean product photo",
        size="1024x768",
        response_format="url",
    )

    body = _json_body(requests[0])
    assert body["model"] == IMAGE_MODEL
    assert body["prompt"] == "A clean product photo"
    assert body["size"] == "1024x768"
    assert body["extra_body"]["response_format"] == "url"


def test_images_generate_supports_base64_and_image_to_image():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [{"b64_json": "abc"}]})

    client = _client(handler)

    client.images.generate(
        prompt="Edit image",
        return_base64=True,
        image=["https://cdn.example/input.png"],
        extra_body={"strength": 0.5},
    )

    body = _json_body(requests[0])
    assert body["return_base64"] is True
    assert body["extra_body"] == {
        "strength": 0.5,
        "image": ["https://cdn.example/input.png"],
    }


def test_videos_create_validates_and_sends_payload():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"video_id": "video-1"})

    client = _client(handler)

    result = client.videos.create(
        prompt="A cat walking on the beach",
        num_frames=121,
        frame_rate=24,
        width=1280,
        height=720,
    )

    assert result == {"video_id": "video-1"}
    body = _json_body(requests[0])
    assert body["model"] == VIDEO_MODEL
    assert body["num_frames"] == 121
    assert body["frame_rate"] == 24
    assert body["width"] == 1280
    assert body["height"] == 720


def test_videos_create_rejects_invalid_num_frames_before_request():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={})

    client = _client(handler)

    with pytest.raises(ValueError):
        client.videos.create(prompt="bad", num_frames=122)

    assert calls == 0


def test_videos_retrieve_uses_recommended_endpoint():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"status": "completed"})

    client = _client(handler)

    client.videos.retrieve("video-1", model_name=VIDEO_MODEL)

    assert requests[0].method == "GET"
    assert requests[0].url.path == "/agnesapi"
    assert requests[0].url.params["video_id"] == "video-1"
    assert requests[0].url.params["model_name"] == VIDEO_MODEL


def test_videos_retrieve_legacy_uses_legacy_endpoint():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"status": "completed"})

    client = _client(handler)

    client.videos.retrieve_legacy("task-1")

    assert requests[0].method == "GET"
    assert requests[0].url.path == "/v1/videos/task-1"


def test_videos_wait_returns_completed_result_with_normalized_url():
    responses = iter(
        [
            {"status": "queued"},
            {"status": "in_progress"},
            {"status": "completed", "remixed_from_video_id": "https://cdn.example/video.mp4"},
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=next(responses))

    client = _client(handler)

    result = client.videos.wait("video-1", timeout_seconds=1, poll_interval_seconds=0)

    assert result["status"] == "completed"
    assert result["video_url"] == "https://cdn.example/video.mp4"


def test_videos_wait_raises_on_failed_task():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "failed"})

    client = _client(handler)

    with pytest.raises(AgnesVideoTaskFailedError):
        client.videos.wait("video-1", timeout_seconds=1, poll_interval_seconds=0)


def test_401_response_is_not_retried():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(401, json={"error": {"message": "bad credentials"}})

    client = _client(handler, max_retries=3)

    with pytest.raises(AgnesAPIAuthenticationError):
        client.chat.create(messages=[{"role": "user", "content": "Hello"}])

    assert calls == 1


def test_503_response_is_retried_then_succeeds():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, json={"message": "try again"})
        return httpx.Response(200, json={"ok": True})

    client = _client(handler, max_retries=2, retry_backoff=0)

    assert client.chat.create(messages=[{"role": "user", "content": "Hello"}]) == {"ok": True}
    assert calls == 2


def test_503_response_raises_after_retries():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"message": "still down"})

    client = _client(handler, max_retries=1, retry_backoff=0)

    with pytest.raises(AgnesAPIServerError):
        client.chat.create(messages=[{"role": "user", "content": "Hello"}])


def _client(
    handler: Any,
    *,
    max_retries: int = 0,
    retry_backoff: float = 0,
) -> AgnesClient:
    return AgnesClient(
        api_key="test-key",
        base_url="https://api.test",
        max_retries=max_retries,
        retry_backoff=retry_backoff,
        transport=httpx.MockTransport(handler),
    )


def _json_body(request: httpx.Request) -> dict[str, Any]:
    return json.loads(request.content.decode("utf-8"))
