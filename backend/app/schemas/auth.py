from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserRead

# A tiny denylist catches the most obvious choices; the real defence is the
# 12-character minimum and Argon2id hashing.
_COMMON_PASSWORDS = {
    "123456789012",
    "password1234",
    "passwordpassword",
    "qwertyuiop12",
    "letmein12345",
    "iloveyou1234",
    "adminadmin12",
    "welcome12345",
}


def _validate_password_strength(value: str) -> str:
    if value.lower() in _COMMON_PASSWORDS:
        raise ValueError("Choose a less common password")
    if len(set(value)) < 4:
        raise ValueError("Password must contain more than a few distinct characters")
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Display name cannot be blank")
        return stripped

    def normalized_email(self) -> str:
        return str(self.email).strip().lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    def normalized_email(self) -> str:
        return str(self.email).strip().lower()


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 - OAuth token type, not a password
    # Access token lifetime in seconds, so clients can refresh proactively.
    expires_in: int


class AuthResponse(TokenPair):
    user: UserRead
