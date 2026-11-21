from functools import lru_cache
from typing import Annotated, Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["development", "test", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

# Values that must never reach a production deployment. The length check alone
# would accept these, so they are rejected explicitly.
_PLACEHOLDER_SECRETS = {
    "changeme",
    "change-me",
    "secret",
    "development",
    "test",
    "password",
}


class Settings(BaseSettings):
    """Application settings, loaded from environment variables and `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Money Tracker API"
    version: str = "1.0.0"
    environment: Environment = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # Comma-separated in the environment, e.g.
    # CORS_ORIGINS=http://localhost:8081,http://localhost:19006
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:8081",
        "http://localhost:19006",
    ]
    # Comma-separated host names accepted by TrustedHostMiddleware. "*" is only
    # allowed outside production.
    trusted_hosts: Annotated[list[str], NoDecode] = ["*"]

    database_url: str = "sqlite+aiosqlite:///./money_tracker.db"
    database_echo: bool = False
    database_pool_size: int = 5
    database_max_overflow: int = 10
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
    refresh_session_retention_days: int = 7

    # Per-IP request cap for the unauthenticated auth endpoints.
    auth_rate_limit_requests: int = 10
    auth_rate_limit_window_seconds: int = 60
    # Bounds the in-process limiter's memory if an attacker rotates source IPs.
    auth_rate_limit_max_keys: int = 10_000
    # Enable only when the app sits behind a trusted reverse proxy that sets
    # X-Forwarded-For. Otherwise clients could spoof their rate-limit key.
    trust_forwarded_for: bool = False

    # Request hardening.
    max_request_body_bytes: int = 1_000_000
    security_headers_enabled: bool = True
    hsts_enabled: bool = False
    hsts_max_age_seconds: int = 31_536_000

    log_level: LogLevel = "INFO"
    log_json: bool = False

    @field_validator("cors_origins", "trusted_hosts", mode="before")
    @classmethod
    def split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def normalize_origins(cls, value: list[str]) -> list[str]:
        return [origin.rstrip("/") for origin in value]

    @model_validator(mode="after")
    def validate_jwt_secret(self) -> Settings:
        secret = self.jwt_secret.get_secret_value()
        if len(secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters long")
        if self.is_production and secret.lower() in _PLACEHOLDER_SECRETS:
            raise ValueError("JWT_SECRET must not be a placeholder value in production")
        return self

    @model_validator(mode="after")
    def validate_production_hardening(self) -> Settings:
        if not self.is_production:
            return self

        if self.debug:
            raise ValueError("DEBUG must be false in production")
        if "*" in self.cors_origins:
            raise ValueError("CORS_ORIGINS must not contain '*' in production")
        if not self.cors_origins:
            raise ValueError("CORS_ORIGINS must list at least one origin in production")
        if "*" in self.trusted_hosts:
            raise ValueError("TRUSTED_HOSTS must list explicit hosts in production")
        if self.create_tables_on_startup:
            raise ValueError("CREATE_TABLES_ON_STARTUP must be false in production; run migrations")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_test(self) -> bool:
        return self.environment == "test"

    @property
    def access_token_expire_seconds(self) -> int:
        return self.access_token_expire_minutes * 60

    @property
    def docs_enabled(self) -> bool:
        return not self.is_production

    @property
    def uses_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
