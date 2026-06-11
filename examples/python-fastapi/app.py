from __future__ import annotations

import os
from typing import Any

from agnes_ai import AgnesAPIError, AgnesClient, AgnesConfigurationError
from agnes_ai.errors import AgnesError
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


app = FastAPI(title="Agnes AI FastAPI Example")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("PLAYGROUND_ORIGIN", "http://localhost:5173")],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def get_client() -> AgnesClient:
    return AgnesClient()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(AgnesError)
def agnes_error_handler(_request: Request, exc: AgnesError) -> JSONResponse:
    return _error_response(exc)


@app.post("/api/chat")
def create_chat(
    payload: dict[str, Any],
    client: AgnesClient = Depends(get_client),
) -> dict[str, Any]:
    return client.chat.create(**payload)


@app.post("/api/images")
def generate_image(
    payload: dict[str, Any],
    client: AgnesClient = Depends(get_client),
) -> dict[str, Any]:
    return client.images.generate(**payload)


@app.post("/api/videos")
def create_video(
    payload: dict[str, Any],
    client: AgnesClient = Depends(get_client),
) -> dict[str, Any]:
    return client.videos.create(**payload)


@app.get("/api/videos/{video_id}")
def retrieve_video(
    video_id: str,
    client: AgnesClient = Depends(get_client),
) -> dict[str, Any]:
    return client.videos.retrieve(video_id)


@app.post("/api/videos/{video_id}/wait")
def wait_for_video(
    video_id: str,
    payload: dict[str, Any] | None = None,
    client: AgnesClient = Depends(get_client),
) -> dict[str, Any]:
    options = payload or {}
    return client.videos.wait(video_id, **options)


def _error_response(exc: AgnesError) -> JSONResponse:
    status_code = 500
    if isinstance(exc, AgnesConfigurationError):
        status_code = 500
    elif isinstance(exc, AgnesAPIError) and exc.status_code is not None:
        status_code = exc.status_code

    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "message": _safe_message(exc),
                "type": type(exc).__name__,
            }
        },
    )


def _safe_message(exc: AgnesError) -> str:
    message = str(exc)
    api_key = os.getenv("AGNES_API_KEY")
    if api_key:
        message = message.replace(api_key, "[redacted]")
    return message
