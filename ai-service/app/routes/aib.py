"""
Tomo AI Service — AIB (Athlete Intelligence Brief) Routes

Endpoints:
  POST /api/v1/aib/generate  — Trigger AIB generation for an athlete
  GET  /api/v1/aib/{user_id} — Fetch current AIB for an athlete

The generate endpoint is called:
  1. By TS event pipeline after writeSnapshot() (snapshot change trigger)
  2. By context_assembly_node when AIB is stale (lazy fallback)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.graph.nodes.aib_generator import ensure_fresh_aib, generate_aib, save_aib, _compute_snapshot_hash
from app.graph.nodes.context_assembly import build_player_context
from app.db.supabase import get_pool

logger = logging.getLogger("tomo-ai.aib.routes")

router = APIRouter(prefix="/aib", tags=["aib"])


class AIBGenerateRequest(BaseModel):
    """Request body for AIB generation trigger."""
    user_id: str
    timezone: str = "UTC"
    force: bool = False  # Force regeneration even if hash matches


class AIBResponse(BaseModel):
    """AIB response payload."""
    user_id: str
    summary_text: str | None
    snapshot_hash: str | None
    is_fresh: bool
    generated: bool  # Whether a new AIB was generated in this request


@router.post("/generate", response_model=AIBResponse)
async def generate_aib_endpoint(req: AIBGenerateRequest):
    """
    Trigger AIB generation for an athlete.
    Called by TS event pipeline after snapshot changes.

    Flow:
      1. Build PlayerContext (reuses context_assembly parallel queries)
      2. Check if AIB is stale (snapshot hash comparison)
      3. If stale or force=True → generate with Haiku → save
      4. Return AIB text
    """
    # Build context to get snapshot data
    context = await build_player_context(
        user_id=req.user_id,
        timezone_str=req.timezone,
    )

    if req.force or not context.snapshot_enrichment:
        # Force generation or no snapshot yet
        aib_text = await generate_aib(context)
        if aib_text:
            snapshot_hash = _compute_snapshot_hash(context)
            await save_aib(req.user_id, aib_text, snapshot_hash, context)
            return AIBResponse(
                user_id=req.user_id,
                summary_text=aib_text,
                snapshot_hash=snapshot_hash,
                is_fresh=True,
                generated=True,
            )
        raise HTTPException(status_code=500, detail="AIB generation failed")

    # Use ensure_fresh_aib (checks hash, generates if stale)
    aib_text = await ensure_fresh_aib(context)
    snapshot_hash = _compute_snapshot_hash(context)

    return AIBResponse(
        user_id=req.user_id,
        summary_text=aib_text,
        snapshot_hash=snapshot_hash,
        is_fresh=True,
        generated=aib_text is not None,
    )


@router.get("/{user_id}", response_model=AIBResponse)
async def get_aib_endpoint(user_id: str):
    """
    Fetch current AIB for an athlete (read-only, no generation).
    Returns cached AIB or null if none exists.
    """
    pool = get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT summary_text, snapshot_hash
            FROM athlete_intelligence_briefs
            WHERE athlete_id = $1 AND is_current = true
            ORDER BY generated_at DESC
            LIMIT 1
            """,
            (user_id,),
        )
        row = await result.fetchone()

    if not row:
        return AIBResponse(
            user_id=user_id,
            summary_text=None,
            snapshot_hash=None,
            is_fresh=False,
            generated=False,
        )

    return AIBResponse(
        user_id=user_id,
        summary_text=row[0],
        snapshot_hash=row[1],
        is_fresh=True,
        generated=False,
    )
