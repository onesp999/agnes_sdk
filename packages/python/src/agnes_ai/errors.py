from __future__ import annotations


class AgnesError(Exception):
    """Base class for all Agnes SDK errors."""


class AgnesConfigurationError(AgnesError):
    """Raised when required SDK configuration is missing or invalid."""


class AgnesAPIError(AgnesError):
    """Raised when the Agnes API returns an error response."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        endpoint: str | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.endpoint = endpoint
        self.request_id = request_id


class AgnesAPIAuthenticationError(AgnesAPIError):
    """Raised for authentication and authorization failures."""


class AgnesAPIBadRequestError(AgnesAPIError):
    """Raised for invalid API requests."""


class AgnesAPIRateLimitError(AgnesAPIError):
    """Raised when the API rate limits a request."""


class AgnesAPIServerError(AgnesAPIError):
    """Raised for retryable Agnes API server errors."""


class AgnesAPITimeoutError(AgnesAPIError):
    """Raised when an API call times out."""


class AgnesVideoTaskFailedError(AgnesAPIError):
    """Raised when a video task reaches a failed state."""
