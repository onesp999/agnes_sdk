from __future__ import annotations

from collections.abc import Mapping
from typing import Any


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
