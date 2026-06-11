from __future__ import annotations

import httpx
import pytest

from agnes_ai import AgnesClient
from agnes_ai.config import AgnesConfig
from agnes_ai.constants import (
    CHAT_COMPLETIONS_ENDPOINT,
    IMAGE_GENERATIONS_ENDPOINT,
    VIDEO_CREATE_ENDPOINT,
    VIDEO_QUERY_ENDPOINT,
)
from agnes_ai.errors import AgnesAPIAuthenticationError, AgnesConfigurationError


def test_core_endpoints_match_agnes_contract():
    assert CHAT_COMPLETIONS_ENDPOINT == "/v1/chat/completions"
    assert IMAGE_GENERATIONS_ENDPOINT == "/v1/images/generations"
    assert VIDEO_CREATE_ENDPOINT == "/v1/videos"
    assert VIDEO_QUERY_ENDPOINT == "/agnesapi"


def test_missing_api_key_raises_clear_error(monkeypatch):
    monkeypatch.delenv("AGNES_API_KEY", raising=False)

    with pytest.raises(AgnesConfigurationError, match="Missing Agnes API key"):
        AgnesConfig.from_env()


def test_no_api_key_in_errors():
    secret = "agnes-secret-test-key"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": {"message": f"bad Authorization: Bearer {secret}"}},
        )

    client = AgnesClient(
        api_key=secret,
        base_url="https://api.test",
        max_retries=0,
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(AgnesAPIAuthenticationError) as exc_info:
        client.chat.create(messages=[{"role": "user", "content": "Hello"}])

    message = str(exc_info.value)
    assert secret not in message
    assert "Bearer [REDACTED]" in message
