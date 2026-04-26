"""
Shared pytest fixtures for ai-service tests.

Settings (Pydantic BaseSettings) requires supabase_url and
supabase_service_role_key at import time. Production Code paths set these via
.env or Railway env. Tests don't have those, so we seed dummy values before
any module imports `get_settings()`.

Without this conftest, every test that transitively imports a module touching
get_settings() fails with `pydantic ValidationError: supabase_url Field required`.
This conftest fixed 11 silent failures in test_conflict_mediation_block (Apr 26).
"""

from __future__ import annotations

import os

# Seed before any test module is imported.
os.environ.setdefault("SUPABASE_URL", "http://test.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("VOYAGE_API_KEY", "test-voyage-key")
