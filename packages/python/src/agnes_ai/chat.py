from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from typing import Any

from ._http import AgnesHTTPClient
from .constants import CHAT_COMPLETIONS_ENDPOINT, CHAT_MODEL


class ChatResource:
    def __init__(self, http: AgnesHTTPClient) -> None:
        self._http = http

    def create(
        self,
        *,
        messages: Sequence[Mapping[str, Any]],
        model: str = CHAT_MODEL,
        temperature: float | None = None,
        top_p: float | None = None,
        max_tokens: int | None = None,
        tools: Sequence[Mapping[str, Any]] | None = None,
        tool_choice: str | Mapping[str, Any] | None = None,
        chat_template_kwargs: Mapping[str, Any] | None = None,
        thinking: Mapping[str, Any] | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        body = _drop_none(
            {
                "model": model,
                "messages": list(messages),
                "temperature": temperature,
                "top_p": top_p,
                "max_tokens": max_tokens,
                "tools": tools,
                "tool_choice": tool_choice,
                "chat_template_kwargs": chat_template_kwargs,
                "thinking": thinking,
                **extra,
            }
        )
        return self._http.request("POST", CHAT_COMPLETIONS_ENDPOINT, json_body=body)

    def stream(
        self,
        *,
        messages: Sequence[Mapping[str, Any]],
        model: str = CHAT_MODEL,
        temperature: float | None = None,
        top_p: float | None = None,
        max_tokens: int | None = None,
        tools: Sequence[Mapping[str, Any]] | None = None,
        tool_choice: str | Mapping[str, Any] | None = None,
        chat_template_kwargs: Mapping[str, Any] | None = None,
        thinking: Mapping[str, Any] | None = None,
        **extra: Any,
    ) -> Iterator[str]:
        body = _drop_none(
            {
                "model": model,
                "messages": list(messages),
                "temperature": temperature,
                "top_p": top_p,
                "max_tokens": max_tokens,
                "stream": True,
                "tools": tools,
                "tool_choice": tool_choice,
                "chat_template_kwargs": chat_template_kwargs,
                "thinking": thinking,
                **extra,
            }
        )
        return self._http.stream("POST", CHAT_COMPLETIONS_ENDPOINT, json_body=body)


def _drop_none(data: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}
