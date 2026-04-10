"""
Tomo AI Service — Configuration
Loads environment variables with validation via Pydantic Settings.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Keys
    anthropic_api_key: str
    voyage_api_key: str = ""
    cohere_api_key: str = ""
    langsmith_api_key: str = ""

    # LangSmith
    langchain_tracing_v2: bool = True
    langchain_project: str = "tomo-ai-staging"
    langchain_endpoint: str = "https://api.smith.langchain.com"

    # Database (Supabase)
    supabase_url: str
    supabase_service_role_key: str
    supabase_db_url: str  # PostgreSQL connection string (pooler port 6543 or direct port 5432)

    # Zep Memory
    zep_api_key: str = ""
    zep_base_url: str = "http://tomo-zep.railway.internal:8000"

    # Service
    port: int = 8000
    environment: str = "development"
    log_level: str = "info"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
