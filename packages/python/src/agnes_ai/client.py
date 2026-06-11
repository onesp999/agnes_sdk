from __future__ import annotations

import httpx

from ._http import AgnesHTTPClient
from .chat import ChatResource
from .config import AgnesConfig
from .images import ImagesResource
from .videos import VideosResource


class AgnesClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
        max_retries: int = 2,
        retry_backoff: float = 0.5,
        default_headers: dict[str, str] | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.config = AgnesConfig.from_env(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            retry_backoff=retry_backoff,
            default_headers=default_headers,
        )
        self._http = AgnesHTTPClient(self.config, transport=transport)
        self.chat = ChatResource(self._http)
        self.images = ImagesResource(self._http)
        self.videos = VideosResource(self._http)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "AgnesClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()
