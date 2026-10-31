from functools import lru_cache

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"
    database_url: str = "sqlite:///./saathi-local.db"
    jwt_secret: SecretStr = SecretStr("local-only-insecure-secret-change-me")
    jwt_issuer: str = "paytm-saathi"
    access_token_minutes: int = Field(default=15, ge=5, le=60)
    redis_url: str = "redis://localhost:6379/0"
    provider_mode: str = "sandbox"
    supabase_url: str = ""
    supabase_anon_key: SecretStr = SecretStr("")
    ai_api_base_url: str = ""
    ai_api_key: SecretStr = SecretStr("")
    ai_model: str = ""
    qwen_api_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    qwen_api_key: SecretStr = SecretStr("")
    qwen_model: str = "qwen-plus"
    telegram_bot_token: SecretStr = SecretStr("")
    telegram_bot_username: str = ""
    telegram_webhook_url: str = ""
    telegram_webhook_secret: SecretStr = SecretStr("")
    ai_data_consent_organization_ids: list[str] = Field(default_factory=list)
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    @property
    def assistant_configured(self) -> bool:
        return bool(self.ai_api_base_url.strip() and self.ai_api_key.get_secret_value() and self.ai_model.strip())

    @property
    def telegram_ai_provider(self) -> tuple[str, str, str] | None:
        if self.qwen_api_key.get_secret_value().strip():
            return self.qwen_api_base_url.rstrip("/"), self.qwen_api_key.get_secret_value(), self.qwen_model.strip()
        if self.assistant_configured:
            return self.ai_api_base_url.rstrip("/"), self.ai_api_key.get_secret_value(), self.ai_model.strip()
        return None

    @model_validator(mode="after")
    def enforce_production_secrets(self):
        if self.app_env == "production":
            secret = self.jwt_secret.get_secret_value()
            if len(secret) < 32 or secret == "local-only-insecure-secret-change-me":
                raise ValueError("JWT_SECRET must be a unique random value of at least 32 characters")
            if not self.database_url.startswith("postgresql+"):
                raise ValueError("Production requires PostgreSQL; SQLite is local/test only")
            if any("localhost" in origin or "127.0.0.1" in origin for origin in self.cors_origins):
                raise ValueError("Production CORS origins must not include localhost")
        if self.provider_mode != "sandbox":
            raise ValueError("Live mode is disabled until an authorized production provider adapter is verified")
        if self.ai_api_base_url and not self.ai_api_base_url.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise ValueError("AI_API_BASE_URL must use HTTPS outside local development")
        if self.qwen_api_base_url and not self.qwen_api_base_url.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise ValueError("QWEN_API_BASE_URL must use HTTPS outside local development")
        if self.supabase_url and not self.supabase_url.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise ValueError("SUPABASE_URL must use HTTPS outside local development")
        if self.telegram_webhook_url and not self.telegram_webhook_url.startswith("https://"):
            raise ValueError("TELEGRAM_WEBHOOK_URL must use HTTPS")
        if self.telegram_webhook_url and (not self.telegram_bot_token.get_secret_value() or len(self.telegram_webhook_secret.get_secret_value()) < 32):
            raise ValueError("Telegram webhooks require a bot token and a secret of at least 32 characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
