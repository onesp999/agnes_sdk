from __future__ import annotations

import os

import pytest

from agnes_ai import AgnesClient


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_AGNES_INTEGRATION_TESTS") != "1" or not os.getenv("AGNES_API_KEY"),
    reason="Set RUN_AGNES_INTEGRATION_TESTS=1 and AGNES_API_KEY to run Agnes smoke tests.",
)


def test_chat_smoke_returns_text():
    client = AgnesClient()

    result = client.chat.create(
        messages=[{"role": "user", "content": "Reply with the word pong."}],
        max_tokens=16,
    )

    choices = result.get("choices")
    assert isinstance(choices, list)
    assert choices


def test_image_smoke_returns_url():
    client = AgnesClient()

    result = client.images.generate(
        prompt="A simple blue square on a white background",
        response_format="url",
    )

    data = result.get("data")
    assert isinstance(data, list)
    assert data
    assert isinstance(data[0].get("url"), str)


def test_video_create_smoke_returns_video_id():
    client = AgnesClient()

    result = client.videos.create(
        prompt="A simple static shot of a blue square",
        num_frames=9,
    )

    assert isinstance(result.get("video_id"), str)
