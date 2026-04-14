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


@router.get("/health/chat-test")
async def chat_test():
    """Diagnostic: run a chat through the full supervisor and return the result or error traceback."""
    import traceback
    try:
        from app.graph.supervisor import run_supervisor
        result = await run_supervisor(
            user_id="d31a0590-3e2c-4749-acb8-1da7c644d554",
            session_id="health-chat-test",
            message="I want to plan a session",
            active_tab="Chat",
            timezone="Asia/Riyadh",
        )
        import json
        resp = result.get("final_response", "")
        structured = json.loads(resp) if resp else {}
        return {
            "status": "ok",
            "headline": structured.get("headline", ""),
            "cards": [c.get("type") for c in structured.get("cards", [])],
            "flow_pattern": result.get("_flow_pattern"),
            "agent": result.get("selected_agent"),
            "intent": result.get("intent_id"),
            "cost": result.get("total_cost_usd", 0),
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
