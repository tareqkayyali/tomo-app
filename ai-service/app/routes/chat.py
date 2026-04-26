"""
Tomo AI Service — Chat Endpoint
Receives messages from TypeScript proxy, processes via LangGraph supervisor.
SSE streaming format matches mobile app expectation: event: status/done/error.
"""

import json
import asyncio
import logging
import time
import traceback
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.graph.supervisor import run_supervisor
from app.core.debug_logger import log_app_error


logger = logging.getLogger("tomo-ai.chat")
router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    """Incoming chat message from TypeScript proxy."""

    message: str
    session_id: Optional[str] = None
    player_id: str
    active_tab: Optional[str] = "Chat"
    timezone: Optional[str] = "UTC"
    confirmed_action: Optional[dict] = None
    # Optional profile overrides — used only when the player's DB profile
    # is missing or incomplete (eval harness, smoke tests, freshly-
    # onboarded users before their first check-in). Production clients
    # should leave these unset so the DB remains the source of truth.
    sport: Optional[str] = None
    position: Optional[str] = None
    age_band: Optional[str] = None


def _profile_overrides_from(request: "ChatRequest") -> Optional[dict]:
    """Collect non-null profile overrides from a request. None when empty."""
    overrides = {
        k: v for k, v in {
            "sport": request.sport,
            "position": request.position,
            "age_band": request.age_band,
        }.items() if v
    }
    return overrides or None


class ChatResponse(BaseModel):
    """Response sent back to TypeScript proxy."""

    message: str
    structured: Optional[dict] = None
    session_id: str
    refresh_targets: list[str] = []
    pending_confirmation: Optional[dict] = None


async def generate_sse_events(request: ChatRequest, raw_request: Request):
    """
    Generate SSE events by executing the LangGraph supervisor graph.

    SSE format (matches mobile app):
      - event: status  → { status: "Processing..." }
      - event: done    → { message, structured, sessionId, refreshTargets, pendingConfirmation }
      - event: error   → { error: "..." }
    """
    t0 = time.time()
    trace_id = raw_request.headers.get("x-trace-id", "")
    request_id = raw_request.headers.get("x-request-id", "")

    try:
        # Status: thinking
        yield f"event: status\ndata: {json.dumps({'status': 'Thinking...'})}\n\n"

        # Execute the LangGraph supervisor
        result = await run_supervisor(
            user_id=request.player_id,
            session_id=request.session_id or f"session-{request.player_id}",
            message=request.message,
            active_tab=request.active_tab or "Chat",
            timezone=request.timezone or "UTC",
            confirmed_action=request.confirmed_action,
            profile_overrides=_profile_overrides_from(request),
        )

        # Extract response components from graph result
        final_response_raw = result.get("final_response", "")
        pending_write = result.get("pending_write_action")
        refresh_targets = result.get("_refresh_targets", [])

        # Parse structured response
        structured = None
        message_text = ""
        pending_confirmation = None

        if final_response_raw:
            try:
                structured = json.loads(final_response_raw)
                message_text = structured.get("body") or structured.get("headline") or "What's on your mind?"
            except (json.JSONDecodeError, TypeError):
                message_text = final_response_raw
                structured = {
                    "headline": "",
                    "cards": [{"type": "text_card", "body": final_response_raw}],
                    "chips": [],
                }

        # Build pending confirmation if write action detected or retry needed
        if pending_write and not result.get("write_confirmed"):
            # New write action awaiting first confirmation
            pending_confirmation = pending_write
        elif result.get("write_confirmed") and result.get("pending_write_action"):
            # Confirmed action failed — return pending action for retry
            # Mobile will attach it to the error message as confirmAction,
            # enabling the user to tap CONFIRM again instead of "Try again" text
            pending_confirmation = result.get("pending_write_action")

        # Extract context for mobile app parity (TS endpoint sends this)
        player_ctx = result.get("player_context")
        context_data = {}
        if player_ctx:
            context_data = {
                "ageBand": getattr(player_ctx, "age_band", None),
                "readinessScore": getattr(player_ctx, "readiness_score", None),
                "activeTab": getattr(player_ctx, "active_tab", "Chat"),
            }

        # Build response matching the mobile app format
        response = {
            "message": message_text,
            "structured": structured,
            "sessionId": request.session_id or f"session-{request.player_id}",
            "refreshTargets": refresh_targets,
            "pendingConfirmation": pending_confirmation,
            "context": context_data,
        }

        # Add telemetry in debug header. Consumed by the TS quality pipeline
        # in backend/services/quality/ — do not remove fields without updating
        # the AIServiceResponse type in backend/services/agents/aiServiceProxy.ts.
        telemetry = {
            "cost_usd": result.get("total_cost_usd", 0),
            "tokens": result.get("total_tokens", 0),
            "latency_ms": round((time.time() - t0) * 1000),
            "agent": result.get("selected_agent", "unknown"),
            "tools_called": len(result.get("tool_calls", [])),
            "validation_flags": result.get("validation_flags", []),
            "routing_confidence": result.get("routing_confidence", 0),
            "classification_layer": result.get("classification_layer"),
            "has_rag": bool(result.get("rag_context")),
            "flow_pattern": result.get("_flow_pattern"),
        }
        response["_telemetry"] = telemetry

        elapsed_ms = int((time.time() - t0) * 1000)
        logger.info(
            f"Chat complete | player={request.player_id} "
            f"| agent={result.get('selected_agent', '?')} "
            f"| tools={len(result.get('tool_calls', []))} "
            f"| cost=${result.get('total_cost_usd', 0):.6f} "
            f"| tokens={result.get('total_tokens', 0)} "
            f"| elapsed={elapsed_ms}ms"
        )

        yield f"event: done\ndata: {json.dumps(response, default=str)}\n\n"

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        asyncio.create_task(
            log_app_error(
                message=str(e)[:2000],
                error_type=type(e).__name__,
                error_code="ERR_PY_CHAT_SUPERVISOR_CRASH",
                stack_trace=traceback.format_exc(),
                user_id=request.player_id,
                session_id=request.session_id or f"session-{request.player_id}",
                trace_id=trace_id,
                request_id=request_id,
                endpoint="/api/v1/chat",
                severity="high",
            )
        )
        error_response = {
            "error": str(e),
            "trace_id": trace_id,
            "message": "Something tripped up on my end -- mind trying that again?",
        }
        yield f"event: error\ndata: {json.dumps(error_response)}\n\n"


@router.post("/chat")
async def chat_stream(request: ChatRequest, raw_request: Request):
    """
    SSE streaming chat endpoint.
    TypeScript proxy forwards non-capsule AI requests here.
    """
    if not request.message or not request.player_id:
        raise HTTPException(status_code=400, detail="message and player_id required")

    return StreamingResponse(
        generate_sse_events(request, raw_request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/sync")
async def chat_sync(request: ChatRequest):
    """
    Non-streaming chat endpoint for testing.
    Returns full response as JSON (no SSE).
    """
    if not request.message or not request.player_id:
        raise HTTPException(status_code=400, detail="message and player_id required")

    result = await run_supervisor(
        user_id=request.player_id,
        session_id=request.session_id or f"session-{request.player_id}",
        message=request.message,
        active_tab=request.active_tab or "Chat",
        timezone=request.timezone or "UTC",
        confirmed_action=request.confirmed_action,
        profile_overrides=_profile_overrides_from(request),
    )

    # Parse the final response
    final_response_raw = result.get("final_response", "")
    structured = None
    message_text = ""

    if final_response_raw:
        try:
            structured = json.loads(final_response_raw)
            message_text = structured.get("body") or structured.get("headline") or "What's on your mind?"
        except (json.JSONDecodeError, TypeError):
            message_text = final_response_raw

    # Extract context for mobile app parity
    player_ctx = result.get("player_context")
    context_data = {}
    if player_ctx:
        context_data = {
            "ageBand": getattr(player_ctx, "age_band", None),
            "readinessScore": getattr(player_ctx, "readiness_score", None),
            "activeTab": getattr(player_ctx, "active_tab", "Chat"),
        }

    return {
        "message": message_text,
        "structured": structured,
        "sessionId": request.session_id or f"session-{request.player_id}",
        "refreshTargets": result.get("_refresh_targets", []),
        "pendingConfirmation": result.get("pending_write_action") or None,
        "context": context_data,
        # Kept in sync with the streaming `_telemetry` block above. Consumed
        # by the TS quality pipeline — see aiServiceProxy.ts AIServiceResponse.
        "_telemetry": {
            "cost_usd": result.get("total_cost_usd", 0),
            "tokens": result.get("total_tokens", 0),
            "agent": result.get("selected_agent"),
            "tools_called": len(result.get("tool_calls", [])),
            "validation_flags": result.get("validation_flags", []),
            "routing_confidence": result.get("routing_confidence", 0),
            "classification_layer": result.get("classification_layer"),
            "has_rag": bool(result.get("rag_context")),
            "flow_pattern": result.get("_flow_pattern"),
        },
    }
