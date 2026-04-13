"""
Tomo AI Service — TypeScript Backend Bridge
HTTP client for write operations that must go through the TS event pipeline.

Read tools query Supabase directly via psycopg3.
Write tools proxy to existing TS API endpoints so the event pipeline
(emitEventSafe → processEvent → writeSnapshot → triggerRecommendationComputation)
fires correctly.

The bridge uses service-to-service auth with the Supabase service role key
in the Authorization header — the TS proxy.ts accepts this for internal calls.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger("tomo-ai.bridge")

# Reusable async client (connection pooling)
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    """Get or create the shared HTTP client."""
    global _client
    if _client is None or _client.is_closed:
        settings = get_settings()
        _client = httpx.AsyncClient(
            base_url=settings.ts_backend_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.ts_backend_service_key or settings.supabase_service_role_key}",
                "X-Tomo-Internal": "ai-service",
            },
            timeout=httpx.Timeout(30.0, connect=5.0),
        )
    return _client


async def close_bridge():
    """Close the HTTP client — call on shutdown."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


# ── Generic REST Helpers ───────────────────────────────────────────

async def bridge_post(
    path: str,
    body: dict[str, Any],
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """POST to TS backend. Returns parsed JSON response."""
    client = _get_client()
    headers = {}
    if user_id:
        headers["x-user-id"] = user_id

    try:
        resp = await client.post(path, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Bridge POST {path} → {e.response.status_code}: {e.response.text[:500]}")
        return {"error": f"TS backend returned {e.response.status_code}", "detail": e.response.text[:200]}
    except httpx.RequestError as e:
        logger.error(f"Bridge POST {path} connection error: {e}")
        return {"error": f"Connection to TS backend failed: {e}"}


async def bridge_put(
    path: str,
    body: dict[str, Any],
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """PUT to TS backend. Returns parsed JSON response."""
    client = _get_client()
    headers = {}
    if user_id:
        headers["x-user-id"] = user_id

    try:
        resp = await client.put(path, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Bridge PUT {path} → {e.response.status_code}: {e.response.text[:500]}")
        return {"error": f"TS backend returned {e.response.status_code}", "detail": e.response.text[:200]}
    except httpx.RequestError as e:
        logger.error(f"Bridge PUT {path} connection error: {e}")
        return {"error": f"Connection to TS backend failed: {e}"}


async def bridge_patch(
    path: str,
    body: dict[str, Any],
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """PATCH to TS backend. Returns parsed JSON response."""
    client = _get_client()
    headers = {}
    if user_id:
        headers["x-user-id"] = user_id

    try:
        resp = await client.patch(path, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Bridge PATCH {path} → {e.response.status_code}: {e.response.text[:500]}")
        return {"error": f"TS backend returned {e.response.status_code}", "detail": e.response.text[:200]}
    except httpx.RequestError as e:
        logger.error(f"Bridge PATCH {path} connection error: {e}")
        return {"error": f"Connection to TS backend failed: {e}"}


async def bridge_delete(
    path: str,
    body: Optional[dict[str, Any]] = None,
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """DELETE to TS backend. Supports optional JSON body. Returns parsed JSON response."""
    client = _get_client()
    headers = {}
    if user_id:
        headers["x-user-id"] = user_id

    try:
        kwargs: dict[str, Any] = {"headers": headers}
        if body is not None:
            kwargs["content"] = __import__("json").dumps(body).encode("utf-8")
        resp = await client.delete(path, **kwargs)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Bridge DELETE {path} → {e.response.status_code}: {e.response.text[:500]}")
        return {"error": f"TS backend returned {e.response.status_code}", "detail": e.response.text[:200]}
    except httpx.RequestError as e:
        logger.error(f"Bridge DELETE {path} connection error: {e}")
        return {"error": f"Connection to TS backend failed: {e}"}


async def bridge_get(
    path: str,
    params: Optional[dict[str, Any]] = None,
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """GET from TS backend. Returns parsed JSON response."""
    client = _get_client()
    headers = {}
    if user_id:
        headers["x-user-id"] = user_id

    try:
        resp = await client.get(path, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Bridge GET {path} → {e.response.status_code}: {e.response.text[:500]}")
        return {"error": f"TS backend returned {e.response.status_code}", "detail": e.response.text[:200]}
    except httpx.RequestError as e:
        logger.error(f"Bridge GET {path} connection error: {e}")
        return {"error": f"Connection to TS backend failed: {e}"}


# ── Write Action Execution ─────────────────────────────────────────

WRITE_ACTIONS: set[str] = {
    # Timeline writes
    "create_event", "update_event", "delete_event",
    # Output writes
    "log_check_in", "log_test_result", "rate_drill",
    "save_journal_pre", "save_journal_post",
    "create_test_session",
    # Settings writes
    "set_goal", "complete_goal", "delete_goal",
    "log_injury", "clear_injury", "flag_injury_concern",
    "log_nutrition", "log_sleep",
    "update_profile", "update_notification_preferences",
    # Mastery writes
    "add_career_entry", "update_career_entry",
    "add_verified_achievement", "set_recruitment_visibility",
    # Planning writes
    "propose_mode_change",
    "create_training_block", "update_block_phase", "override_session_load",
    "generate_integrated_weekly_plan",
    # Schedule writes
    "update_schedule_rules", "toggle_league_mode", "toggle_exam_period",
    "set_academic_priority_period", "set_academic_stress_level",
    # Recovery writes
    "trigger_deload_week", "log_recovery_session",
    # Integration writes
    "sync_wearable",
}

# Write actions that can execute without confirmation (capsule direct actions)
CAPSULE_DIRECT_ACTIONS: set[str] = {
    "log_check_in", "log_test_result", "rate_drill",
    "save_journal_pre", "save_journal_post",
    "update_profile", "complete_goal",
    "log_nutrition", "log_sleep",
    "sync_wearable",
}


def is_write_action(tool_name: str) -> bool:
    """Check if a tool name is a write action requiring confirmation."""
    return tool_name in WRITE_ACTIONS


def is_capsule_direct(tool_name: str) -> bool:
    """Check if a write action can execute without confirmation."""
    return tool_name in CAPSULE_DIRECT_ACTIONS
