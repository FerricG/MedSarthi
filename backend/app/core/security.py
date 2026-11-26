"""Security helpers: Argon2id password hashing, JWT, HttpOnly refresh tokens, CSRF, and SHA-256."""

from datetime import UTC, datetime, timedelta
import hashlib
import secrets
from typing import Any
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Response
import jwt
from app.core.config import get_settings

_password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against an Argon2id hash."""
    try:
        return _password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def sha256_hex(value: str) -> str:
    """Compute canonical SHA-256 hex digest (used for refresh tokens and immutable input hashes)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_opaque_token(nbytes: int = 32) -> str:
    """Generate a URL-safe cryptographically random token."""
    return secrets.token_urlsafe(nbytes)


def create_access_token(
    user_id: str,
    role: str,
    session_id: str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Mint a short-lived signed JWT access token."""
    settings = get_settings()
    now = datetime.now(UTC)
    exp = now + timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "sid": session_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access JWT."""
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["sub", "role", "exp", "iat"]},
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Invalid token type")
    return payload


def set_auth_cookies(response: Response, refresh_token: str, csrf_token: str) -> None:
    """Set HttpOnly rotating refresh cookie and readable CSRF double-submit cookie."""
    settings = get_settings()
    max_age = settings.JWT_REFRESH_EXPIRE_DAYS * 24 * 60 * 60
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=max_age,
        path="/api/auth",
    )
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    """Clear refresh and CSRF cookies on logout."""
    settings = get_settings()
    response.delete_cookie(key=settings.REFRESH_COOKIE_NAME, path="/api/auth")
    response.delete_cookie(key=settings.CSRF_COOKIE_NAME, path="/")


def verify_csrf_tokens(cookie_token: str | None, header_token: str | None) -> bool:
    """Constant-time double-submit CSRF verification."""
    if not cookie_token or not header_token:
        return False
    return secrets.compare_digest(cookie_token, header_token)
