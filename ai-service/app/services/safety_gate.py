"""
Tomo AI Service — Safety Gate Evaluator
──────────────────────────────────────────────────────────────────────
Runtime-side of the CMS-managed safety gate (migration 048).

Flow:
  1. Admin configures rules in /admin/safety-gate (toggles, numbers,
     chip editor for pain keywords, text fields for response phrasing).
  2. Saved row lives in `public.safety_gate_config` (singleton).
  3. This module reads the row via `get_config()` with a 60s TTL cache.
  4. `evaluate()` runs the rules against (user_message, intent, player
     context, requested_intensity) and returns a verdict:
        allow=True  -> let the flow proceed
        allow=False -> emit the admin-configured block message as a
                       text_card, swap to the suggested fallback
                       intensity (LIGHT / REST), and mark the turn
                       with `safety_gate_triggered` so telemetry can
                       count interventions.
  5. When `enabled=False` the gate is inert — every request is allowed
     through unchanged.

Design rules enforced by this module:
  - No hardcoded thresholds. Every number comes from the config row.
  - No hardcoded copy. Every message comes from the config row.
  - Zero LLM cost. Evaluation is O(len(pain_keywords) + O(1)) per call.
  - Graceful degrade. If the DB read fails, we fall back to safe
    defaults AND log a warning — never block the whole chat pipeline.
  - Kill-switch honoured. `enabled=False` short-circuits immediately.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.safety_gate")

# ── Cache ─────────────────────────────────────────────────────────

_CACHE: dict = {}
_CACHE_TTL_SECONDS = 60.0

# Safe defaults — used if the DB is unreachable or the singleton row
# is missing. These MUST match the migration defaults so behaviour is
# consistent across cold starts.
_DEFAULT_PAIN_KEYWORDS = frozenset([
    "pain", "hurt", "injured", "injury", "sore", "tweaked", "pulled",
    "strain", "sprain", "ache", "stiff", "swollen",
])

_DEFAULT_CONFIG = {
    "enabled": True,
    "block_hard_on_red": True,
    "block_moderate_on_red": False,
    "block_hard_on_yellow": False,
    "min_rest_hours_after_hard": 24,
    "max_hard_per_week": 3,
    "pain_keywords": sorted(_DEFAULT_PAIN_KEYWORDS),
    "red_block_message": (
        "Your readiness is in the red today — your body needs recovery, not intensity. "
        "Let's swap this for a light mobility + recovery block instead."
    ),
    "pain_block_message": (
        "Heard you mention pain — I'm going to hold off on the training request. "
        "Talk to your physio or coach first, and we'll pick it back up when you're cleared."
    ),
    "load_block_message": (
        "You've already banked the hard work this week. Another HARD session would push you "
        "into overload territory — let's keep today light or moderate."
    ),
}


async def get_config(force_refresh: bool = False) -> dict:
    """Return the current safety gate config, refreshing the cache if stale.

    Uses a 60s TTL so changes made in /admin/safety-gate take effect
    on the very next cache miss without requiring a redeploy.
    """
    now = time.monotonic()
    cached_at = _CACHE.get("at", 0)
    cached = _CACHE.get("config")

    if not force_refresh and cached and (now - cached_at) < _CACHE_TTL_SECONDS:
        return cached

    # Refresh from DB
    fresh = await _load_from_db()
    _CACHE["config"] = fresh
    _CACHE["at"] = now
    return fresh


async def _load_from_db() -> dict:
    """Load the singleton safety_gate_config row. Falls back to defaults on any error."""
    try:
        from app.db.supabase import get_pool
        pool = get_pool()
        if not pool:
            logger.warning("safety_gate: no DB pool, using defaults")
            return dict(_DEFAULT_CONFIG)

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT enabled, block_hard_on_red, block_moderate_on_red,
                          block_hard_on_yellow, min_rest_hours_after_hard,
                          max_hard_per_week, pain_keywords,
                          red_block_message, pain_block_message, load_block_message
                   FROM public.safety_gate_config
                   LIMIT 1"""
            )
            row = await result.fetchone()

        if not row:
            logger.warning("safety_gate: singleton row missing, using defaults")
            return dict(_DEFAULT_CONFIG)

        return {
            "enabled": bool(row[0]),
            "block_hard_on_red": bool(row[1]),
            "block_moderate_on_red": bool(row[2]),
            "block_hard_on_yellow": bool(row[3]),
            "min_rest_hours_after_hard": int(row[4] or 0),
            "max_hard_per_week": int(row[5] or 0),
            "pain_keywords": list(row[6] or []),
            "red_block_message": str(row[7] or _DEFAULT_CONFIG["red_block_message"]),
            "pain_block_message": str(row[8] or _DEFAULT_CONFIG["pain_block_message"]),
            "load_block_message": str(row[9] or _DEFAULT_CONFIG["load_block_message"]),
        }
    except Exception as e:
        logger.error(f"safety_gate: DB load failed, using defaults: {e}", exc_info=True)
        return dict(_DEFAULT_CONFIG)


def invalidate_cache() -> None:
    """Force the next get_config() call to refetch. Mainly for tests."""
    _CACHE.clear()


# ── Evaluation ────────────────────────────────────────────────────

@dataclass
class SafetyVerdict:
    """Outcome of a safety gate evaluation.

    allow=True  -> the flow proceeds unchanged.
    allow=False -> the flow must halt the original request and surface
                   `message` to the athlete. If `suggested_intensity`
                   is set, the flow may offer to swap to that intensity
                   instead of cancelling outright.
    """
    allow: bool
    rule: Optional[str] = None       # "red_block" | "yellow_block" | "pain" | "load" | None
    message: Optional[str] = None    # Admin-configured phrasing to surface
    suggested_intensity: Optional[str] = None  # "LIGHT" / "REST" / None


_ALLOW_ALL = SafetyVerdict(allow=True)


async def evaluate(
    user_message: str,
    intent_id: str,
    context: Optional[PlayerContext],
    requested_intensity: str = "",
) -> SafetyVerdict:
    """Run the safety gate against the current request.

    Args:
        user_message: Raw text from the athlete (used for pain keyword scan).
        intent_id: Classified intent (e.g. "build_session"). Non-training
                   intents bypass the gate.
        context: PlayerContext (readiness_score, recent training load).
        requested_intensity: "LIGHT" | "MODERATE" | "HARD" or empty if
                             not yet known. Haiku-inferred upstream.

    Returns:
        SafetyVerdict. When allow=False, the caller MUST surface
        verdict.message and may swap to verdict.suggested_intensity.
    """
    try:
        config = await get_config()
    except Exception as e:
        logger.error(f"safety_gate: get_config failed, allowing request: {e}")
        return _ALLOW_ALL

    # Master kill-switch
    if not config.get("enabled", True):
        return _ALLOW_ALL

    # Only gate training-adjacent intents. Smalltalk / schedule reads /
    # etc. are never gated.
    training_intents = {
        "build_session", "plan_training", "create_event", "update_event",
        "add_training", "schedule_workout",
    }
    if intent_id and intent_id not in training_intents:
        return _ALLOW_ALL

    # ── Pain keyword scan (highest priority — injury trumps everything) ──
    msg_lower = (user_message or "").lower()
    keywords = config.get("pain_keywords") or []
    if keywords and msg_lower:
        for kw in keywords:
            if not kw:
                continue
            if kw.lower() in msg_lower:
                logger.info(f"safety_gate: PAIN keyword match '{kw}' -> blocking")
                return SafetyVerdict(
                    allow=False,
                    rule="pain",
                    message=config["pain_block_message"],
                    suggested_intensity="REST",
                )

    # ── Readiness-based blocks ──────────────────────────────────────────
    # PlayerContext.readiness_score is "Green" / "Yellow" / "Red" / None
    readiness = (getattr(context, "readiness_score", None) or "").lower() if context else ""
    intensity = (requested_intensity or "").upper()

    if readiness == "red":
        if config["block_hard_on_red"] and intensity == "HARD":
            logger.info("safety_gate: RED readiness + HARD request -> blocking")
            return SafetyVerdict(
                allow=False,
                rule="red_block",
                message=config["red_block_message"],
                suggested_intensity="LIGHT",
            )
        if config["block_moderate_on_red"] and intensity in ("HARD", "MODERATE"):
            logger.info("safety_gate: RED readiness + MODERATE request -> blocking")
            return SafetyVerdict(
                allow=False,
                rule="red_block",
                message=config["red_block_message"],
                suggested_intensity="LIGHT",
            )

    if readiness == "yellow":
        if config["block_hard_on_yellow"] and intensity == "HARD":
            logger.info("safety_gate: YELLOW readiness + HARD request -> blocking")
            return SafetyVerdict(
                allow=False,
                rule="yellow_block",
                message=config["red_block_message"],
                suggested_intensity="MODERATE",
            )

    # ── Load-based blocks ───────────────────────────────────────────────
    # Count HARD sessions in the last 7 days from context.upcoming_events
    # (recent past + future — both are surfaced by context_assembly).
    if intensity == "HARD" and context is not None:
        max_hard = config.get("max_hard_per_week", 0) or 0
        min_rest_hours = config.get("min_rest_hours_after_hard", 0) or 0

        hard_count = _count_hard_in_week(context)
        if max_hard > 0 and hard_count >= max_hard:
            logger.info(
                f"safety_gate: {hard_count}/{max_hard} HARD sessions in week -> blocking"
            )
            return SafetyVerdict(
                allow=False,
                rule="load",
                message=config["load_block_message"],
                suggested_intensity="MODERATE",
            )

        if min_rest_hours > 0 and _last_hard_within_hours(context, min_rest_hours):
            logger.info(
                f"safety_gate: last HARD within {min_rest_hours}h -> blocking"
            )
            return SafetyVerdict(
                allow=False,
                rule="load",
                message=config["load_block_message"],
                suggested_intensity="LIGHT",
            )

    return _ALLOW_ALL


# ── Helpers ───────────────────────────────────────────────────────

def _count_hard_in_week(context: PlayerContext) -> int:
    """Count HARD-intensity events in the athlete's last 7 days.

    PlayerContext.upcoming_events is a list of dicts with `intensity` and
    `start_time` fields populated by context_assembly_node.
    """
    try:
        events = getattr(context, "upcoming_events", None) or []
        if not events:
            return 0

        from datetime import datetime, timedelta
        today = getattr(context, "today_date", None)
        if not today:
            return 0

        today_dt = datetime.strptime(today, "%Y-%m-%d")
        week_start = today_dt - timedelta(days=7)
        count = 0
        for ev in events:
            if not isinstance(ev, dict):
                continue
            intensity = (ev.get("intensity") or "").upper()
            if intensity != "HARD":
                continue
            start = ev.get("start_time") or ev.get("start_at") or ""
            if not start:
                continue
            try:
                ev_dt = datetime.fromisoformat(str(start)[:19].replace(" ", "T"))
            except (ValueError, TypeError):
                continue
            if week_start <= ev_dt <= today_dt + timedelta(days=7):
                count += 1
        return count
    except Exception as e:
        logger.debug(f"safety_gate: _count_hard_in_week failed: {e}")
        return 0


def _last_hard_within_hours(context: PlayerContext, hours: int) -> bool:
    """Was there a HARD session in the last `hours` hours?"""
    try:
        events = getattr(context, "upcoming_events", None) or []
        if not events:
            return False

        from datetime import datetime, timedelta
        today = getattr(context, "today_date", None)
        current = getattr(context, "current_time", None) or "00:00"
        if not today:
            return False

        try:
            now = datetime.strptime(f"{today} {current}", "%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            now = datetime.strptime(today, "%Y-%m-%d")
        cutoff = now - timedelta(hours=hours)

        for ev in events:
            if not isinstance(ev, dict):
                continue
            intensity = (ev.get("intensity") or "").upper()
            if intensity != "HARD":
                continue
            start = ev.get("start_time") or ev.get("start_at") or ""
            if not start:
                continue
            try:
                ev_dt = datetime.fromisoformat(str(start)[:19].replace(" ", "T"))
            except (ValueError, TypeError):
                continue
            if cutoff <= ev_dt <= now:
                return True
        return False
    except Exception as e:
        logger.debug(f"safety_gate: _last_hard_within_hours failed: {e}")
        return False


def build_block_response(verdict: SafetyVerdict) -> dict:
    """Build a structured chat response for a safety-gate block.

    Used by multi_step and open_coaching when the gate refuses a request.
    Returns a dict matching the `final_response` shape that format_response
    can serialize directly.
    """
    headline = "Holding off on that one"
    if verdict.rule == "pain":
        headline = "Your body first"
    elif verdict.rule == "red_block":
        headline = "Red today — we're going light"
    elif verdict.rule == "load":
        headline = "You've earned the reset"

    chips = []
    if verdict.suggested_intensity == "LIGHT":
        chips = [
            {"label": "Build light session", "message": "Build me a light mobility session"},
            {"label": "Check readiness", "message": "What's my readiness?"},
        ]
    elif verdict.suggested_intensity == "REST":
        chips = [
            {"label": "Log how I feel", "message": "I want to log my check-in"},
            {"label": "Show readiness", "message": "What's my readiness?"},
        ]
    elif verdict.suggested_intensity == "MODERATE":
        chips = [
            {"label": "Go moderate instead", "message": "Build me a moderate session"},
            {"label": "Show my week", "message": "What does my week look like?"},
        ]

    return {
        "headline": headline,
        "body": verdict.message or "",
        "cards": [],
        "chips": chips[:2],
        "_safety_gate_rule": verdict.rule,
    }
