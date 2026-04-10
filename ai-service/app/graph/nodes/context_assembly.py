"""
Tomo AI Service — Context Assembly Node
Ports the 11+ parallel DB queries from TypeScript contextBuilder.ts to Python.

This node runs at the start of every LangGraph invocation to build the
full PlayerContext. Uses asyncio.gather() for parallel execution (same
pattern as Promise.allSettled in TypeScript).

Target: < 800ms total assembly time (Phase 2 gate).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.db.supabase import get_pool, get_supabase
from app.models.context import (
    ActiveRecommendation,
    BenchmarkProfile,
    CalendarEvent,
    PlanningContext,
    PlayerContext,
    ReadinessComponents,
    SchedulePreferences,
    SnapshotEnrichment,
    TemporalContext,
)
from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.context")


# ── Timezone helpers ─────────────────────────────────────────────────

def _get_day_bounds_utc(date_str: str, tz_name: str) -> tuple[str, str]:
    """
    Convert a local date (YYYY-MM-DD) to UTC ISO boundaries for DB queries.
    Uses zoneinfo for proper DST handling.
    """
    from zoneinfo import ZoneInfo
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")

    local_date = datetime.strptime(date_str, "%Y-%m-%d")
    day_start = local_date.replace(hour=0, minute=0, second=0, tzinfo=tz)
    day_end = local_date.replace(hour=23, minute=59, second=59, tzinfo=tz)

    return (
        day_start.astimezone(timezone.utc).isoformat(),
        day_end.astimezone(timezone.utc).isoformat(),
    )


def _now_in_tz(tz_name: str) -> datetime:
    """Get current datetime in the player's timezone."""
    from zoneinfo import ZoneInfo
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    return datetime.now(tz)


def _derive_age_band(age: Optional[int]) -> Optional[str]:
    """Derive age band from numeric age."""
    if age is None:
        return None
    if age < 13:
        return "U13"
    if age < 15:
        return "U15"
    if age < 17:
        return "U17"
    if age < 19:
        return "U19"
    if age < 21:
        return "U21"
    if age < 30:
        return "SEN"
    return "VET"


def _detect_scenario(prefs: SchedulePreferences) -> str:
    """Detect active scheduling scenario from preferences."""
    if prefs.league_is_active and prefs.exam_period_active:
        return "league_and_exam"
    if prefs.league_is_active:
        return "league_active"
    if prefs.exam_period_active:
        return "exam_period"
    return "normal"


# ── Individual query functions ───────────────────────────────────────
# Each returns a result or None on failure (graceful degradation).
# All use psycopg3 async pool for direct SQL (enterprise-grade).

async def _fetch_profile(pool, user_id: str) -> Optional[dict]:
    """Fetch user profile (identity, sport, anthropometrics)."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT name, sport, age, role, current_streak, longest_streak,
                   position, gender, height_cm, weight_kg
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )
        row = await result.fetchone()
        if not row:
            return None
        cols = [desc.name for desc in result.description]
        return dict(zip(cols, row))


async def _fetch_today_events(
    pool, user_id: str, day_start: str, day_end: str
) -> list[dict]:
    """Fetch today's calendar events in the player's timezone."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT id, title, event_type, start_at, end_at, notes, intensity
            FROM calendar_events
            WHERE user_id = %s
              AND start_at >= %s::timestamptz
              AND start_at <= %s::timestamptz
            ORDER BY start_at
            """,
            (user_id, day_start, day_end),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]
        return [dict(zip(cols, row)) for row in rows]


async def _fetch_latest_checkin(pool, user_id: str) -> Optional[dict]:
    """Fetch latest checkin for readiness components."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT energy, soreness, sleep_hours, mood, academic_stress,
                   pain_flag, readiness, date
            FROM checkins
            WHERE user_id = %s
            ORDER BY date DESC
            LIMIT 1
            """,
            (user_id,),
        )
        row = await result.fetchone()
        if not row:
            return None
        cols = [desc.name for desc in result.description]
        return dict(zip(cols, row))


async def _fetch_recent_vitals(pool, user_id: str) -> list[dict]:
    """Fetch last 3 days of health_data for HRV, sleep, etc."""
    three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT metric_type, value, date
            FROM health_data
            WHERE user_id = %s AND date >= %s
            ORDER BY date DESC
            LIMIT 15
            """,
            (user_id, three_days_ago),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]
        return [dict(zip(cols, row)) for row in rows]


async def _fetch_upcoming_exams(
    pool, user_id: str, day_start: str, in_14_days_end: str
) -> list[dict]:
    """Fetch exams in next 14 days."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT id, title, event_type, start_at, end_at, notes, intensity
            FROM calendar_events
            WHERE user_id = %s
              AND event_type = 'exam'
              AND start_at >= %s::timestamptz
              AND start_at <= %s::timestamptz
            ORDER BY start_at
            """,
            (user_id, day_start, in_14_days_end),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]
        return [dict(zip(cols, row)) for row in rows]


async def _fetch_phone_tests(pool, user_id: str) -> list[dict]:
    """Fetch recent phone test sessions."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT test_type, score, date
            FROM phone_test_sessions
            WHERE user_id = %s
            ORDER BY date DESC
            LIMIT 20
            """,
            (user_id,),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]
        return [dict(zip(cols, row)) for row in rows]


async def _fetch_football_tests(pool, user_id: str) -> list[dict]:
    """Fetch recent football test results (maps primary_value → score)."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT test_type, primary_value AS score, date
            FROM football_test_results
            WHERE user_id = %s
            ORDER BY date DESC
            LIMIT 20
            """,
            (user_id,),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]
        return [dict(zip(cols, row)) for row in rows]


async def _fetch_schedule_prefs(pool, user_id: str) -> Optional[dict]:
    """Fetch player schedule preferences."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT *
            FROM player_schedule_preferences
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = await result.fetchone()
        if not row:
            return None
        cols = [desc.name for desc in result.description]
        return dict(zip(cols, row))


async def _fetch_snapshot(pool, user_id: str) -> Optional[dict]:
    """Fetch athlete snapshot (Layer 2 enrichment)."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT *
            FROM athlete_snapshots
            WHERE athlete_id = %s
            """,
            (user_id,),
        )
        row = await result.fetchone()
        if not row:
            return None
        cols = [desc.name for desc in result.description]
        return dict(zip(cols, row))


async def _fetch_projected_load(
    pool, user_id: str, day_start: str, in_7_days_end: str
) -> float:
    """Sum estimated_load_au for next 7 days of calendar events."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT COALESCE(SUM(estimated_load_au), 0) AS total_load
            FROM calendar_events
            WHERE user_id = %s
              AND start_at >= %s::timestamptz
              AND start_at <= %s::timestamptz
              AND estimated_load_au IS NOT NULL
            """,
            (user_id, day_start, in_7_days_end),
        )
        row = await result.fetchone()
        return float(row[0]) if row else 0.0


async def _fetch_upcoming_events(
    pool, user_id: str, day_end: str, in_7_days_end: str
) -> list[dict]:
    """Fetch all events in next 7 days (for study block visibility)."""
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT id, title, event_type, start_at, end_at, notes, intensity
            FROM calendar_events
            WHERE user_id = %s
              AND start_at >= %s::timestamptz
              AND start_at <= %s::timestamptz
            ORDER BY start_at
            """,
            (user_id, day_end, in_7_days_end),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]
        return [dict(zip(cols, row)) for row in rows]


async def _fetch_recommendations(user_id: str) -> list[dict]:
    """
    Fetch top 5 active recommendations.
    Uses Supabase client for consistency with TS getRecommendations().
    """
    sb = get_supabase()
    if not sb:
        return []
    try:
        resp = (
            sb.table("athlete_recommendations")
            .select("rec_type, priority, title, body_short, confidence_score")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("priority")
            .limit(5)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch recommendations: {e}")
        return []


async def _fetch_benchmark_profile(pool, user_id: str) -> Optional[dict]:
    """
    Fetch benchmark profile from normative data.
    Simplified version — full benchmark computation is in TS benchmarkService.
    Returns None until we port the full normative comparison to Python.
    """
    # TODO: Phase 4 — port full benchmarkService.getPlayerBenchmarkProfile()
    # For now, check if we have a pre-computed benchmark in athlete_snapshots
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT strength_benchmarks, speed_profile, cv_completeness
            FROM athlete_snapshots
            WHERE athlete_id = %s
            """,
            (user_id,),
        )
        row = await result.fetchone()
        if not row:
            return None
        cols = [desc.name for desc in result.description]
        data = dict(zip(cols, row))
        # We don't have full percentile computation yet — return None
        # The snapshot enrichment will still carry the raw benchmarks
        return None


async def _fetch_aib(pool, user_id: str) -> Optional[str]:
    """
    Fetch the latest Athlete Intelligence Brief.
    Returns the pre-synthesized text summary or None if no AIB exists.
    """
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT summary_text
            FROM athlete_intelligence_briefs
            WHERE athlete_id = %s
              AND is_current = true
            ORDER BY generated_at DESC
            LIMIT 1
            """,
            (user_id,),
        )
        row = await result.fetchone()
        return row[0] if row else None


# ── Snapshot → SnapshotEnrichment mapping ────────────────────────────

def _safe_float(val, default=None) -> float | None:
    """Convert Decimal/int/str to float. psycopg3 returns Decimal for numeric cols."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _safe_int(val, default=0) -> int:
    """Convert Decimal/float/str to int."""
    if val is None:
        return default
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _build_snapshot_enrichment(
    snapshot: dict,
    vitals: list[dict],
    projected_load_sum: float,
) -> SnapshotEnrichment:
    """
    Map raw athlete_snapshots row to SnapshotEnrichment model.
    Mirrors the TS snapshotEnrichment building in contextBuilder.ts.
    All numeric values go through _safe_float/_safe_int to handle
    psycopg3's Decimal return type.
    """
    # Prefer freshest HRV from health_data over stale snapshot value
    fresh_hrv = next(
        (v for v in vitals if v.get("metric_type") == "hrv"),
        None,
    )
    hrv_today = (
        round(float(fresh_hrv["value"]) * 10) / 10
        if fresh_hrv
        else _safe_float(snapshot.get("hrv_today_ms"))
    )

    # Compute projected ACWR
    ctl = _safe_float(snapshot.get("ctl_28day"), 0)
    atl = _safe_float(snapshot.get("atl_7day"), 0)
    projected_acwr = None
    if ctl > 0:
        projected_acwr = round((atl + projected_load_sum / 7) / ctl, 2)

    return SnapshotEnrichment(
        acwr=_safe_float(snapshot.get("acwr")),
        atl_7day=_safe_float(snapshot.get("atl_7day")),
        ctl_28day=_safe_float(snapshot.get("ctl_28day")),
        injury_risk_flag=snapshot.get("injury_risk_flag"),
        athletic_load_7day=_safe_float(snapshot.get("athletic_load_7day")),
        academic_load_7day=_safe_float(snapshot.get("academic_load_7day")),
        dual_load_index=_safe_float(snapshot.get("dual_load_index")),
        projected_load_7day=projected_load_sum if projected_load_sum > 0 else None,
        projected_acwr=projected_acwr,
        hrv_baseline_ms=_safe_float(snapshot.get("hrv_baseline_ms")),
        hrv_today_ms=hrv_today,
        sleep_quality=_safe_float(snapshot.get("sleep_quality")),
        wellness_7day_avg=_safe_float(snapshot.get("wellness_7day_avg")),
        wellness_trend=snapshot.get("wellness_trend"),
        sessions_total=_safe_int(snapshot.get("sessions_total")),
        training_age_weeks=_safe_int(snapshot.get("training_age_weeks")),
        streak_days=_safe_int(snapshot.get("streak_days")),
        cv_completeness=_safe_float(snapshot.get("cv_completeness")),
        mastery_scores=snapshot.get("mastery_scores") or {},
        strength_benchmarks=snapshot.get("strength_benchmarks") or {},
        speed_profile=snapshot.get("speed_profile") or {},
        coachability_index=_safe_float(snapshot.get("coachability_index")),
        phv_stage=snapshot.get("phv_stage"),
        phv_offset_years=_safe_float(snapshot.get("phv_offset_years")),
        triangle_rag=snapshot.get("triangle_rag"),
        readiness_rag=snapshot.get("readiness_rag"),
        readiness_score=_safe_float(snapshot.get("readiness_score")),
        last_checkin_at=str(snapshot["last_checkin_at"]) if snapshot.get("last_checkin_at") else None,
        journal_completeness_7d=_safe_float(snapshot.get("journal_completeness_7d")),
        journal_streak_days=_safe_int(snapshot.get("journal_streak_days")),
        target_achievement_rate_30d=_safe_float(snapshot.get("target_achievement_rate_30d")),
        last_journal_at=str(snapshot["last_journal_at"]) if snapshot.get("last_journal_at") else None,
        pending_pre_journal_count=_safe_int(snapshot.get("pending_pre_journal_count")),
        pending_post_journal_count=_safe_int(snapshot.get("pending_post_journal_count")),
        training_monotony=_safe_float(snapshot.get("training_monotony")),
        training_strain=_safe_float(snapshot.get("training_strain")),
        data_confidence_score=_safe_float(snapshot.get("data_confidence_score")),
        readiness_delta=_safe_float(snapshot.get("readiness_delta")),
        sleep_debt_3d=_safe_float(snapshot.get("sleep_debt_3d")),
        spo2_pct=_safe_float(snapshot.get("spo2_pct")),
        recovery_score=_safe_float(snapshot.get("recovery_score")),
        hrv_trend_7d_pct=_safe_float(snapshot.get("hrv_trend_7d_pct")),
        load_trend_7d_pct=_safe_float(snapshot.get("load_trend_7d_pct")),
        acwr_trend=snapshot.get("acwr_trend"),
        sleep_trend_7d=snapshot.get("sleep_trend_7d"),
        body_feel_trend_7d=_safe_float(snapshot.get("body_feel_trend_7d")),
        resting_hr_trend_7d=snapshot.get("resting_hr_trend_7d"),
        readiness_distribution_7d=snapshot.get("readiness_distribution_7d"),
        matches_next_7d=_safe_int(snapshot.get("matches_next_7d"), None),
        exams_next_14d=_safe_int(snapshot.get("exams_next_14d"), None),
        season_phase=snapshot.get("season_phase"),
        days_since_last_session=_safe_int(snapshot.get("days_since_last_session"), None),
        rec_action_rate_30d=_safe_float(snapshot.get("rec_action_rate_30d")),
        plan_compliance_7d=_safe_float(snapshot.get("plan_compliance_7d")),
        checkin_consistency_7d=_safe_float(snapshot.get("checkin_consistency_7d")),
        coaching_preference=snapshot.get("coaching_preference"),
        athlete_mode=snapshot.get("athlete_mode"),
        dual_load_zone=snapshot.get("dual_load_zone"),
        applicable_protocol_ids=snapshot.get("applicable_protocol_ids"),
        exam_proximity_score=_safe_float(snapshot.get("exam_proximity_score")),
    )


# ── Temporal context builder ─────────────────────────────────────────

def _build_temporal_context(
    current_time: str,
    today_events: list[dict],
    exams: list[dict],
    latest_checkin: Optional[dict],
    academic_load_score: float,
    tz_name: str,
) -> TemporalContext:
    """Build temporal awareness context (mirrors TS temporal context logic)."""
    hour = int(current_time.split(":")[0])

    if 5 <= hour < 12:
        time_of_day = "morning"
    elif 12 <= hour < 17:
        time_of_day = "afternoon"
    elif 17 <= hour < 21:
        time_of_day = "evening"
    else:
        time_of_day = "night"

    # Match day detection
    match_event = next(
        (e for e in today_events if e.get("event_type") == "match"), None
    )
    is_match_day = match_event is not None
    match_details = None
    if match_event:
        start = match_event.get("start_at", "")
        title = match_event.get("title", "Match")
        # Extract time from ISO string
        try:
            from zoneinfo import ZoneInfo
            tz = ZoneInfo(tz_name)
            dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
            local_time = dt.astimezone(tz).strftime("%H:%M")
            match_details = f"{title} at {local_time}"
        except Exception:
            match_details = title

    # Exam within 48 hours
    now_utc = datetime.now(timezone.utc)
    cutoff_48h = now_utc + timedelta(hours=48)
    near_exams = []
    for e in exams:
        try:
            start = datetime.fromisoformat(str(e["start_at"]).replace("Z", "+00:00"))
            if start <= cutoff_48h:
                near_exams.append(e)
        except Exception:
            pass

    is_exam_proximity = len(near_exams) > 0
    exam_details = ", ".join(e.get("title", "") for e in near_exams) if near_exams else None

    # Day type
    day_type = "rest"
    if is_match_day:
        day_type = "competition"
    elif is_exam_proximity:
        day_type = "exam"
    elif any(
        e.get("event_type") == "training"
        and e.get("intensity") in ("HARD", "MODERATE")
        for e in today_events
    ):
        day_type = "training"
    elif any(e.get("event_type") == "training" for e in today_events):
        day_type = "light"

    # Auto-suggestion
    readiness_val = latest_checkin.get("readiness") if latest_checkin else None
    suggestion = ""
    if readiness_val == "Red":
        suggestion = "Rest day recommended — prioritize recovery"
    elif is_match_day and time_of_day == "evening":
        suggestion = "Post-match recovery focus"
    elif is_match_day and time_of_day in ("morning", "afternoon"):
        suggestion = "Match day — light activation only, save energy"
    elif is_exam_proximity and academic_load_score >= 6:
        suggestion = "High academic load — reduce training intensity, prioritize rest and study"
    elif time_of_day == "night":
        suggestion = "Wind down — sleep quality is priority"
    elif time_of_day == "evening" and not any(
        e.get("event_type") == "training" for e in today_events
    ):
        suggestion = "Evening free — good time for mobility or light recovery work"

    return TemporalContext(
        time_of_day=time_of_day,
        is_match_day=is_match_day,
        match_details=match_details,
        is_exam_proximity=is_exam_proximity,
        exam_details=exam_details,
        day_type=day_type,
        suggestion=suggestion,
    )


# ── Main context assembly function ───────────────────────────────────

async def build_player_context(
    user_id: str,
    active_tab: str = "Chat",
    last_user_message: str = "",
    timezone_str: str = "UTC",
) -> PlayerContext:
    """
    Build full PlayerContext from 11+ parallel DB queries.
    Python equivalent of TypeScript buildPlayerContext().

    Uses asyncio.gather() with return_exceptions=True for graceful
    degradation (same pattern as Promise.allSettled).
    """
    pool = get_pool()
    if not pool:
        logger.error("DB pool not available — returning minimal context")
        now = _now_in_tz(timezone_str)
        return PlayerContext(
            user_id=user_id,
            today_date=now.strftime("%Y-%m-%d"),
            current_time=now.strftime("%H:%M"),
            active_tab=active_tab,
            last_user_message=last_user_message,
            timezone=timezone_str,
        )

    tz = timezone_str or "UTC"
    now = _now_in_tz(tz)
    today = now.strftime("%Y-%m-%d")
    current_time = now.strftime("%H:%M")

    # Compute day boundaries in UTC for DB queries
    day_start, day_end = _get_day_bounds_utc(today, tz)

    in_14_days = (now + timedelta(days=14)).strftime("%Y-%m-%d")
    _, in_14_days_end = _get_day_bounds_utc(in_14_days, tz)

    in_7_days = (now + timedelta(days=7)).strftime("%Y-%m-%d")
    _, in_7_days_end = _get_day_bounds_utc(in_7_days, tz)

    # ── 11+ parallel DB queries (asyncio.gather with return_exceptions) ──
    results = await asyncio.gather(
        _fetch_profile(pool, user_id),                              # 0
        _fetch_today_events(pool, user_id, day_start, day_end),     # 1
        _fetch_latest_checkin(pool, user_id),                       # 2
        _fetch_recent_vitals(pool, user_id),                        # 3
        _fetch_upcoming_exams(pool, user_id, day_start, in_14_days_end),  # 4
        _fetch_phone_tests(pool, user_id),                          # 5
        _fetch_football_tests(pool, user_id),                       # 6
        _fetch_schedule_prefs(pool, user_id),                       # 7
        _fetch_snapshot(pool, user_id),                             # 8
        _fetch_projected_load(pool, user_id, day_start, in_7_days_end),  # 9
        _fetch_upcoming_events(pool, user_id, day_end, in_7_days_end),   # 10
        _fetch_recommendations(user_id),                            # 11
        _fetch_aib(pool, user_id),                                  # 12
        return_exceptions=True,
    )

    # ── Extract results with graceful fallback ──
    def safe_get(idx: int, default: Any = None) -> Any:
        val = results[idx]
        if isinstance(val, Exception):
            logger.warning(f"Query {idx} failed: {val}")
            return default
        return val if val is not None else default

    profile = safe_get(0, {})
    today_events_raw = safe_get(1, [])
    latest_checkin = safe_get(2)
    vitals_raw = safe_get(3, [])
    exams_raw = safe_get(4, [])
    phone_tests = safe_get(5, [])
    football_tests = safe_get(6, [])
    sched_prefs_row = safe_get(7)
    snapshot = safe_get(8)
    projected_load_sum = safe_get(9, 0.0)
    upcoming_events_raw = safe_get(10, [])
    recs_raw = safe_get(11, [])
    aib_text = safe_get(12)

    # ── Merge test results (phone + football, deduplicated) ──
    merged = {}
    for t in phone_tests + football_tests:
        key = f"{t.get('test_type')}_{t.get('date')}"
        if key not in merged:
            merged[key] = t
    test_results = sorted(
        merged.values(),
        key=lambda x: str(x.get("date", "")),
        reverse=True,
    )[:20]

    # ── Schedule preferences ──
    schedule_preferences = SchedulePreferences()
    if sched_prefs_row:
        try:
            schedule_preferences = SchedulePreferences(**{
                k: v for k, v in sched_prefs_row.items()
                if k in SchedulePreferences.model_fields and k != "user_id"
            })
        except Exception as e:
            logger.warning(f"Failed to parse schedule prefs: {e}")

    active_scenario = _detect_scenario(schedule_preferences)

    # ── Age band ──
    age_band = _derive_age_band(profile.get("age"))

    # ── Academic load score (0-10) ──
    study_blocks_today = sum(
        1 for e in today_events_raw if e.get("event_type") == "study"
    )
    academic_load_score = min(10, len(exams_raw) * 1.5 + study_blocks_today * 0.5)

    # ── Readiness components ──
    readiness_components = None
    if latest_checkin:
        readiness_components = ReadinessComponents(
            energy=latest_checkin.get("energy", 0),
            soreness=latest_checkin.get("soreness", 0),
            sleep_hours=latest_checkin.get("sleep_hours", 0),
            mood=latest_checkin.get("mood", 0),
            academic_stress=latest_checkin.get("academic_stress"),
            pain_flag=latest_checkin.get("pain_flag", False),
        )

    # ── Calendar events → Pydantic models ──
    today_events = [
        CalendarEvent(
            id=str(e["id"]),
            title=e.get("title", ""),
            event_type=e.get("event_type", ""),
            start_at=str(e.get("start_at", "")),
            end_at=str(e["end_at"]) if e.get("end_at") else None,
            notes=e.get("notes"),
            intensity=e.get("intensity"),
        )
        for e in today_events_raw
    ]

    upcoming_exams = [
        CalendarEvent(
            id=str(e["id"]),
            title=e.get("title", ""),
            event_type=e.get("event_type", ""),
            start_at=str(e.get("start_at", "")),
            end_at=str(e["end_at"]) if e.get("end_at") else None,
            notes=e.get("notes"),
            intensity=e.get("intensity"),
        )
        for e in exams_raw
    ]

    upcoming_events = [
        CalendarEvent(
            id=str(e["id"]),
            title=e.get("title", ""),
            event_type=e.get("event_type", ""),
            start_at=str(e.get("start_at", "")),
            end_at=str(e["end_at"]) if e.get("end_at") else None,
            notes=e.get("notes"),
            intensity=e.get("intensity"),
        )
        for e in upcoming_events_raw
    ]

    # ── Temporal context ──
    temporal_context = _build_temporal_context(
        current_time=current_time,
        today_events=today_events_raw,
        exams=exams_raw,
        latest_checkin=latest_checkin,
        academic_load_score=academic_load_score,
        tz_name=tz,
    )

    # ── Snapshot enrichment (Layer 2) ──
    snapshot_enrichment = None
    if snapshot:
        snapshot_enrichment = _build_snapshot_enrichment(
            snapshot, vitals_raw, projected_load_sum
        )

    # ── Planning context ──
    planning_context = None
    if snapshot:
        planning_context = PlanningContext(
            active_mode=snapshot.get("athlete_mode"),
            mode_params=None,
            applicable_protocols=snapshot.get("applicable_protocol_ids") or [],
            dual_load_zone=snapshot.get("dual_load_zone"),
            exam_proximity_score=snapshot.get("exam_proximity_score"),
            data_confidence_score=snapshot.get("data_confidence_score"),
        )

    # ── Active recommendations ──
    active_recommendations = [
        ActiveRecommendation(
            rec_type=r.get("rec_type", ""),
            priority=r.get("priority", 5),
            title=r.get("title", ""),
            body_short=r.get("body_short", ""),
            confidence=r.get("confidence_score", 0),
        )
        for r in recs_raw
    ]

    # ── Vitals ──
    recent_vitals = [
        {"metric": v.get("metric_type", ""), "value": v.get("value", 0), "date": str(v.get("date", ""))}
        for v in vitals_raw
    ]

    # ── Test scores ──
    recent_test_scores = [
        {"test_type": t.get("test_type", ""), "score": t.get("score", 0), "date": str(t.get("date", ""))}
        for t in test_results
    ]

    logger.info(
        f"Context assembled for {user_id} | "
        f"events={len(today_events)} exams={len(upcoming_exams)} "
        f"snapshot={'yes' if snapshot else 'no'} aib={'yes' if aib_text else 'no'}"
    )

    return PlayerContext(
        user_id=user_id,
        name=profile.get("name", "Athlete"),
        sport=profile.get("sport", "football"),
        position=profile.get("position"),
        age_band=age_band,
        gender=profile.get("gender"),
        height_cm=profile.get("height_cm"),
        weight_kg=profile.get("weight_kg"),
        role=profile.get("role", "player"),
        today_date=today,
        current_time=current_time,
        today_events=today_events,
        readiness_score=latest_checkin.get("readiness") if latest_checkin else None,
        checkin_date=str(latest_checkin["date"]) if latest_checkin and latest_checkin.get("date") else None,
        readiness_components=readiness_components,
        upcoming_exams=upcoming_exams,
        upcoming_events=upcoming_events,
        academic_load_score=academic_load_score,
        recent_vitals=recent_vitals,
        current_streak=profile.get("current_streak", 0) or 0,
        benchmark_profile=None,  # Full benchmark porting in Phase 4
        recent_test_scores=recent_test_scores,
        temporal_context=temporal_context,
        schedule_preferences=schedule_preferences,
        active_scenario=active_scenario,
        active_tab=active_tab,
        last_user_message=last_user_message,
        timezone=tz,
        snapshot_enrichment=snapshot_enrichment,
        active_recommendations=active_recommendations,
        planning_context=planning_context,
    )


# ── LangGraph node wrapper ──────────────────────────────────────────

async def context_assembly_node(state: TomoChatState) -> dict:
    """
    LangGraph node that populates player_context and aib_summary in state.
    Called as the first node in the supervisor graph.
    """
    import time
    start = time.monotonic()

    user_id = state["user_id"]
    active_tab = state.get("active_tab", "Chat")
    tz = state.get("timezone", "UTC")

    # Get the last user message from the messages list
    last_message = ""
    messages = state.get("messages", [])
    if messages:
        last_msg = messages[-1]
        if hasattr(last_msg, "content"):
            last_message = str(last_msg.content)

    # Build context + fetch AIB + fetch memory in parallel
    from app.services.memory_service import fetch_memory_context

    pool = get_pool()
    context_task = build_player_context(user_id, active_tab, last_message, tz)
    memory_task = fetch_memory_context(user_id)

    if pool:
        aib_task = _fetch_aib(pool, user_id)
        context, aib_summary, memory_ctx = await asyncio.gather(
            context_task, aib_task, memory_task
        )
    else:
        context = await context_task
        aib_summary = None
        memory_ctx = await memory_task

    # Format memory for prompt injection
    memory_text = memory_ctx.format_for_prompt() if memory_ctx else ""

    elapsed_ms = (time.monotonic() - start) * 1000
    logger.info(
        f"Context assembly completed in {elapsed_ms:.0f}ms for {user_id} "
        f"(memory={'yes' if memory_text else 'no'}, "
        f"zep_facts={len(memory_ctx.zep_facts) if memory_ctx else 0})"
    )

    return {
        "player_context": context,
        "aib_summary": aib_summary,
        "memory_context": memory_text if memory_text else None,
    }
