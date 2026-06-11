from __future__ import annotations

from typing import Any

import pytest
from agnes_ai import AgnesAPIAuthenticationError, AgnesConfigurationError
from fastapi.testclient import TestClient

from app import app, get_client


class FakeChat:
    def __init__(self) -> None:
        self.payload: dict[str, Any] | None = None

    def create(self, **payload: Any) -> dict[str, Any]:
        self.payload = payload
        return {"id": "chat-1", "payload": payload}


class FakeImages:
    def generate(self, **payload: Any) -> dict[str, Any]:
        return {"data": [{"url": "https://cdn.example/image.png"}], "payload": payload}


class FakeVideos:
    def create(self, **payload: Any) -> dict[str, Any]:
        return {"video_id": "video-1", "payload": payload}

    def retrieve(self, video_id: str) -> dict[str, Any]:
        return {"video_id": video_id, "status": "completed"}

    def wait(self, video_id: str, **payload: Any) -> dict[str, Any]:
        return {"video_id": video_id, "status": "completed", "payload": payload}


class FakeClient:
    def __init__(self) -> None:
        self.chat = FakeChat()
        self.images = FakeImages()
        self.videos = FakeVideos()


@pytest.fixture(autouse=True)
def override_client() -> None:
    app.dependency_overrides[get_client] = lambda: FakeClient()
    yield
    app.dependency_overrides.clear()


def test_health() -> None:
    client = TestClient(app)

    assert client.get("/health").json() == {"status": "ok"}


def test_chat_route_calls_sdk_without_frontend_api_key() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )

    assert response.status_code == 200
    assert response.json()["payload"] == {"messages": [{"role": "user", "content": "Hello"}]}


def test_images_route_calls_sdk() -> None:
    client = TestClient(app)

    response = client.post("/api/images", json={"prompt": "image"})

    assert response.status_code == 200
    assert response.json()["data"][0]["url"] == "https://cdn.example/image.png"


def test_video_routes_call_sdk() -> None:
    client = TestClient(app)

    assert client.post("/api/videos", json={"prompt": "video"}).json()["video_id"] == "video-1"
    assert client.get("/api/videos/video-1").json()["status"] == "completed"
    assert (
        client.post("/api/videos/video-1/wait", json={"poll_interval_seconds": 0}).json()[
            "payload"
        ]["poll_interval_seconds"]
        == 0
    )


def test_error_response_redacts_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGNES_API_KEY", "secret-key")

    def failing_client() -> Any:
        raise AgnesConfigurationError("missing secret-key")

    app.dependency_overrides[get_client] = failing_client
    client = TestClient(app)

    response = client.post("/api/chat", json={"messages": []})

    assert response.status_code == 500
    assert "secret-key" not in response.text
    assert "[redacted]" in response.text


def test_api_status_code_is_preserved() -> None:
    class FailingChat(FakeChat):
        def create(self, **payload: Any) -> dict[str, Any]:
            raise AgnesAPIAuthenticationError("bad credentials", status_code=401)

    class FailingClient(FakeClient):
        def __init__(self) -> None:
            super().__init__()
            self.chat = FailingChat()

    app.dependency_overrides[get_client] = lambda: FailingClient()
    client = TestClient(app)

    response = client.post("/api/chat", json={"messages": []})

    assert response.status_code == 401
    assert response.json()["error"]["type"] == "AgnesAPIAuthenticationError"
