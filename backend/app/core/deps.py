"""FastAPI authentication, RBAC, CSRF, and consent isolation dependencies."""

from collections.abc import Callable
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.exceptions import AppError
from app.core.security import decode_access_token, verify_csrf_tokens
from app.models.auth import AuthSession, DoctorPatientLink, User

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncSession:
    """Provide an async SQLAlchemy session."""
    async for session in get_db_session():
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate Bearer JWT and verify the backing session is active and unrevoked."""
    if not credentials or not credentials.credentials:
        raise AppError(401, "AUTH_INVALID_CREDENTIALS", "Authentication credentials required.")

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "AUTH_TOKEN_EXPIRED", "Access token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(401, "AUTH_INVALID_CREDENTIALS", "Invalid authentication token.") from exc

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise AppError(401, "AUTH_INVALID_CREDENTIALS", "Malformed token payload.")

    session_row = await db.get(AuthSession, session_id)
    if not session_row or session_row.revoked_at is not None:
        raise AppError(401, "AUTH_SESSION_REVOKED", "Session is no longer active.")

    user = await db.get(User, user_id)
    if not user or not user.is_active or user.deleted_at is not None:
        raise AppError(401, "AUTH_INVALID_CREDENTIALS", "User account is inactive or missing.")

    return user


def require_role(*allowed_roles: str) -> Callable[..., User]:
    """Dependency factory enforcing user.role membership."""

    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise AppError(
                403,
                "RBAC_FORBIDDEN",
                "You do not have permission to perform this action.",
            )
        return current_user

    return _guard


async def verify_csrf(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> None:
    """Double-submit CSRF check (bypassed in SYNTHETIC_PROTOTYPE_MODE for frictionless demo use)."""
    settings = get_settings()
    if settings.SYNTHETIC_PROTOTYPE_MODE:
        return
    csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME)
    refresh_cookie = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if refresh_cookie or csrf_cookie:
        if not verify_csrf_tokens(csrf_cookie, x_csrf_token):
            raise AppError(403, "CSRF_INVALID", "Missing or invalid CSRF token.")


async def require_doctor_patient_link(
    db: AsyncSession,
    doctor_id: str,
    patient_id: str,
) -> DoctorPatientLink:
    """Verify explicit active consent linking a doctor and patient."""
    stmt = select(DoctorPatientLink).where(
        DoctorPatientLink.doctor_id == doctor_id,
        DoctorPatientLink.patient_id == patient_id,
        DoctorPatientLink.consent_status == "active",
        DoctorPatientLink.revoked_at.is_(None),
    )
    link = (await db.execute(stmt)).scalar_one_or_none()
    if not link:
        raise AppError(
            403,
            "CONSENT_REQUIRED",
            "Active patient consent link is required to access this patient record.",
        )
    return link
