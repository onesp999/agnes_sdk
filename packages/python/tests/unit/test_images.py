from __future__ import annotations

import json
from typing import Any

import httpx

from agnes_ai import AgnesClient


def test_image_generation_url_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"url": "https://cdn.example/image.png"}]})

    client = _client(handler)

    result = client.images.generate(prompt="A glass cube", response_format="url")

    assert result["data"][0]["url"] == "https://cdn.example/image.png"


def test_image_generation_base64_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"b64_json": "ZmFrZQ=="}]})

    client = _client(handler)

    result = client.images.generate(prompt="A glass cube", return_base64=True)

    assert result["data"][0]["b64_json"] == "ZmFrZQ=="


def test_image_to_image_uses_extra_body_image():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [{"url": "https://cdn.example/edited.png"}]})

    client = _client(handler)

    client.images.generate(
        prompt="Edit image",
        image=["https://example.test/input.png"],
        extra_body={"strength": 0.5},
    )

    body = _json_body(requests[0])
    assert "image" not in body
    assert body["extra_body"] == {
        "strength": 0.5,
        "image": ["https://example.test/input.png"],
    }


def _client(handler: Any) -> AgnesClient:
    return AgnesClient(
        api_key="test-key",
        base_url="https://api.test",
        max_retries=0,
        transport=httpx.MockTransport(handler),
    )


def _json_body(request: httpx.Request) -> dict[str, Any]:
    return json.loads(request.content.decode("utf-8"))
