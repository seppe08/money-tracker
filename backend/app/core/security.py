"""Password hashing and JWT creation/validation.

Design notes:
- Passwords use Argon2id (via pwdlib's recommended configuration).
- JWTs are HS256-signed with a 32+ character secret from the environment and
  always carry `iss`, `aud`, `iat`, `nbf`, `exp`, `jti` and a `typ` claim so a
  refresh token can never be accepted where an access token is expected.
- Refresh JWTs additionally carry `sid`, the id of their database session row,
  which is what makes rotation and revocation possible.
"""

import hashlib
import uuid
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

TokenType = Literal["access", "refresh"]
JWT_ALGORITHM = settings.jwt_algorithm

password_hasher = PasswordHash.recommended()

# Verifying a dummy hash when no user exists keeps login timing similar for
# unknown emails, so latency does not reveal which accounts are registered.
_DUMMY_HASH = password_hasher.hash("dummy-password-for-timing-equalisation")


class TokenError(Exception):
    """Raised when a JWT is malformed, expired, or fails claim validation."""


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password, password_hash)
    except Exception:  # noqa: BLE001 - a corrupt hash must behave like a mismatch
        return False


def verify_dummy_password(password: str) -> None:
    with suppress(Exception):
        password_hasher.verify(password, _DUMMY_HASH)


def hash_token(token: str) -> str:
    """Hash a refresh token for storage; the raw token is never persisted."""
    return hashlib.sha256(token.encode()).hexdigest()


def _base_claims(
    *, user_id: UUID, token_version: int, token_type: TokenType, expires_at: datetime
) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sub": str(user_id),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "nbf": now,
        "exp": expires_at,
        "jti": str(uuid.uuid4()),
        "typ": token_type,
        "ver": token_version,
    }


def create_access_token(user_id: UUID, token_version: int) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    claims = _base_claims(
        user_id=user_id,
        token_version=token_version,
        token_type="access",
        expires_at=expires_at,
    )
    return jwt.encode(
        claims, settings.jwt_secret.get_secret_value(), algorithm=JWT_ALGORITHM
    ), expires_at


def create_refresh_token(
    *, user_id: UUID, token_version: int, session_id: UUID, jti: str
) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    claims = _base_claims(
        user_id=user_id,
        token_version=token_version,
        token_type="refresh",
        expires_at=expires_at,
    )
    claims["jti"] = jti
    claims["sid"] = str(session_id)
    return jwt.encode(
        claims, settings.jwt_secret.get_secret_value(), algorithm=JWT_ALGORITHM
    ), expires_at


def decode_token(token: str, *, expected_type: TokenType) -> dict[str, Any]:
    """Validate signature, expiry, issuer, audience, and token type."""
    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[JWT_ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={
                "require": ["exp", "iat", "nbf", "sub", "iss", "aud", "jti", "typ"],
                "verify_exp": True,
                "verify_iat": True,
                "verify_nbf": True,
                "verify_aud": True,
                "verify_iss": True,
            },
        )
    except jwt.InvalidTokenError as exc:
        # Deliberately do not surface the underlying reason to callers.
        raise TokenError("Invalid or expired token") from exc

    if claims.get("typ") != expected_type:
        raise TokenError("Unexpected token type")
    return claims


def as_utc(value: datetime) -> datetime:
    """SQLite drops timezone info; normalise before comparing datetimes."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
