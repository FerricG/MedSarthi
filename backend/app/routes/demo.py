"""One-click synthetic Demo Mode login endpoint (enabled only in SYNTHETIC_PROTOTYPE_MODE)."""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.deps import get_db
from app.core.exceptions import AppError
from app.models.auth import User
from app.routes.auth import _issue_session_tokens, _load_role_context, _serialize_user
from app.schemas.clinical import DemoLoginRequest
from app.schemas.common import ok_envelope
from app.seeds.seed_data import DEMO_DOCTOR_EMAIL, DEMO_PATIENT_EMAIL, seed_database

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/login")
async def demo_login(
    payload: DemoLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Sign in as the synthetic Demo Patient or Demo Doctor (auto-seeding if missing)."""
    settings = get_settings()
    if not settings.SYNTHETIC_PROTOTYPE_MODE:
        raise AppError(
            403,
            "RBAC_FORBIDDEN",
            "Demo login is only enabled when SYNTHETIC_PROTOTYPE_MODE is true.",
        )

    target_email = DEMO_PATIENT_EMAIL if payload.role == "patient" else DEMO_DOCTOR_EMAIL
    user = (
        await db.execute(
            select(User).where(User.email == target_email, User.deleted_at.is_(None))
        )
    ).scalar_one_or_none()

    if not user:
        await seed_database(db)
        user = (
            await db.execute(
                select(User).where(User.email == target_email, User.deleted_at.is_(None))
            )
        ).scalar_one_or_none()

    if not user or not user.is_active:
        raise AppError(404, "NOT_FOUND", "Synthetic demo account unavailable.")

    access_token, csrf_token = await _issue_session_tokens(db, user, request, response)
    await db.commit()

    context = await _load_role_context(db, user)
    return ok_envelope(
        {
            "user": _serialize_user(user),
            "access_token": access_token,
            "csrf_token": csrf_token,
            "onboarding_required": not context.get("onboarding_completed", False),
            **context,
        }
    )
