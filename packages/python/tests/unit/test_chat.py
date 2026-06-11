from __future__ import annotations

import json
from typing import Any

import httpx

from agnes_ai import AgnesClient
from agnes_ai.constants import CHAT_MODEL


def test_chat_completion_builds_correct_payload():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "chat-1"})

    client = _client(handler)

    client.chat.create(messages=[{"role": "user", "content": "Hello"}])

    body = _json_body(requests[0])
    assert requests[0].url.path == "/v1/chat/completions"
    assert body == {
        "model": CHAT_MODEL,
        "messages": [{"role": "user", "content": "Hello"}],
    }


def test_chat_completion_parses_content_and_usage():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "Hello from Agnes"}}],
                "usage": {"total_tokens": 12},
            },
        )

    client = _client(handler)

    result = client.chat.create(messages=[{"role": "user", "content": "Hello"}])

    assert result["choices"][0]["message"]["content"] == "Hello from Agnes"
    assert result["usage"]["total_tokens"] == 12


def test_chat_stream_accumulates_chunks():
    def handler(request: httpx.Request) -> httpx.Response:
        body = _json_body(request)
        assert body["stream"] is True
        return httpx.Response(200, text="data: one\n\ndata: two\n\n")

    client = _client(handler)

    assert "".join(client.chat.stream(messages=[{"role": "user", "content": "Hello"}])) == (
        "data: one\n\ndata: two\n\n"
    )


def test_chat_tools_payload():
    requests: list[httpx.Request] = []
    tool = {
        "type": "function",
        "function": {"name": "lookup", "parameters": {"type": "object"}},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "chat-tools"})

    client = _client(handler)

    client.chat.create(
        messages=[{"role": "user", "content": "Use a tool"}],
        tools=[tool],
        tool_choice="auto",
    )

    body = _json_body(requests[0])
    assert body["tools"] == [tool]
    assert body["tool_choice"] == "auto"


def test_chat_image_url_payload():
    requests: list[httpx.Request] = []
    message = {
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this"},
            {"type": "image_url", "image_url": {"url": "https://example.test/image.png"}},
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "chat-image"})

    client = _client(handler)

    client.chat.create(messages=[message])

    assert _json_body(requests[0])["messages"] == [message]


def _client(handler: Any) -> AgnesClient:
    return AgnesClient(
        api_key="test-key",
        base_url="https://api.test",
        max_retries=0,
        transport=httpx.MockTransport(handler),
    )


def _json_body(request: httpx.Request) -> dict[str, Any]:
    return json.loads(request.content.decode("utf-8"))
