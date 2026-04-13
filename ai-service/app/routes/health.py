"""
Health check endpoints for Railway deployment monitoring.
"""

import os

from fastapi import APIRouter
from app.config import get_settings
from app.db.supabase import get_db_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Primary health check — Railway uses this to confirm service is running."""
    settings = get_settings()
    db_status = await get_db_status()

    return {
        "status": "ok",
        "service": "tomo-ai",
        "environment": settings.environment,
        "version": "1.0.0",
        "database": db_status,
        "langsmith": bool(settings.langsmith_api_key),
    }


@router.get("/health/config")
async def config_check():
    """V2 architecture config diagnostic — shows active classifier, agent version, etc."""
    return {
        "classifier_version": os.environ.get("CLASSIFIER_VERSION", "NOT_SET"),
        "agent_version": os.environ.get("AGENT_VERSION", "NOT_SET"),
        "sonnet_shadow": os.environ.get("SONNET_SHADOW", "NOT_SET"),
        "classifier_version_repr": repr(os.environ.get("CLASSIFIER_VERSION", "")),
        "agent_version_repr": repr(os.environ.get("AGENT_VERSION", "")),
        "v2_active": os.environ.get("CLASSIFIER_VERSION", "") == "sonnet",
    }


@router.get("/")
async def root():
    """Root endpoint — redirects to health."""
    return {"service": "tomo-ai", "status": "ok", "docs": "/docs"}
