from functools import lru_cache
from typing import Annotated, Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["development", "test", "production"]


class Settings(BaseSettings):
    """Application settings, loaded from environment variables and `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Money Tracker API"
    version: str = "0.1.0"
    environment: Environment = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # Comma-separated in the environment, e.g.
    # CORS_ORIGINS=http://localhost:8081,http://localhost:19006
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:8081",
        "http://localhost:19006",
    ]

    database_url: str = "sqlite+aiosqlite:///./money_tracker.db"
    database_echo: bool = False
    create_tables_on_startup: bool = True

    # Authentication. JWT_SECRET is required (32+ characters) and has no
    # default so a misconfigured deployment fails fast instead of signing
    # tokens with a predictable key.
    jwt_secret: SecretStr = SecretStr("")
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "money-tracker-api"
    jwt_audience: str = "money-tracker-app"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # Per-IP request cap for the unauthenticated auth endpoints.
    auth_rate_limit_requests: int = 10
    auth_rate_limit_window_seconds: int = 60

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_jwt_secret(self) -> Settings:
        secret = self.jwt_secret.get_secret_value()
        if len(secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters long")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def access_token_expire_seconds(self) -> int:
        return self.access_token_expire_minutes * 60


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
