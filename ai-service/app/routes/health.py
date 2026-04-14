"""
Health check endpoints for Railway deployment monitoring.

Endpoints:
  GET /health               — Primary health check (Railway uses this)
  GET /health/config        — v2 architecture env var diagnostic
  GET /health/errors        — Last N errors from the in-memory buffer
  GET /health/requests      — Last N requests from the in-memory buffer
  GET /health/debug         — Run a live chat turn with any user/message
  GET /health/chat-test     — Two-turn session test (hardcoded user)
  GET /                     — Root redirect
"""

import os

from fastapi import APIRouter, Query
from app.config import get_settings
from app.db.supabase import get_db_status
from app.core.error_buffer import get_errors, get_requests

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


@router.get("/health/errors")
async def get_recent_errors(limit: int = Query(default=20, le=100)):
    """
    Return the last N errors captured by the supervisor.
    Each entry includes: ts, request_id, user_id (truncated), session_id (truncated),
    node, message (truncated), intent_id, error, traceback.

    Use this to debug production crashes without Railway log access.
    """
    errors = get_errors(limit=limit)
    return {
        "count": len(errors),
        "limit": limit,
        "errors": errors,
    }


@router.get("/health/requests")
async def get_recent_requests(limit: int = Query(default=50, le=200)):
    """
    Return the last N requests processed by the supervisor.
    Each entry includes: ts, request_id, user_id (truncated), session_id (truncated),
    message (truncated), intent_id, agent, pattern, status, cost_usd, latency_ms.

    Use this to see what's flowing through the system in real time.
    """
    requests = get_requests(limit=limit)
    return {
        "count": len(requests),
        "limit": limit,
        "requests": requests,
    }


@router.get("/health/debug")
async def debug_chat(
    message: str = Query(default="hey tomo"),
    user_id: str = Query(default="d31a0590-3e2c-4749-acb8-1da7c644d554"),
    session_id: str = Query(default="debug-session"),
    active_tab: str = Query(default="Chat"),
    timezone: str = Query(default="Asia/Riyadh"),
):
    """
    Run a single chat turn with any user_id + message and return the full result.
    Includes _debug_error and _debug_traceback if the turn crashes.

    Usage:
      /health/debug?message=Build+me+a+session&user_id=REAL_USER_ID
    """
    import traceback
    import json

    try:
        from app.graph.supervisor import run_supervisor
        result = await run_supervisor(
            user_id=user_id,
            session_id=session_id,
            message=message,
            active_tab=active_tab,
            timezone=timezone,
        )
        response = json.loads(result.get("final_response", "{}"))
        return {
            "status": "ok",
            "intent_id": result.get("intent_id"),
            "selected_agent": result.get("selected_agent"),
            "flow_pattern": result.get("_flow_pattern"),
            "headline": response.get("headline", ""),
            "cards": [c.get("type") for c in response.get("cards", [])],
            "debug_error": response.get("_debug_error"),
            "debug_traceback": response.get("_debug_traceback"),
            "cost_usd": result.get("total_cost_usd", 0),
            "latency_ms": result.get("latency_ms", 0),
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


@router.get("/health/chat-test")
async def chat_test():
    """Diagnostic: run a chat through the full supervisor and return the result or error traceback."""
    import traceback
    import json
    from fastapi import Request

    try:
        from app.graph.supervisor import run_supervisor

        # Turn 1: greeting (fresh session — should work)
        result1 = await run_supervisor(
            user_id="d31a0590-3e2c-4749-acb8-1da7c644d554",
            session_id="health-chat-test-v2",
            message="hey tomo",
            active_tab="Chat",
            timezone="Asia/Riyadh",
        )
        r1 = json.loads(result1.get("final_response", "{}"))

        # Turn 2: plan session (WITH history from turn 1 — this is what crashes)
        result2 = await run_supervisor(
            user_id="d31a0590-3e2c-4749-acb8-1da7c644d554",
            session_id="health-chat-test-v2",
            message="I want to plan a session",
            active_tab="Chat",
            timezone="Asia/Riyadh",
        )
        r2 = json.loads(result2.get("final_response", "{}"))

        return {
            "status": "ok",
            "turn1": {
                "headline": r1.get("headline", ""),
                "debug_error": r1.get("_debug_error"),
            },
            "turn2": {
                "headline": r2.get("headline", ""),
                "cards": [c.get("type") for c in r2.get("cards", [])],
                "debug_error": r2.get("_debug_error"),
                "debug_traceback": r2.get("_debug_traceback"),
                "flow_pattern": result2.get("_flow_pattern"),
            },
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
