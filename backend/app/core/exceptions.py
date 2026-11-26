"""Structured API error classes matching the MedSarthi error envelope."""

from typing import Any


class AppError(Exception):
    """Domain error mapped to `{error: {code, message, details, request_id}}`."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []
