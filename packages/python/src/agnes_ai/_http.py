from __future__ import annotations

import json
import time
from collections.abc import Iterator, Mapping
from typing import Any

import httpx

from .config import AgnesConfig
from .constants import RETRYABLE_STATUS_CODES
from .errors import (
    AgnesAPIAuthenticationError,
    AgnesAPIBadRequestError,
    AgnesAPIError,
    AgnesAPIRateLimitError,
    AgnesAPIServerError,
    AgnesAPITimeoutError,
)


class AgnesHTTPClient:
    def __init__(
        self,
        config: AgnesConfig,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._client = httpx.Client(
            base_url=config.base_url,
            timeout=config.timeout,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def request(
        self,
        method: str,
        endpoint: str,
        *,
        json_body: Mapping[str, Any] | None = None,
        params: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        response = self._send_with_retries(
            method,
            endpoint,
            json_body=json_body,
            params=params,
        )
        self._raise_for_status(response, endpoint)
        return self._parse_json_response(response, endpoint)

    def stream(
        self,
        method: str,
        endpoint: str,
        *,
        json_body: Mapping[str, Any] | None = None,
        params: Mapping[str, Any] | None = None,
    ) -> Iterator[str]:
        try:
            with self._client.stream(
                method,
                endpoint,
                headers=self._headers(),
                json=json_body,
                params=params,
            ) as response:
                self._raise_for_status(response, endpoint)
                for chunk in response.iter_text():
                    if chunk:
                        yield chunk
        except httpx.TimeoutException as exc:
            raise AgnesAPITimeoutError(
                "Agnes API request timed out.",
                endpoint=endpoint,
            ) from exc

    def _send_with_retries(
        self,
        method: str,
        endpoint: str,
        *,
        json_body: Mapping[str, Any] | None,
        params: Mapping[str, Any] | None,
    ) -> httpx.Response:
        last_response: httpx.Response | None = None

        for attempt in range(self._config.max_retries + 1):
            try:
                response = self._client.request(
                    method,
                    endpoint,
                    headers=self._headers(),
                    json=json_body,
                    params=params,
                )
            except httpx.TimeoutException as exc:
                raise AgnesAPITimeoutError(
                    "Agnes API request timed out.",
                    endpoint=endpoint,
                ) from exc

            if response.status_code not in RETRYABLE_STATUS_CODES:
                return response

            last_response = response
            if attempt < self._config.max_retries:
                time.sleep(self._config.retry_backoff * (2**attempt))

        assert last_response is not None
        return last_response

    def _headers(self) -> dict[str, str]:
        return {
            **dict(self._config.default_headers),
            "Authorization": f"Bearer {self._config.api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _parse_json_response(response: httpx.Response, endpoint: str) -> dict[str, Any]:
        try:
            data = response.json()
        except json.JSONDecodeError as exc:
            raise AgnesAPIError(
                "Agnes API returned a non-JSON response.",
                status_code=response.status_code,
                endpoint=endpoint,
                request_id=response.headers.get("x-request-id"),
            ) from exc

        if isinstance(data, dict):
            return data

        raise AgnesAPIError(
            "Agnes API returned an unexpected JSON response.",
            status_code=response.status_code,
            endpoint=endpoint,
            request_id=response.headers.get("x-request-id"),
        )

    @staticmethod
    def _raise_for_status(response: httpx.Response, endpoint: str) -> None:
        if response.status_code < 400:
            return

        message = _safe_error_message(response)
        request_id = response.headers.get("x-request-id")
        kwargs = {
            "status_code": response.status_code,
            "endpoint": endpoint,
            "request_id": request_id,
        }

        if response.status_code == 401:
            raise AgnesAPIAuthenticationError(message, **kwargs)
        if response.status_code == 400:
            raise AgnesAPIBadRequestError(message, **kwargs)
        if response.status_code == 429:
            raise AgnesAPIRateLimitError(message, **kwargs)
        if response.status_code >= 500:
            raise AgnesAPIServerError(message, **kwargs)
        raise AgnesAPIError(message, **kwargs)


def _safe_error_message(response: httpx.Response) -> str:
    fallback = f"Agnes API request failed with status {response.status_code}."
    try:
        data = response.json()
    except json.JSONDecodeError:
        return fallback

    if not isinstance(data, Mapping):
        return fallback

    error = data.get("error")
    if isinstance(error, Mapping):
        message = error.get("message")
        if isinstance(message, str) and message:
            return message

    message = data.get("message")
    if isinstance(message, str) and message:
        return message

    return fallback
