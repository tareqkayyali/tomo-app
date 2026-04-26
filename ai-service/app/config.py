"""
Tomo AI Service — Configuration
Loads environment variables with validation via Pydantic Settings.

Note: .env is loaded explicitly via python-dotenv before Settings() to ensure
env vars are available regardless of pydantic-settings version quirks.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from functools import lru_cache

# Explicitly load .env before Settings is created
# override=True ensures .env values take precedence over any empty/stale env vars
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=True)


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
    supabase_db_url: str = ""  # PostgreSQL connection string (pooler port 6543 or direct port 5432)

    # TypeScript Backend (for write tool bridge)
    ts_backend_url: str = "http://tomo-app.railway.internal:8080"
    ts_backend_service_key: str = ""  # Service-to-service auth

    # Zep Memory
    zep_api_key: str = ""
    zep_base_url: str = "http://tomo-zep.railway.internal:8000"

    # Service
    port: int = 8000
    environment: str = "development"
    log_level: str = "info"
    sentry_dsn: str = ""

    # Feature flags
    flow_controller_enabled: bool = True
    scheduling_capsule_enabled: bool = False
    flow_rag_enabled: bool = True
    flow_step_text_gen_enabled: bool = True
    # ACWR decommissioning (April 2026): when False, ACWR is stripped from all
    # AI-facing surfaces (system prompts, brief templates, tool outputs) and
    # only survives as a silent input to CCRS's >2.0 hard-cap safety net.
    # Flip to True to restore pre-decommission behaviour (rollback path).
    # ACWR still computes on the snapshot for coach/analyst transparency.
    acwr_ai_enabled: bool = False

    # Auto-heal loop (Phase 0 scaffolding — loop inert until Phase 5).
    # enabled=False means no fix generation, no branch creation, no auto-apply.
    # Budget caps total daily spend on eval + fix-generation Anthropic calls.
    auto_heal_enabled: bool = False
    auto_heal_budget_daily_usd: float = 1.00

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
