"""
Chat endpoint — receives messages from TypeScript proxy, processes via LangGraph.
SSE streaming format matches mobile app expectation: event: status/done/error.
"""

import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings


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


class ChatResponse(BaseModel):
    """Response sent back to TypeScript proxy."""

    message: str
    structured: Optional[dict] = None
    session_id: str
    refresh_targets: list[str] = []
    pending_confirmation: Optional[dict] = None


async def generate_sse_events(request: ChatRequest):
    """
    Generate SSE events matching the mobile app format:
    - event: status  → { status: "Processing..." }
    - event: done    → { message, structured, sessionId, refreshTargets, pendingConfirmation }
    - event: error   → { error: "..." }
    """
    try:
        # Status update
        yield f"event: status\ndata: {json.dumps({'status': 'Thinking...'})}\n\n"

        # TODO Phase 4: Replace with LangGraph supervisor execution
        # For now, echo back to verify the proxy pipeline works end-to-end
        t0 = time.time()

        response = {
            "message": f"[Tomo AI Service] Received: {request.message}",
            "structured": {
                "headline": "AI Service Connected",
                "cards": [
                    {
                        "type": "text_card",
                        "headline": "Python AI Service",
                        "body": f"Message received via enterprise pipeline. "
                        f"Player: {request.player_id}, "
                        f"Tab: {request.active_tab}. "
                        f"LangGraph orchestrator will be wired in Phase 4.",
                    }
                ],
            },
            "sessionId": request.session_id or "test-session",
            "refreshTargets": [],
            "pendingConfirmation": None,
        }

        elapsed_ms = int((time.time() - t0) * 1000)
        logger.info(
            f"Chat processed | player={request.player_id} | elapsed={elapsed_ms}ms"
        )

        yield f"event: done\ndata: {json.dumps(response)}\n\n"

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"


@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    SSE streaming chat endpoint.
    TypeScript proxy forwards non-capsule AI requests here.
    """
    if not request.message or not request.player_id:
        raise HTTPException(status_code=400, detail="message and player_id required")

    return StreamingResponse(
        generate_sse_events(request),
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

    # TODO Phase 4: Replace with LangGraph execution
    return ChatResponse(
        message=f"[Tomo AI Service] Received: {request.message}",
        structured=None,
        session_id=request.session_id or "test-session",
        refresh_targets=[],
        pending_confirmation=None,
    )
