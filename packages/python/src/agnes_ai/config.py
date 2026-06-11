from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping

from .constants import DEFAULT_BASE_URL
from .errors import AgnesConfigurationError


@dataclass(frozen=True)
class AgnesConfig:
    api_key: str
    base_url: str = DEFAULT_BASE_URL
    timeout: float = 60.0
    max_retries: int = 2
    retry_backoff: float = 0.5
    default_headers: Mapping[str, str] = field(default_factory=dict)

    @classmethod
    def from_env(
        cls,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
        max_retries: int = 2,
        retry_backoff: float = 0.5,
        default_headers: Mapping[str, str] | None = None,
    ) -> "AgnesConfig":
        resolved_api_key = api_key or os.getenv("AGNES_API_KEY")
        if not resolved_api_key:
            raise AgnesConfigurationError(
                "Missing Agnes API key. Set AGNES_API_KEY or pass api_key."
            )

        return cls(
            api_key=resolved_api_key,
            base_url=(base_url or os.getenv("AGNES_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
            timeout=timeout,
            max_retries=max_retries,
            retry_backoff=retry_backoff,
            default_headers=default_headers or {},
        )
