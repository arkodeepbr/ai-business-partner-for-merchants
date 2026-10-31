from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env.local", override=False)
load_dotenv(PROJECT_ROOT / ".env", override=False)


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "sqlite:///./merchant_partner.db"
    database_url_unpooled: str = ""
    redis_url: str = "redis://localhost:6379/0"
    session_signing_key: str = ""
    session_ttl_minutes: int = 60
    google_oauth_client_id: str = ""
    allowed_origins: str = "http://localhost:8081"
    model_provider: str = "ollama"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = ""
    cloudflare_model: str = "@cf/qwen/qwen3-30b-a3b-fp8"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:0.6b"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    elevenlabs_model: str = "eleven_multilingual_v2"

    # Compose injects deployment secrets as environment variables. For local backend
    # runs, also load the root project env files (ElevenLabs onboarding writes .env.local).
    model_config = SettingsConfigDict(
        env_file=(".env", str(PROJECT_ROOT / ".env"), str(PROJECT_ROOT / ".env.local")),
        extra="ignore",
    )

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        # Most hosted Postgres dashboards provide a plain postgresql:// URL,
        # while this project installs psycopg v3 rather than psycopg2.
        return self._normalize_database_url(self.database_url)

    @property
    def sqlalchemy_migration_database_url(self) -> str:
        # Neon migrations need a direct (non-PgBouncer) connection. Fall back
        # to DATABASE_URL for local databases and providers with one endpoint.
        return self._normalize_database_url(self.database_url_unpooled or self.database_url)

    @staticmethod
    def _normalize_database_url(url: str) -> str:
        if url.startswith("postgres://"):
            return "postgresql+psycopg://" + url.removeprefix("postgres://")
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url.removeprefix("postgresql://")
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
