"""Reusable authentication service used by the auth routes.

Keeping registration, credential checks, token issuance, rotation, and
revocation here (instead of in route handlers) makes each piece testable and
lets future flows (password reset, email verification) reuse the same rules.
"""

import hmac
import uuid
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from sqlalchemy import delete, or_, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    TokenError,
    as_utc,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_dummy_password,
    verify_password,
)
from app.db.base import utcnow
from app.models import RefreshSession, User
from app.schemas.auth import TokenPair


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidRefreshTokenError(Exception):
    pass


class InvalidPasswordError(Exception):
    pass


class PasswordReuseError(Exception):
    pass


async def register_user(*, db: AsyncSession, email: str, password: str, display_name: str) -> User:
    normalized_email = email.strip().lower()
    existing = await db.scalar(select(User.id).where(User.email == normalized_email))
    if existing is not None:
        raise EmailAlreadyRegisteredError

    user = User(
        email=normalized_email,
        password_hash=hash_password(password),
        display_name=display_name.strip(),
    )
    db.add(user)

    try:
        await db.commit()
    except IntegrityError as exc:
        # Handles the race where two requests register the same email at once.
        await db.rollback()
        raise EmailAlreadyRegisteredError from exc

    await db.refresh(user)
    return user


async def authenticate_user(*, db: AsyncSession, email: str, password: str) -> User | None:
    user = await db.scalar(select(User).where(User.email == email.strip().lower()))

    if user is None:
        verify_dummy_password(password)
        return None

    if not verify_password(password, user.password_hash):
        return None

    if not user.is_active:
        return None

    return user


async def update_profile(
    *,
    db: AsyncSession,
    user: User,
    display_name: str | None = None,
    currency: str | None = None,
) -> User:
    if display_name is not None:
        user.display_name = display_name.strip()
    if currency is not None:
        user.currency = currency.upper()
    await db.commit()
    await db.refresh(user)
    return user


async def change_password(
    *,
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> None:
    """Change the password and invalidate every existing session.

    Bumping `token_version` kills access tokens immediately; revoking refresh
    sessions stops new ones from being minted. The client must sign in again.
    """
    if not verify_password(current_password, user.password_hash):
        raise InvalidPasswordError
    if verify_password(new_password, user.password_hash):
        raise PasswordReuseError

    user.password_hash = hash_password(new_password)
    user.token_version += 1
    await db.execute(
        update(RefreshSession)
        .where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow())
    )
    await db.commit()


async def delete_account(*, db: AsyncSession, user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise InvalidPasswordError
    await db.delete(user)
    await db.commit()


def _build_token_material(user: User, *, family_id: UUID) -> tuple[TokenPair, RefreshSession]:
    session_id = uuid.uuid4()
    jti = str(uuid.uuid4())

    access_token, _ = create_access_token(user.id, user.token_version)
    refresh_token, refresh_expires_at = create_refresh_token(
        user_id=user.id,
        token_version=user.token_version,
        session_id=session_id,
        jti=jti,
    )

    session = RefreshSession(
        id=session_id,
        user_id=user.id,
        jti=jti,
        family_id=family_id,
        token_hash=hash_token(refresh_token),
        expires_at=refresh_expires_at,
    )
    pair = TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_seconds,
    )
    return pair, session


async def _prune_sessions(*, db: AsyncSession, user_id: UUID) -> None:
    """Remove expired and long-revoked rows so the table does not grow forever."""
    now = utcnow()
    revoked_cutoff = now - timedelta(days=settings.refresh_session_retention_days)
    await db.execute(
        delete(RefreshSession)
        .where(
            RefreshSession.user_id == user_id,
            or_(
                RefreshSession.expires_at < now,
                RefreshSession.revoked_at < revoked_cutoff,
            ),
        )
        # SQLite returns naive datetimes; evaluating the criteria against the
        # identity map would compare naive and aware values.
        .execution_options(synchronize_session=False)
    )


async def issue_token_pair(*, db: AsyncSession, user: User) -> TokenPair:
    pair, session = _build_token_material(user, family_id=uuid.uuid4())
    db.add(session)
    await _prune_sessions(db=db, user_id=user.id)
    await db.commit()
    return pair


def _decode_refresh_token(refresh_token: str) -> tuple[dict, UUID, UUID]:
    try:
        claims = decode_token(refresh_token, expected_type="refresh")
        return claims, UUID(str(claims["sub"])), UUID(str(claims["sid"]))
    except (TokenError, KeyError, ValueError) as exc:
        raise InvalidRefreshTokenError from exc


async def rotate_refresh_token(*, db: AsyncSession, refresh_token: str) -> TokenPair:
    """Exchange a refresh token for a new pair, revoking the old token.

    Reusing an already-rotated token is treated as theft: the whole token
    family is revoked so the attacker and the legitimate client both lose
    access, forcing a fresh login.
    """
    claims, user_id, session_id = _decode_refresh_token(refresh_token)

    session = await db.get(RefreshSession, session_id)
    token_matches = (
        session is not None
        and session.jti == claims["jti"]
        and hmac.compare_digest(session.token_hash, hash_token(refresh_token))
    )
    if not token_matches or session is None:
        raise InvalidRefreshTokenError

    if session.revoked_at is not None:
        await _revoke_family(db=db, user_id=user_id, family_id=session.family_id)
        raise InvalidRefreshTokenError

    if as_utc(session.expires_at) <= datetime.now(UTC):
        raise InvalidRefreshTokenError

    user = await db.get(User, user_id)
    if user is None or not user.is_active or claims.get("ver") != user.token_version:
        raise InvalidRefreshTokenError

    pair, new_session = _build_token_material(user, family_id=session.family_id)

    # Atomically mark the old row as used. If two requests race with the same
    # token, only one update affects a row; the loser is treated as reuse.
    revoked = cast(
        CursorResult,
        await db.execute(
            update(RefreshSession)
            .where(
                RefreshSession.id == session.id,
                RefreshSession.revoked_at.is_(None),
            )
            .values(revoked_at=utcnow(), replaced_by_jti=new_session.jti)
        ),
    )
    if revoked.rowcount != 1:
        await _revoke_family(db=db, user_id=user_id, family_id=session.family_id)
        raise InvalidRefreshTokenError

    db.add(new_session)
    await _prune_sessions(db=db, user_id=user_id)
    await db.commit()
    return pair


async def revoke_refresh_token(*, db: AsyncSession, refresh_token: str) -> None:
    """Revoke one session. Invalid tokens are ignored so logout is idempotent."""
    try:
        claims, _, session_id = _decode_refresh_token(refresh_token)
    except InvalidRefreshTokenError:
        return

    session = await db.get(RefreshSession, session_id)
    if session is None or session.jti != claims.get("jti"):
        return
    if not hmac.compare_digest(session.token_hash, hash_token(refresh_token)):
        return
    if session.revoked_at is not None:
        return

    session.revoked_at = utcnow()
    await db.commit()


async def revoke_all_sessions(*, db: AsyncSession, user: User) -> None:
    """Invalidate every access and refresh token the user holds.

    Bumping `token_version` invalidates access tokens immediately (the guard
    compares the claim against the database) and revoking sessions stops
    refresh tokens from minting replacements.
    """
    user.token_version += 1
    await db.execute(
        update(RefreshSession)
        .where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow())
    )
    await db.commit()


async def _revoke_family(*, db: AsyncSession, user_id: UUID, family_id: UUID) -> None:
    await db.execute(
        update(RefreshSession)
        .where(
            RefreshSession.user_id == user_id,
            RefreshSession.family_id == family_id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow())
    )
    await db.commit()
