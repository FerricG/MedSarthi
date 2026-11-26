"""Standard JSON response envelopes matching API conventions."""

from datetime import UTC, datetime
from typing import Any, Generic, TypeVar
import uuid
from pydantic import BaseModel, Field

T = TypeVar("T")


class MetaPayload(BaseModel):
    request_id: str = Field(default_factory=lambda: f"req_{uuid.uuid4().hex[:16]}")
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class SuccessResponse(BaseModel, Generic[T]):
    data: T
    meta: MetaPayload = Field(default_factory=MetaPayload)


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | dict[str, Any] = Field(default_factory=list)
    request_id: str = Field(default_factory=lambda: f"req_{uuid.uuid4().hex[:16]}")


class ErrorResponse(BaseModel):
    error: ErrorDetail


def ok_envelope(data: Any, request_id: str | None = None) -> dict[str, Any]:
    """Wrap response data in standard `{data, meta}` envelope."""
    meta = MetaPayload(request_id=request_id) if request_id else MetaPayload()
    return {"data": data, "meta": meta.model_dump()}
