from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

CURRENCY_PATTERN = r"^[A-Z]{3}$"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str
    currency: str
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    currency: str | None = Field(default=None, pattern=CURRENCY_PATTERN)

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Display name cannot be blank")
        return stripped

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class AccountDeleteRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
