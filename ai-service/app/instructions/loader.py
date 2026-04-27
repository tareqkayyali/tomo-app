"""
Methodology Snapshot Loader — Phase 3.

Loads the live snapshot from `methodology_publish_snapshots` (single
row where is_live = TRUE), validates it against the Pydantic types,
and caches it in-memory for a short TTL.

Falls back to the in-memory seed snapshot when:
  - No DB pool is available yet (cold-start, tests).
  - The DB query returns no live row (fresh install before the PD has
    published their first snapshot).
  - The DB query fails (network blip — degrade to seed rather than
    take down the AI service).

When a fallback is used, a clear log line tells the operator what's
going on and how to fix it.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Optional

from app.db.supabase import get_pool
from app.instructions.seed import build_seed_snapshot
from app.instructions.types import Directive, DirectiveSnapshot

logger = logging.getLogger("tomo-ai.instructions.loader")

# In-memory cache. Snapshots are typically <100 KB so this is cheap.
_CACHED: Optional[DirectiveSnapshot] = None
_CACHED_AT: float = 0.0
_TTL_SECONDS: float = 60.0


async def load_live_snapshot(force_refresh: bool = False) -> DirectiveSnapshot:
    """Return the active DirectiveSnapshot. Cached for `_TTL_SECONDS`.

    The PD's resolver code calls this once per request; the cache means
    99%+ of those calls are zero-cost. Refresh happens automatically
    after TTL expiry.
    """
    global _CACHED, _CACHED_AT

    now = time.monotonic()
    if (
        not force_refresh
        and _CACHED is not None
        and (now - _CACHED_AT) < _TTL_SECONDS
    ):
        return _CACHED

    snapshot = await _try_load_from_db()
    if snapshot is None:
        if _CACHED is None:
            logger.warning(
                "[instructions.loader] No live methodology snapshot in DB — "
                "falling back to in-memory seed. Publish your first snapshot "
                "via /admin/pd/instructions/snapshots to take ownership."
            )
        snapshot = build_seed_snapshot()

    _CACHED = snapshot
    _CACHED_AT = now
    return snapshot


def invalidate_cache() -> None:
    """Drop the cache. Used by tests and by an admin 'reload' endpoint."""
    global _CACHED, _CACHED_AT
    _CACHED = None
    _CACHED_AT = 0.0


# ── DB read ──────────────────────────────────────────────────────────────


async def _try_load_from_db() -> Optional[DirectiveSnapshot]:
    pool = get_pool()
    if pool is None:
        logger.debug("[instructions.loader] No DB pool yet; returning None.")
        return None

    try:
        async with pool.connection() as conn:
            cur = await conn.execute(
                """
                SELECT id::text, label, directives, directive_count,
                       schema_version, is_live, published_at
                FROM public.methodology_publish_snapshots
                WHERE is_live = TRUE
                LIMIT 1
                """
            )
            row = await cur.fetchone()
        if row is None:
            return None

        (
            snap_id,
            label,
            directives_json,
            directive_count,
            schema_version,
            is_live,
            published_at,
        ) = row

        directives = []
        for d in directives_json or []:
            try:
                directives.append(_directive_from_row(d))
            except Exception as exc:
                # Skip malformed directives but log loudly — the snapshot is
                # immutable, so a bad payload here is a Phase 1/2 bug we want
                # to see, not silently swallow.
                logger.error(
                    "[instructions.loader] Skipping invalid directive in "
                    "snapshot %s: %s",
                    snap_id,
                    exc,
                )

        # Coerce published_at to datetime if needed (psycopg may return it
        # already-typed, but be defensive).
        if isinstance(published_at, str):
            published_at_dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        else:
            published_at_dt = published_at

        return DirectiveSnapshot(
            id=str(snap_id),
            label=label,
            directives=directives,
            directive_count=directive_count,
            schema_version=schema_version,
            is_live=is_live,
            published_at=published_at_dt,
        )
    except Exception as exc:
        logger.error(
            "[instructions.loader] DB read failed; falling back to seed: %s",
            exc,
        )
        return None


def _directive_from_row(d: dict) -> Directive:
    """Coerce a snapshot directive JSON row back into a typed Directive."""
    return Directive(
        id=str(d.get("id", "")),
        document_id=d.get("document_id"),
        directive_type=d["directive_type"],
        audience=d.get("audience", "all"),
        sport_scope=d.get("sport_scope") or [],
        age_scope=d.get("age_scope") or [],
        phv_scope=d.get("phv_scope") or [],
        position_scope=d.get("position_scope") or [],
        mode_scope=d.get("mode_scope") or [],
        priority=d.get("priority", 100),
        payload=d.get("payload") or {},
        source_excerpt=d.get("source_excerpt"),
        confidence=d.get("confidence"),
        status=d.get("status", "published"),
        schema_version=d.get("schema_version", 1),
        updated_at=_parse_dt(d.get("updated_at")),
    )


def _parse_dt(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    return None
