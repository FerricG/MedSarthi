"""Visual artifact streaming, rendering, and regeneration routes."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.schemas.common import ok_envelope
from app.services.visual.visual_engine import visual_intelligence_engine

router = APIRouter(prefix="/visuals", tags=["visuals"])


class RegenerateVisualRequest(BaseModel):
    prompt: str = Field(min_length=1)
    current_script: str | None = None
    renderer: str = "matplotlib"
    output_format: str = "png"
    topic: str = "general"


@router.get("/{visual_id}/{filename}")
async def get_visual_file(visual_id: str, filename: str) -> Response:
    """Stream generated visualization artifact (PNG, SVG, Mermaid) with public caching."""
    settings = get_settings()
    visual_dir = (settings.storage_path / "visuals" / visual_id).resolve()
    target_file = (visual_dir / filename).resolve()

    # Guard against directory traversal
    try:
        target_file.relative_to(visual_dir)
    except ValueError:
        raise AppError(403, "FORBIDDEN", "Invalid visual artifact path.")

    if not target_file.exists() or not target_file.is_file():
        raise AppError(404, "NOT_FOUND", "Visual artifact not found.")

    content = target_file.read_bytes()
    mime, _ = mimetypes.guess_type(str(target_file))
    if target_file.suffix == ".svg":
        mime = "image/svg+xml"
    elif target_file.suffix == ".mermaid":
        mime = "text/plain"
    elif not mime:
        mime = "image/png"

    return Response(
        content=content,
        media_type=mime,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=86400, immutable",
        },
    )


@router.post("/render")
async def render_custom_visual(spec: dict) -> dict:
    """Execute and render a visualization specification."""
    res = await visual_intelligence_engine.render_visual(spec)
    return ok_envelope(res)
