from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.rate_limit import auth_rate_limiter
from app.schemas.user import (
    AccountDeleteRequest,
    PasswordChangeRequest,
    UserRead,
    UserUpdate,
)
from app.services import auth as auth_service
from app.services.auth import InvalidPasswordError, PasswordReuseError

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead)
async def update_current_user(
    payload: UserUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> UserRead:
    user = await auth_service.update_profile(
        db=db,
        user=current_user,
        display_name=payload.display_name,
        currency=payload.currency,
    )
    return UserRead.model_validate(user)


@router.post(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(auth_rate_limiter)],
)
async def change_password(
    payload: PasswordChangeRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    try:
        await auth_service.change_password(
            db=db,
            user=current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except InvalidPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        ) from exc
    except PasswordReuseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        ) from exc


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(auth_rate_limiter)],
)
async def delete_current_user(
    payload: AccountDeleteRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    try:
        await auth_service.delete_account(
            db=db,
            user=current_user,
            password=payload.password,
        )
    except InvalidPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect.",
        ) from exc
