from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres connection (Supabase). Use the async driver form:
    #   postgresql+asyncpg://user:pass@host:5432/postgres
    database_url: str = "sqlite+aiosqlite:///./dev.db"

    # Auth token verification.
    # Preferred: set SUPABASE_URL so tokens are verified against the project's
    # public JWKS (ES256 — the default for modern Supabase projects).
    # Fallback (tests / local): HS256 with a shared secret.
    supabase_url: str = ""
    supabase_jwt_secret: str = "dev-secret-change-me"
    jwt_audience: str = "authenticated"

    @property
    def jwks_url(self) -> str:
        base = self.supabase_url.rstrip("/")
        return f"{base}/auth/v1/.well-known/jwks.json" if base else ""

    # Comma-separated list of allowed CORS origins.
    allowed_origins: str = "http://localhost:5173"

    # Max upload size for imported files, in bytes (5 MB).
    max_upload_bytes: int = 5 * 1024 * 1024

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
