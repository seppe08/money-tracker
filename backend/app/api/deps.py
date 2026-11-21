from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenError, decode_token
from app.db.session import get_db
from app.models import Transaction, User

bearer_scheme = HTTPBearer(
    auto_error=False,
    description="JWT access token issued by POST /api/v1/auth/login",
)

DbSession = Annotated[AsyncSession, Depends(get_db)]


def unauthorized_error(detail: str = "Could not validate credentials.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
) -> User:
    """Guard for protected routes.

    Verifies the access token's signature, expiry, issuer, audience, and type,
    then confirms the user still exists, is active, and has not revoked tokens
    via a `token_version` bump (logout-all / security response).
    """
    if credentials is None:
        raise unauthorized_error()

    try:
        claims = decode_token(credentials.credentials, expected_type="access")
        user_id = UUID(str(claims["sub"]))
    except (TokenError, KeyError, ValueError) as exc:
        raise unauthorized_error() from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active or claims.get("ver") != user.token_version:
        raise unauthorized_error()

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_owned_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Transaction:
    """Load a transaction and enforce ownership.

    Ownership always comes from the verified token, never from a client-sent
    user id. 403 is returned for another user's record (rather than silently
    listing it) to make the authorization failure explicit.
    """
    transaction = await db.get(Transaction, transaction_id)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )

    if transaction.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this transaction.",
        )

    return transaction
