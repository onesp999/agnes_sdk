from __future__ import annotations

from collections.abc import Mapping
from typing import Any
import time

from ._http import AgnesHTTPClient
from .constants import VIDEO_CREATE_ENDPOINT, VIDEO_MODEL, VIDEO_QUERY_ENDPOINT
from .errors import AgnesAPITimeoutError, AgnesVideoTaskFailedError


class VideosResource:
    def __init__(self, http: AgnesHTTPClient) -> None:
        self._http = http

    def create(
        self,
        *,
        prompt: str,
        model: str = VIDEO_MODEL,
        image: str | list[str] | None = None,
        height: int | None = None,
        width: int | None = None,
        num_frames: int | None = None,
        frame_rate: int | None = None,
        num_inference_steps: int | None = None,
        seed: int | None = None,
        negative_prompt: str | None = None,
        extra_body: Mapping[str, Any] | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        validate_video_options(num_frames=num_frames, frame_rate=frame_rate)
        body = _drop_none(
            {
                "model": model,
                "prompt": prompt,
                "image": image,
                "height": height,
                "width": width,
                "num_frames": num_frames,
                "frame_rate": frame_rate,
                "num_inference_steps": num_inference_steps,
                "seed": seed,
                "negative_prompt": negative_prompt,
                "extra_body": dict(extra_body or {}) or None,
                **extra,
            }
        )
        return self._http.request("POST", VIDEO_CREATE_ENDPOINT, json_body=body)

    def retrieve(
        self,
        video_id: str,
        *,
        model_name: str | None = None,
    ) -> dict[str, Any]:
        params = _drop_none({"video_id": video_id, "model_name": model_name})
        return self._http.request("GET", VIDEO_QUERY_ENDPOINT, params=params)

    def retrieve_legacy(self, task_id: str) -> dict[str, Any]:
        return self._http.request("GET", f"{VIDEO_CREATE_ENDPOINT}/{task_id}")

    def wait(
        self,
        video_id: str,
        *,
        timeout_seconds: float = 600,
        poll_interval_seconds: float = 5,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds

        while True:
            data = self.retrieve(video_id)
            status = _get_status(data)

            if status == "completed":
                video_url = extract_video_url(data)
                if video_url is not None:
                    return {**data, "video_url": video_url}
                return data

            if status == "failed":
                raise AgnesVideoTaskFailedError(
                    "Agnes video task failed.",
                    endpoint=VIDEO_QUERY_ENDPOINT,
                )

            if time.monotonic() >= deadline:
                raise AgnesAPITimeoutError(
                    "Timed out waiting for Agnes video task.",
                    endpoint=VIDEO_QUERY_ENDPOINT,
                )

            time.sleep(poll_interval_seconds)


def validate_video_options(
    *,
    num_frames: int | None = None,
    frame_rate: int | None = None,
) -> None:
    if num_frames is not None:
        if num_frames > 441:
            raise ValueError("num_frames must be less than or equal to 441.")
        if (num_frames - 1) % 8 != 0:
            raise ValueError("num_frames must satisfy 8n + 1.")

    if frame_rate is not None and not 1 <= frame_rate <= 60:
        raise ValueError("frame_rate must be between 1 and 60.")


def extract_video_url(data: Mapping[str, Any]) -> str | None:
    video_url = data.get("video_url")
    if isinstance(video_url, str) and video_url:
        return video_url

    remixed_from_video_id = data.get("remixed_from_video_id")
    if isinstance(remixed_from_video_id, str) and remixed_from_video_id:
        return remixed_from_video_id

    return None


def _get_status(data: Mapping[str, Any]) -> str | None:
    status = data.get("status")
    if isinstance(status, str):
        return status.lower()

    nested_data = data.get("data")
    if isinstance(nested_data, Mapping):
        nested_status = nested_data.get("status")
        if isinstance(nested_status, str):
            return nested_status.lower()

    return None


def _drop_none(data: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}
