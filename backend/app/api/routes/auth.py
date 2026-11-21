from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, DbSession, unauthorized_error
from app.core.rate_limit import auth_rate_limiter
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
)
from app.schemas.user import UserRead
from app.services import auth as auth_service
from app.services.auth import EmailAlreadyRegisteredError, InvalidRefreshTokenError

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(auth_rate_limiter)],
)


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(payload: RegisterRequest, db: DbSession) -> AuthResponse:
    try:
        user = await auth_service.register_user(
            db=db,
            email=payload.normalized_email(),
            password=payload.password,
            display_name=payload.display_name,
        )
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from exc

    pair = await auth_service.issue_token_pair(db=db, user=user)
    return AuthResponse(**pair.model_dump(), user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DbSession) -> AuthResponse:
    user = await auth_service.authenticate_user(
        db=db,
        email=payload.normalized_email(),
        password=payload.password,
    )
    if user is None:
        # Same response for unknown email and wrong password: do not let the
        # endpoint disclose which part was incorrect.
        raise unauthorized_error("Invalid email or password.")

    pair = await auth_service.issue_token_pair(db=db, user=user)
    return AuthResponse(**pair.model_dump(), user=UserRead.model_validate(user))


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: DbSession) -> TokenPair:
    try:
        return await auth_service.rotate_refresh_token(db=db, refresh_token=payload.refresh_token)
    except InvalidRefreshTokenError as exc:
        raise unauthorized_error("Invalid or expired refresh token.") from exc


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, db: DbSession) -> None:
    await auth_service.revoke_refresh_token(db=db, refresh_token=payload.refresh_token)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(current_user: CurrentUser, db: DbSession) -> None:
    await auth_service.revoke_all_sessions(db=db, user=current_user)
