from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ._http import AgnesHTTPClient
from .constants import IMAGE_GENERATIONS_ENDPOINT, IMAGE_MODEL


class ImagesResource:
    def __init__(self, http: AgnesHTTPClient) -> None:
        self._http = http

    def generate(
        self,
        *,
        prompt: str,
        model: str = IMAGE_MODEL,
        size: str | None = None,
        response_format: str | None = None,
        return_base64: bool | None = None,
        image: str | Sequence[str] | None = None,
        extra_body: Mapping[str, Any] | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        merged_extra_body = dict(extra_body or {})
        if response_format is not None:
            merged_extra_body["response_format"] = response_format
        if image is not None:
            merged_extra_body["image"] = image

        body = _drop_none(
            {
                "model": model,
                "prompt": prompt,
                "size": size,
                "return_base64": return_base64,
                "extra_body": merged_extra_body or None,
                **extra,
            }
        )
        return self._http.request("POST", IMAGE_GENERATIONS_ENDPOINT, json_body=body)


def _drop_none(data: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}
