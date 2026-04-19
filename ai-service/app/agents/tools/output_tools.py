"""
Tomo AI Service — Output Agent Tools (16 tools)
Readiness, performance, vitals, drills, programs, journals.

Sprint 1 decomposition: test/benchmark tools moved to testing_benchmark_tools.py.
Factory function creates tools bound to a specific user_id + PlayerContext.
Read tools query Supabase directly via psycopg3.
Write tools defer to the TS bridge for event pipeline integration.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, date as date_type

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.output")


def _safe_float(v, default=None):
    """Safely convert Decimal/str to float."""
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _row_to_dict(row, columns):
    """Convert a psycopg3 row tuple to dict using column names."""
    if row is None:
        return None
    return {col: row[i] for i, col in enumerate(columns)}


def _normalize_program_name(s: str) -> str:
    """Canonicalize a program name for fuzzy matching: lowercase, strip, unify & / and, drop punctuation."""
    if not s:
        return ""
    out = s.lower().strip()
    out = out.replace("&", "and")
    for ch in ("-", "_", ".", ",", "'"):
        out = out.replace(ch, " ")
    return " ".join(out.split())


async def _load_athlete_gaps(user_id: str, limit: int = 5) -> list[dict]:
    """Return the athlete's weakest benchmark metrics (percentile < 50) — the real gaps
    a program should address. Pulled from player_benchmark_snapshots (the same source
    the Metrics tab reads). Empty list on any missing/invalid state.
    """
    from app.db.supabase import get_pool
    pool = get_pool()
    try:
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT DISTINCT ON (metric_key) metric_key, metric_label,
                          percentile, zone, value, tested_at::text
                   FROM player_benchmark_snapshots
                   WHERE user_id = %s AND percentile IS NOT NULL AND percentile < 50
                   ORDER BY metric_key, tested_at DESC""",
                (user_id,),
            )
            rows = await result.fetchall()
    except Exception as e:
        logger.warning(f"_load_athlete_gaps: benchmark read failed: {e}")
        return []

    gaps = [
        {
            "metric": row[0],
            "label": row[1],
            "percentile": int(row[2]) if row[2] is not None else None,
            "zone": row[3],
            "value": _safe_float(row[4]),
            "tested_at": row[5],
        }
        for row in rows
    ]
    gaps.sort(key=lambda g: g["percentile"] if g["percentile"] is not None else 100)
    return gaps[:limit]


def _match_gaps_to_program(program: dict, gaps: list[dict]) -> list[dict]:
    """Return the subset of athlete gaps that the program is likely to address.
    Uses program.tags + program.category as the matching signal — same taxonomy
    used by the recommendation engine when ranking programs.
    """
    if not gaps:
        return []
    tags_raw = program.get("tags") or []
    if not isinstance(tags_raw, list):
        tags_raw = []
    category = (program.get("category") or "").lower()

    # Build a token bag: tags + category + split tokens (e.g. "combination_play" → {combination, play})
    tokens: set[str] = set()
    for t in tags_raw:
        if isinstance(t, str):
            tokens.add(t.lower())
            tokens.update(t.lower().split("_"))
    if category:
        tokens.add(category)
        tokens.update(category.split("_"))

    matched: list[dict] = []
    for g in gaps:
        metric = (g.get("metric") or "").lower()
        label = (g.get("label") or "").lower()
        hay = metric + " " + label
        if any(tok and tok in hay for tok in tokens):
            matched.append(g)
    return matched


async def _load_snapshot_programs(user_id: str) -> list[dict]:
    """Read the athlete's AI-generated program recommendations from athlete_snapshots.program_recommendations.

    Single source of truth: same JSONB the mobile Programs tab renders (see
    backend/services/programs/deepProgramRefresh.ts → DeepProgramResult.programs).
    Returns [] on any missing/invalid state — never raises.
    """
    from app.db.supabase import get_pool
    pool = get_pool()
    try:
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT program_recommendations
                   FROM athlete_snapshots
                   WHERE athlete_id = %s
                   LIMIT 1""",
                (user_id,),
            )
            row = await result.fetchone()
    except Exception as e:
        logger.warning(f"_load_snapshot_programs: snapshot read failed: {e}")
        return []

    if not row or not row[0]:
        return []

    payload = row[0]
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            return []
    if not isinstance(payload, dict):
        return []

    programs = payload.get("programs") or []
    if not isinstance(programs, list):
        return []

    out: list[dict] = []
    for p in programs:
        if isinstance(p, dict) and p.get("programId") and p.get("name"):
            out.append(p)
    return out


def make_output_tools(user_id: str, context: PlayerContext) -> list:
    """Create output agent tools bound to a specific user context."""

    @tool
    async def get_readiness_detail(date: str = "") -> dict:
        """Get detailed readiness breakdown — energy, soreness, sleep quality, mood, pain flag, wellness score. Defaults to today if no date given."""
        from app.db.supabase import get_pool
        pool = get_pool()
        target_date = date or context.today_date

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT energy, soreness, sleep_hours, mood, academic_stress,
                          pain_flag, pain_location, readiness, intensity,
                          effort_yesterday, date::text
                   FROM checkins
                   WHERE user_id = %s AND date = %s
                   ORDER BY date DESC LIMIT 1""",
                (user_id, target_date),
            )
            row = await result.fetchone()

        if not row:
            return {"error": "No check-in found", "date": target_date, "suggestion": "Complete a check-in first"}

        return {
            "date": target_date,
            "energy": _safe_float(row[0]),
            "soreness": _safe_float(row[1]),
            "sleep_hours": _safe_float(row[2]),
            "mood": _safe_float(row[3]),
            "academic_stress": _safe_float(row[4]),
            "pain_flag": bool(row[5]),
            "pain_location": row[6],
            "readiness": row[7],
            "intensity": row[8],
            "effort_yesterday": _safe_float(row[9]),
            "checked_in_date": row[10],
            "is_today": target_date == context.today_date,
        }

    @tool
    async def get_vitals_trend(days: int = 7) -> dict:
        """Get vitals trend (HRV, resting heart rate, sleep, SpO2) over the last N days. Use for trend analysis or when athlete asks about their vitals."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT metric_type, value, date::text, source
                   FROM health_data
                   WHERE user_id = %s AND date >= %s
                   ORDER BY date DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        metrics: dict[str, list] = {}
        for row in rows:
            name = row[0]
            if name not in metrics:
                metrics[name] = []
            metrics[name].append({
                "value": _safe_float(row[1]),
                "date": row[2],
                "source": row[3],
            })

        return {"days": days, "since": since, "metrics": metrics, "total_readings": len(rows)}

    @tool
    async def get_checkin_history(days: int = 7) -> dict:
        """Get check-in history over the last N days. Shows energy, soreness, sleep, mood trends."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT energy, soreness, sleep_hours, mood, academic_stress,
                          pain_flag, readiness, date::text
                   FROM checkins
                   WHERE user_id = %s AND date >= %s
                   ORDER BY date DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        history = [
            {
                "date": row[7],
                "energy": _safe_float(row[0]),
                "soreness": _safe_float(row[1]),
                "sleep_hours": _safe_float(row[2]),
                "mood": _safe_float(row[3]),
                "academic_stress": _safe_float(row[4]),
                "pain_flag": bool(row[5]),
                "readiness": row[6],
            }
            for row in rows
        ]

        return {"days": days, "check_ins": history, "total": len(history)}

    @tool
    async def get_dual_load_score() -> dict:
        """Get the athlete's current dual load index (athletic + academic balance), ACWR, ATL, CTL, injury risk, and projected load. Use when athlete asks about load, overload, ACWR, or training volume."""
        se = context.snapshot_enrichment
        if not se:
            return {"error": "No snapshot data available", "suggestion": "Complete a check-in to populate load data"}

        dli = se.dual_load_index or 0
        zone = "LOW" if dli < 40 else "MODERATE" if dli < 70 else "HIGH"
        modifier = "1.0x" if dli < 40 else "0.85x" if dli < 70 else "0.75x"

        return {
            "acwr": se.acwr,
            "atl_7day": se.atl_7day,
            "ctl_28day": se.ctl_28day,
            "injury_risk": se.injury_risk_flag,
            "projected_acwr": se.projected_acwr,
            "dual_load_index": dli,
            "dual_load_zone": zone,
            "intensity_modifier": modifier,
            "athletic_load_7day": se.athletic_load_7day,
            "academic_load_7day": se.academic_load_7day,
            "training_monotony": se.training_monotony,
            "training_strain": se.training_strain,
        }

    @tool
    async def log_check_in(
        energy: int = 3,
        soreness: int = 3,
        sleepHours: float = 7.0,
        mood: int = 3,
        painFlag: bool = False,
        effortYesterday: int = 5,
        academicStress: int = 0,
        painLocation: str = "",
    ) -> dict:
        """Log a daily wellness check-in. Energy, soreness, mood, effortYesterday: 1-10 scale. Sleep in hours. Pain flag if experiencing pain. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/checkin",
            {
                "energy": energy,
                "soreness": soreness,
                "sleepHours": sleepHours,
                "mood": mood,
                "painFlag": painFlag,
                "effortYesterday": effortYesterday,
                "academicStress": academicStress or None,
                "painLocation": painLocation or None,
            },
            user_id=user_id,
        )

    # NOTE: get_test_results moved to testing_benchmark_tools.py (Sprint 1)

    @tool
    async def get_training_session(
        category: str = "general",
        intensity: str = "",
        duration_min: int = 45,
    ) -> dict:
        """Generate a training session with drills. Categories: general, speed, strength, agility, recovery, technical, endurance. Intensity auto-selected from readiness if empty. Matches drills to athlete's sport/position."""
        from app.db.supabase import get_pool
        pool = get_pool()

        # ── LOAD ADVISORY (advisory only — never block, never swap category) ──
        # Check injury_risk_flag + ACWR and add advisory note to response.
        # The athlete's choice is respected — we inform, we don't override.
        se = context.snapshot_enrichment
        load_advisory = ""
        risk_reasons: list[str] = []

        if se:
            if se.injury_risk_flag and se.injury_risk_flag.upper() == "RED":
                risk_reasons.append("injury risk is elevated")
            if se.acwr is not None and se.acwr > 1.5:
                risk_reasons.append(f"training load has been spiking")
            if se.acwr is not None and se.acwr > 1.3:
                risk_reasons.append("load is building")

        if risk_reasons:
            load_advisory = (
                f"Advisory: {', '.join(risk_reasons)}. "
                "Consider keeping intensity controlled. The athlete chose this session — respect their decision."
            )
            logger.info(f"LOAD ADVISORY: {', '.join(risk_reasons)} — delivering requested {category}/{intensity}")
            # Suggest lighter intensity but DON'T force it
            if not intensity:
                intensity = "MODERATE"  # Default to moderate when load is elevated, not LIGHT

        if not intensity:
            # Auto-select intensity from readiness
            readiness = context.readiness_score
            if readiness == "Red":
                intensity = "LIGHT"
            elif readiness == "Yellow":
                intensity = "MODERATE"
            else:
                intensity = "HARD"

        sport = (context.sport or "football").lower()
        position = context.position or "General"

        # Map session category to DB query strategy:
        # DB categories are: warmup, training, cooldown, recovery, activation
        # Session types (speed, strength, technical) map to attribute_keys, not category
        _CATEGORY_TO_ATTRIBUTES = {
            "speed": ["pace", "sprint", "acceleration", "agility"],
            "strength": ["strength", "power", "endurance"],
            "technical": ["dribbling", "passing", "shooting", "first_touch"],
            "agility": ["agility", "reaction", "lateral"],
            "endurance": ["endurance", "stamina", "conditioning"],
        }
        target_attrs = _CATEGORY_TO_ATTRIBUTES.get(category.lower(), [])

        async with pool.connection() as conn:
            if target_attrs and category.lower() not in ("recovery", "warmup", "cooldown", "activation"):
                # Query by attribute_keys for training-type sessions
                # attribute_keys is JSONB array — check if ANY target attribute overlaps
                attr_conditions = " OR ".join(
                    [f"attribute_keys @> '[\"{attr}\"]'::jsonb" for attr in target_attrs]
                )
                result = await conn.execute(
                    f"""SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND (intensity = %s OR intensity = 'light')
                         AND ({attr_conditions})
                         AND active = true
                       ORDER BY RANDOM()
                       LIMIT 6""",
                    (sport, intensity.lower()),
                )
            else:
                # Direct category match for recovery, warmup, cooldown
                result = await conn.execute(
                    """SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND (intensity = %s OR intensity = 'light')
                         AND category = %s
                         AND active = true
                       ORDER BY RANDOM()
                       LIMIT 6""",
                    (sport, intensity.lower(), category.lower()),
                )
            rows = await result.fetchall()

            # If the training query returned nothing, short-circuit to
            # the fallback template BEFORE appending warmup/cooldown
            # bookends. Previously the unconditional bookend append
            # below would inflate `rows` to 2 items (just warmup +
            # cooldown) even when the core training content was empty,
            # and the `if not drills` fallback check later never fired.
            # Result: athletes who picked "Endurance" got a session
            # that was literally just a stretch + a jog, zero actual
            # endurance work.
            training_rows_empty = (
                not rows
                and category.lower() not in ("recovery", "warmup", "cooldown", "activation")
            )

            # Always add warmup + cooldown drills if this is a training
            # session AND we actually got real training rows. When we
            # fall through to a fallback template below the template
            # brings its own bookends, so skipping here avoids doubling.
            if not training_rows_empty and category.lower() not in ("recovery", "warmup", "cooldown"):
                warmup_result = await conn.execute(
                    """SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND category = 'warmup' AND active = true
                       ORDER BY RANDOM() LIMIT 1""",
                    (sport,),
                )
                cooldown_result = await conn.execute(
                    """SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND category = 'cooldown' AND active = true
                       ORDER BY RANDOM() LIMIT 1""",
                    (sport,),
                )
                warmup_rows = await warmup_result.fetchall()
                cooldown_rows = await cooldown_result.fetchall()
                rows = list(warmup_rows) + list(rows) + list(cooldown_rows)

        drills = [
            {
                # Coerce UUID -> str at the tool boundary. The DB driver
                # returns uuid.UUID objects which aren't JSON serializable,
                # and every downstream consumer (multi_step card builder,
                # LLM tool_message payload, format_response, mobile) needs
                # a plain string. Root-cause fix here means no defensive
                # coercion scattered across the pipeline.
                "drill_id": str(row[0]) if row[0] is not None else None,
                "name": row[1],
                "category": row[2],
                "duration_min": row[3] or 15,
                "intensity": row[4] or intensity,
                "description": row[5],
                "primary_attribute": (row[6] or [None])[0] if row[6] else None,
            }
            for row in rows
        ]

        # If no drills found in DB, provide a fallback template so the
        # LLM always has content for the session_plan card. Each template
        # is self-contained (includes its own warmup + cooldown) because
        # the bookend append above is skipped when we land here.
        #
        # Evidence-based defaults -- not generic filler. The templates
        # are scoped by training category so the athlete gets the
        # actual work they asked for, not a mobility reroute.
        if not drills:
            logger.info(
                f"No drills in DB for {sport}/{category}/{intensity} "
                f"-- using fallback template"
            )
            _FALLBACK_SESSIONS = {
                "speed": [
                    {"name": "Dynamic Warm-Up", "category": "warmup", "duration_min": 10, "intensity": "LIGHT", "description": "A-skips, high knees, leg swings, build-up sprints"},
                    {"name": "Acceleration Sprints (10m)", "category": "speed", "duration_min": 8, "intensity": intensity, "description": "6 x 10m from standing start, 90s rest"},
                    {"name": "Flying Sprints (20m)", "category": "speed", "duration_min": 8, "intensity": intensity, "description": "4 x 20m at 85-90% effort, 2min rest"},
                    {"name": "Agility Ladder Drill", "category": "agility", "duration_min": 6, "intensity": "MODERATE", "description": "In-out, lateral shuffle, icky shuffle patterns"},
                    {"name": "Cool-Down & Stretch", "category": "recovery", "duration_min": 8, "intensity": "LIGHT", "description": "Static stretch -- quads, hamstrings, hip flexors, calves"},
                ],
                "strength": [
                    {"name": "Warm-Up", "category": "warmup", "duration_min": 10, "intensity": "LIGHT", "description": "Light jog, dynamic stretching, activation bands"},
                    {"name": "Goblet Squat", "category": "strength", "duration_min": 8, "intensity": intensity, "description": "4 x 8 reps, RPE 7, 90s rest"},
                    {"name": "Romanian Deadlift", "category": "strength", "duration_min": 8, "intensity": intensity, "description": "3 x 10 reps, RPE 6, 90s rest"},
                    {"name": "Split Squat", "category": "strength", "duration_min": 6, "intensity": intensity, "description": "3 x 8 each side, bodyweight or light DB"},
                    {"name": "Cool-Down", "category": "recovery", "duration_min": 7, "intensity": "LIGHT", "description": "Foam roll + static stretch"},
                ],
                "endurance": [
                    {"name": "Dynamic Warm-Up Jog", "category": "warmup", "duration_min": 10, "intensity": "LIGHT", "description": "5 min easy jog + leg swings, lunges, A-skips to raise core temp"},
                    {"name": "Tempo Run Intervals", "category": "endurance", "duration_min": 12, "intensity": intensity, "description": "4 x 3 min at sustained threshold pace, 60s jog recovery between reps"},
                    {"name": "Fartlek Pace Play", "category": "endurance", "duration_min": 10, "intensity": "MODERATE", "description": "10 min continuous run alternating 30s surge / 60s cruise, sport-specific movement patterns"},
                    {"name": "Aerobic Capacity Build", "category": "endurance", "duration_min": 8, "intensity": "MODERATE", "description": "8 min steady-state at conversation pace, focus on relaxed shoulders and rhythmic breathing"},
                    {"name": "Cool-Down Jog + Stretch", "category": "recovery", "duration_min": 8, "intensity": "LIGHT", "description": "3 min easy jog to flush, then static stretch hamstrings, quads, calves, hips"},
                ],
                "technical": [
                    {"name": "Ball-Touch Warm-Up", "category": "warmup", "duration_min": 10, "intensity": "LIGHT", "description": "Light jog + 200 controlled touches (inside, outside, sole, laces) to wake up feet and hips"},
                    {"name": "Passing & Receiving Circuit", "category": "technical", "duration_min": 10, "intensity": "MODERATE", "description": "Partner or wall passes, both feet, first-touch control into space, 3 sets of 2 min"},
                    {"name": "1v1 Shadow Moves", "category": "technical", "duration_min": 10, "intensity": intensity, "description": "Cone-based 1v1 footwork -- step-over, cut-back, drop-shoulder. Quality over speed"},
                    {"name": "Finishing / Execution Reps", "category": "technical", "duration_min": 8, "intensity": intensity, "description": "10 reps of sport-specific finish (shot, serve, layup) from match-realistic angles"},
                    {"name": "Cool-Down Technical Reset", "category": "recovery", "duration_min": 7, "intensity": "LIGHT", "description": "Slow-tempo touches + mobility flow -- ankles, hips, thoracic spine"},
                ],
                "agility": [
                    {"name": "Dynamic Prep", "category": "warmup", "duration_min": 8, "intensity": "LIGHT", "description": "Ankle pops, A-skips, carioca, lateral shuffles to prime change-of-direction tissue"},
                    {"name": "Ladder Footwork", "category": "agility", "duration_min": 8, "intensity": "MODERATE", "description": "In-out, icky shuffle, lateral run, carioca -- 2 sets each, focus on foot-ground contact time"},
                    {"name": "5-10-5 Shuttle", "category": "agility", "duration_min": 8, "intensity": intensity, "description": "6 reps of the pro-agility shuttle, full recovery between reps, both directions"},
                    {"name": "Reactive Cut Drill", "category": "agility", "duration_min": 8, "intensity": intensity, "description": "React to coach's pointer or call, 30s work / 30s rest x 6 -- trains unplanned cuts"},
                    {"name": "Cool-Down & Hip Mobility", "category": "recovery", "duration_min": 8, "intensity": "LIGHT", "description": "Walking lunges, 90/90 hip rotations, pigeon stretch -- restore hip range"},
                ],
                "general": [
                    {"name": "Dynamic Warm-Up", "category": "warmup", "duration_min": 10, "intensity": "LIGHT", "description": "Movement flow -- lunges, inchworms, leg swings, high knees. Raise temp and range"},
                    {"name": "Movement Prep", "category": "activation", "duration_min": 8, "intensity": "MODERATE", "description": "Band pull-aparts, glute bridges, shoulder taps -- switch on stabilizers before load"},
                    {"name": "Main Session Block", "category": "training", "duration_min": 15, "intensity": intensity, "description": "Sport-specific work block -- strength, conditioning, or technical, scaled to readiness"},
                    {"name": "Conditioning Finisher", "category": "conditioning", "duration_min": 5, "intensity": intensity, "description": "3 rounds of short, hard work -- shuttles, burpees, or hill sprints"},
                    {"name": "Cool-Down & Stretch", "category": "recovery", "duration_min": 7, "intensity": "LIGHT", "description": "Walk it out, static stretch, deep breathing to reset parasympathetic"},
                ],
                "recovery": [
                    {"name": "Foam Rolling", "category": "recovery", "duration_min": 10, "intensity": "LIGHT", "description": "Full body -- quads, IT band, glutes, upper back"},
                    {"name": "Dynamic Mobility", "category": "recovery", "duration_min": 10, "intensity": "LIGHT", "description": "Hip circles, thoracic rotations, ankle mobility"},
                    {"name": "Light Stretching", "category": "recovery", "duration_min": 10, "intensity": "LIGHT", "description": "Hold each stretch 30-45s, breathe through it"},
                    {"name": "Breathing Reset", "category": "recovery", "duration_min": 5, "intensity": "LIGHT", "description": "Box breathing 4-4-4-4, lying down, eyes closed"},
                ],
            }
            # Fall back to "general" (not "recovery") so an unknown
            # category still delivers actual training content instead
            # of rerouting the athlete into a mobility session.
            drills = _FALLBACK_SESSIONS.get(
                category.lower(),
                _FALLBACK_SESSIONS.get("general", []),
            )

        result = {
            "category": category,
            "intensity": intensity,
            "readiness": context.readiness_score,
            "sport": sport,
            "position": position,
            "total_duration_min": duration_min,
            "drills": drills,
        }
        if load_advisory:
            result["load_advisory"] = load_advisory
        return result

    @tool
    async def get_drill_detail(drill_id: str) -> dict:
        """Get full details for a specific drill by ID. Includes description, equipment, progressions, instructions."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, category, duration_minutes, intensity,
                          description, instructions, attribute_keys, sport_id,
                          video_url
                   FROM training_drills WHERE id = %s""",
                (drill_id,),
            )
            row = await result.fetchone()

        if not row:
            return {"error": f"Drill {drill_id} not found"}

        return {
            "drill_id": str(row[0]) if row[0] is not None else None,
            "name": row[1],
            "category": row[2],
            "duration_min": row[3] or 15,
            "intensity": row[4],
            "description": row[5],
            "instructions": row[6],
            "primary_attribute": (row[7] or [None])[0] if row[7] else None,
            "sport": row[8],
            "media_url": row[9],
        }

    # NOTE: get_benchmark_comparison moved to testing_benchmark_tools.py (Sprint 1)

    @tool
    async def get_training_program_recommendations() -> dict:
        """Get personalized training program recommendations based on athlete's gaps, readiness, and position. Returns up to 5 programs ranked by priority. Call get_my_programs first to check what they already have."""
        from app.db.supabase import get_pool
        pool = get_pool()

        try:
            async with pool.connection() as conn:
                result = await conn.execute(
                    """SELECT id, name, category, type, description, difficulty,
                              duration_minutes, tags, position_emphasis, equipment
                       FROM training_programs
                       ORDER BY name
                       LIMIT 10""",
                )
                rows = await result.fetchall()
        except Exception as e:
            logger.warning(f"get_training_program_recommendations: training_programs table not found: {e}")
            rows = []

        programs = [
            {
                "program_id": str(row[0]) if row[0] is not None else None,
                "name": row[1],
                "category": row[2],
                "type": row[3],
                "description": row[4],
                "difficulty": row[5],
                "duration_minutes": row[6],
                "tags": row[7],
                "position_emphasis": row[8],
                "equipment": row[9],
            }
            for row in rows
        ]

        return {
            "sport": context.sport or "football",
            "position": context.position,
            "readiness": context.readiness_score,
            "programs": programs[:5],
        }

    @tool
    async def calculate_phv_stage(
        height_cm: float = 0,
        weight_kg: float = 0,
        sitting_height_cm: float = 0,
        dob: str = "",
    ) -> dict:
        """Calculate Peak Height Velocity (PHV) maturity stage. Requires height, weight, sitting height, and date of birth. Returns stage (PRE/MID/POST), offset years, loading multiplier, and contraindicated exercises."""
        if not all([height_cm, sitting_height_cm, dob]):
            return {"error": "Need height_cm, sitting_height_cm, and dob (YYYY-MM-DD) to calculate PHV"}

        # Mirwald equation
        try:
            birth = datetime.strptime(dob, "%Y-%m-%d")
            age_years = (datetime.now() - birth).days / 365.25
            leg_length = height_cm - sitting_height_cm
            sitting_ratio = sitting_height_cm / height_cm

            # Mirwald offset (simplified)
            offset = -9.236 + (0.0002708 * (leg_length * sitting_height_cm)) + \
                     (-0.001663 * (age_years * leg_length)) + \
                     (0.007216 * (age_years * sitting_height_cm)) + \
                     (0.02292 * (weight_kg / height_cm * 100))
        except Exception:
            return {"error": "Invalid measurements. Check dob format (YYYY-MM-DD) and measurements."}

        if offset < -1:
            stage = "PRE"
            multiplier = 1.0
        elif offset <= 1:
            stage = "MID"
            multiplier = 0.6
        else:
            stage = "POST"
            multiplier = 1.0

        higher_risk = []
        alternatives = []
        if stage == "MID":
            higher_risk = ["Barbell back squat", "Depth/drop jumps", "Olympic lifts", "Maximal sprint", "Heavy deadlift"]
            alternatives = ["Goblet squat", "Soft-landing box steps", "Light dumbbells/kettlebells",
                          "85% effort accel-decel drills", "Trap bar / partial ROM"]

        return {
            "phv_stage": stage,
            "offset_years": round(offset, 2),
            "chronological_age": round(age_years, 1),
            "loading_multiplier": multiplier,
            "higher_risk_movements": higher_risk,
            "safe_alternatives": alternatives,
            "advisory": "These movements carry extra risk during growth — suggest alternatives but respect athlete's decision" if higher_risk else "",
        }

    @tool
    async def get_my_programs() -> dict:
        """Get the athlete's currently active/recommended training programs — the exact same list shown in the mobile Programs tab. Sourced from athlete_snapshots.program_recommendations (AI-personalized by deepProgramRefresh)."""
        snapshot_programs = await _load_snapshot_programs(user_id)

        if not snapshot_programs:
            return {
                "programs": [],
                "total": 0,
                "dataStatus": "generating",
                "hint": (
                    "No personalized program list yet — the athlete's Programs tab is still generating. "
                    "Suggest completing a check-in or logging a test to accelerate personalization."
                ),
            }

        programs = [
            {
                "program_id": p.get("programId"),
                "name": p.get("name"),
                "category": p.get("category"),
                "type": p.get("type"),
                "priority": p.get("priority"),
                "description": p.get("description"),
                "impact": p.get("impact"),
                "frequency": p.get("frequency"),
                "duration_minutes": p.get("durationMin"),
                "duration_weeks": p.get("durationWeeks"),
                "difficulty": p.get("difficulty"),
                "tags": p.get("tags") or [],
                "position_note": p.get("positionNote"),
                "reason": p.get("reason"),
                "phv_warnings": p.get("phvWarnings") or [],
            }
            for p in snapshot_programs
        ]

        return {
            "programs": programs,
            "total": len(programs),
            "dataStatus": "ready",
        }

    @tool
    async def get_program_by_name(program_name: str) -> dict:
        """Look up a specific program from the athlete's active/recommended list by its name. Use this when the athlete refers to a program by title (e.g. 'explain my Combination Play & Link-Up program'). Case-insensitive; tolerant of '&' vs 'and', hyphens, and extra whitespace. Reads the same snapshot the Programs tab renders."""
        if not program_name or not program_name.strip():
            return {"error": "program_name is required"}

        snapshot_programs = await _load_snapshot_programs(user_id)

        if not snapshot_programs:
            return {
                "error": f"Program '{program_name}' not found — no personalized list yet",
                "dataStatus": "generating",
                "suggestion": "The athlete's program list is still generating. Ask them to open the Programs tab to prompt generation.",
            }

        query = _normalize_program_name(program_name)
        exact: list[dict] = []
        partial: list[dict] = []
        for p in snapshot_programs:
            candidate = _normalize_program_name(p.get("name") or "")
            if not candidate:
                continue
            if candidate == query:
                exact.append(p)
            elif query in candidate or candidate in query:
                partial.append(p)

        matches = exact or partial
        if not matches:
            available = [p.get("name") for p in snapshot_programs if p.get("name")]
            return {
                "error": f"Program '{program_name}' is not in the athlete's active list",
                "available_programs": available,
                "suggestion": "Offer one of the available programs, or call get_catalog_program_by_name for discovery across the full catalog.",
            }

        matched = matches[0]
        gaps = await _load_athlete_gaps(user_id)
        targeted = _match_gaps_to_program(matched, gaps)

        return {
            "program_id": matched.get("programId"),
            "name": matched.get("name"),
            "category": matched.get("category"),
            "type": matched.get("type"),
            "priority": matched.get("priority"),
            "description": matched.get("description"),
            "impact": matched.get("impact"),
            "frequency": matched.get("frequency"),
            "duration_minutes": matched.get("durationMin"),
            "duration_weeks": matched.get("durationWeeks"),
            "difficulty": matched.get("difficulty"),
            "tags": matched.get("tags") or [],
            "position_note": matched.get("positionNote"),
            "reason": matched.get("reason"),
            "phv_warnings": matched.get("phvWarnings") or [],
            "prescription": matched.get("prescription") or {},
            # Personalization: the athlete's actual benchmark gaps that this program targets.
            # The LLM must weave these into the "why this matters for YOU" copy.
            "athlete_context": {
                "position": context.position,
                "sport": context.sport,
                "age_band": context.age_band,
                "readiness_score": context.readiness_score,
                "priority_in_plan": matched.get("priority"),
            },
            "targeted_gaps": targeted,
            "other_gaps": [g for g in gaps if g not in targeted][:3],
            "other_matches": [m.get("name") for m in matches[1:5]],
            "dataStatus": "ready",
            "follow_up_tool": "get_program_drill_breakdown",  # LLM hint for drill-down chip
        }

    @tool
    async def get_program_drill_breakdown(program_id: str = "", program_name: str = "") -> dict:
        """Return a detailed drill/prescription breakdown for a single program — use when the athlete asks to see the drills, exercises, or the full session detail for a program (triggered by a 'See the drills' chip or 'show me the drills for X'). Accepts either program_id (slug from the snapshot) OR program_name (case-insensitive, tolerant of &/and/hyphens). Returns prescription dose, coaching cues, drill patterns parsed from the program description, equipment, PHV warnings, and the athlete's targeted gaps."""
        if not program_id and not program_name:
            return {"error": "Provide program_id or program_name"}

        snapshot_programs = await _load_snapshot_programs(user_id)
        if not snapshot_programs:
            return {
                "error": "No personalized program list yet",
                "dataStatus": "generating",
                "suggestion": "Ask the athlete to open the Programs tab to prompt generation, or log a test to accelerate it.",
            }

        # Resolve by id first (exact), then by fuzzy name
        matched: dict | None = None
        if program_id:
            for p in snapshot_programs:
                if (p.get("programId") or "").lower() == program_id.lower():
                    matched = p
                    break
        if not matched and program_name:
            q = _normalize_program_name(program_name)
            for p in snapshot_programs:
                candidate = _normalize_program_name(p.get("name") or "")
                if candidate and (candidate == q or q in candidate or candidate in q):
                    matched = p
                    break

        if not matched:
            available = [p.get("name") for p in snapshot_programs if p.get("name")]
            return {
                "error": "Program not found in athlete's active list",
                "available_programs": available,
            }

        prescription = matched.get("prescription") or {}
        description = (matched.get("description") or "").strip()

        # Parse drill patterns from the description — programs encode them as comma/semicolon
        # separated phrases (e.g. "Wall passes, overlaps, underlaps, third-man runs.").
        # Keep it simple and predictable; the LLM fills in context around these labels.
        import re
        # Strip trailing period, then take the first sentence if multi-sentence
        first_sentence = description.split(".")[0] if description else ""
        drill_patterns: list[str] = []
        if first_sentence:
            # Split on commas / " and " / semicolons, drop empty fragments
            raw = re.split(r",|;|\band\b", first_sentence)
            drill_patterns = [p.strip() for p in raw if p.strip() and len(p.strip()) > 2]
        # If the description is a single phrase (no separators), fall back to it as a single drill.
        if not drill_patterns and description:
            drill_patterns = [first_sentence.strip() or description]

        gaps = await _load_athlete_gaps(user_id)
        targeted = _match_gaps_to_program(matched, gaps)

        # Build a structured "session-like" breakdown the LLM can render as a session_plan
        # card or rich text. Warm-up/cool-down are standard scaffolding the LLM adds.
        drills = [
            {
                "pattern": pattern,
                "sets": prescription.get("sets"),
                "reps": prescription.get("reps"),
                "intensity": prescription.get("intensity"),
                "rpe": prescription.get("rpe"),
                "rest": prescription.get("rest"),
            }
            for pattern in drill_patterns
        ]

        return {
            "program_id": matched.get("programId"),
            "name": matched.get("name"),
            "category": matched.get("category"),
            "type": matched.get("type"),
            "priority": matched.get("priority"),
            "description": description,
            "impact": matched.get("impact"),
            "reason": matched.get("reason"),
            "duration_minutes": matched.get("durationMin"),
            "duration_weeks": matched.get("durationWeeks"),
            "difficulty": matched.get("difficulty"),
            "frequency": prescription.get("frequency") or matched.get("frequency"),
            "dose": {
                "sets": prescription.get("sets"),
                "reps": prescription.get("reps"),
                "intensity": prescription.get("intensity"),
                "rpe": prescription.get("rpe"),
                "rest": prescription.get("rest"),
            },
            "coaching_cues": prescription.get("coachingCues") or [],
            "drills": drills,
            "equipment": matched.get("equipment") or [],
            "position_note": matched.get("positionNote"),
            "phv_warnings": matched.get("phvWarnings") or [],
            "targeted_gaps": targeted,
            "athlete_context": {
                "position": context.position,
                "sport": context.sport,
                "age_band": context.age_band,
            },
            "dataStatus": "ready",
        }

    @tool
    async def get_program_by_id(program_id: str) -> dict:
        """Get full details for a specific program by ID. Accepts either the slug ID from the athlete's snapshot (e.g. 'tech_combination_play') or the DB UUID from training_programs. Cascades: snapshot first, then catalog."""
        if not program_id or not program_id.strip():
            return {"error": "program_id is required"}

        # 1) Prefer the athlete's personalized snapshot (same source the UI renders).
        snapshot_programs = await _load_snapshot_programs(user_id)
        for p in snapshot_programs:
            if (p.get("programId") or "").lower() == program_id.lower():
                return {
                    "program_id": p.get("programId"),
                    "name": p.get("name"),
                    "category": p.get("category"),
                    "type": p.get("type"),
                    "priority": p.get("priority"),
                    "description": p.get("description"),
                    "impact": p.get("impact"),
                    "frequency": p.get("frequency"),
                    "duration_minutes": p.get("durationMin"),
                    "duration_weeks": p.get("durationWeeks"),
                    "difficulty": p.get("difficulty"),
                    "tags": p.get("tags") or [],
                    "position_note": p.get("positionNote"),
                    "reason": p.get("reason"),
                    "phv_warnings": p.get("phvWarnings") or [],
                    "prescription": p.get("prescription") or {},
                    "source": "snapshot",
                }

        # 2) Fall back to the catalog. Only attempt UUID lookup when the value looks like a UUID
        #    (psycopg3 raises InvalidTextRepresentation on non-UUID strings against a uuid column).
        import re
        uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

        from app.db.supabase import get_pool
        pool = get_pool()
        prog_row = None
        try:
            async with pool.connection() as conn:
                if uuid_re.match(program_id):
                    prog_result = await conn.execute(
                        """SELECT id, name, category, type, description, difficulty,
                                  duration_minutes, tags, position_emphasis, equipment,
                                  prescriptions, phv_guidance
                           FROM training_programs WHERE id = %s""",
                        (program_id,),
                    )
                    prog_row = await prog_result.fetchone()
        except Exception as e:
            logger.warning(f"get_program_by_id: training_programs catalog lookup failed: {e}")

        if not prog_row:
            return {
                "error": f"Program '{program_id}' not found in the athlete's active list or the catalog",
                "suggestion": "If the athlete referenced the program by name, call get_program_by_name instead.",
            }

        # Parse prescriptions from JSONB
        prescriptions = prog_row[10]
        if isinstance(prescriptions, str):
            try:
                prescriptions = json.loads(prescriptions)
            except (json.JSONDecodeError, TypeError):
                prescriptions = {}

        phv_guidance = prog_row[11]
        if isinstance(phv_guidance, str):
            try:
                phv_guidance = json.loads(phv_guidance)
            except (json.JSONDecodeError, TypeError):
                phv_guidance = {}

        return {
            "program_id": str(prog_row[0]) if prog_row[0] is not None else None,
            "name": prog_row[1],
            "category": prog_row[2],
            "type": prog_row[3],
            "description": prog_row[4],
            "difficulty": prog_row[5],
            "duration_minutes": prog_row[6],
            "tags": prog_row[7],
            "position_emphasis": prog_row[8],
            "equipment": prog_row[9],
            "prescriptions": prescriptions,
            "phv_guidance": phv_guidance,
            "source": "catalog",
        }

    # NOTE: get_test_catalog + log_test_result moved to testing_benchmark_tools.py (Sprint 1)

    @tool
    async def rate_drill(
        drill_id: str,
        rating: int = 3,
        notes: str = "",
    ) -> dict:
        """Rate a drill after completing it. Rating: 1-5 scale. This is a WRITE action."""
        from app.db.supabase import get_pool
        pool = get_pool()

        clamped_rating = max(1, min(5, round(rating)))

        async with pool.connection() as conn:
            result = await conn.execute(
                """INSERT INTO user_drill_history (user_id, drill_id, completed_at, rating, notes)
                   VALUES (%s, %s, NOW(), %s, %s)
                   RETURNING id, drill_id, rating, completed_at::text""",
                (
                    user_id,
                    drill_id,
                    clamped_rating,
                    notes or None,
                ),
            )
            row = await result.fetchone()

        if not row:
            return {"error": "Failed to save drill rating"}

        return {
            "success": True,
            "id": str(row[0]),
            "drill_id": str(row[1]),
            "rating": row[2],
            "completed_at": row[3],
        }

    @tool
    async def get_today_training_for_journal() -> dict:
        """Get today's completed training sessions for pre-training journal entry. Returns events that are eligible for journaling."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type, start_at::text, end_at::text,
                          intensity, notes
                   FROM calendar_events
                   WHERE user_id = %s
                     AND start_at::date = %s::date
                     AND event_type IN ('training', 'match')
                   ORDER BY start_at""",
                (user_id, context.today_date),
            )
            rows = await result.fetchall()

        events = [
            {
                "event_id": str(row[0]) if row[0] is not None else None,
                "title": row[1],
                "type": row[2],
                "start": row[3],
                "end": row[4],
                "intensity": row[5],
                "notes": row[6],
            }
            for row in rows
        ]

        return {"date": context.today_date, "trainable_events": events, "total": len(events)}

    @tool
    async def get_pending_post_journal() -> dict:
        """Check if there are completed sessions pending a post-training journal entry."""
        se = context.snapshot_enrichment
        return {
            "pending_pre": se.pending_pre_journal_count if se else 0,
            "pending_post": se.pending_post_journal_count if se else 0,
            "journal_streak": se.journal_streak_days if se else 0,
        }

    @tool
    async def save_journal_pre(
        calendar_event_id: str,
        pre_target: str = "",
        pre_mental_cue: str = "",
        pre_focus_tag: str = "",
    ) -> dict:
        """Save a pre-training journal entry for a specific calendar event. pre_target: what to focus on (required). pre_mental_cue: mental cue (optional, max 100 chars). pre_focus_tag: one of strength/speed/technique/tactical/fitness (optional). This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        body: dict = {
            "calendar_event_id": calendar_event_id,
            "pre_target": pre_target,
        }
        if pre_mental_cue:
            body["pre_mental_cue"] = pre_mental_cue
        if pre_focus_tag and pre_focus_tag in ("strength", "speed", "technique", "tactical", "fitness"):
            body["pre_focus_tag"] = pre_focus_tag

        return await bridge_post(
            "/api/v1/journal/pre-session",
            body,
            user_id=user_id,
        )

    @tool
    async def save_journal_post(
        journal_id: str,
        post_outcome: str = "hit_it",
        post_reflection: str = "",
        post_next_focus: str = "",
        post_body_feel: int = 0,
    ) -> dict:
        """Save a post-training journal entry. journal_id: UUID from the pre-session journal. post_outcome: fell_short/hit_it/exceeded. post_reflection: reflection on the session (required). post_next_focus: what to work on next (optional). post_body_feel: 1-10 body feel (optional). This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        if post_outcome not in ("fell_short", "hit_it", "exceeded"):
            post_outcome = "hit_it"

        body: dict = {
            "journal_id": journal_id,
            "post_outcome": post_outcome,
            "post_reflection": post_reflection,
        }
        if post_next_focus:
            body["post_next_focus"] = post_next_focus
        if post_body_feel and 1 <= post_body_feel <= 10:
            body["post_body_feel"] = post_body_feel

        return await bridge_post(
            "/api/v1/journal/post-session",
            body,
            user_id=user_id,
        )

    return [
        get_readiness_detail,
        get_vitals_trend,
        get_checkin_history,
        get_dual_load_score,
        log_check_in,
        get_training_session,
        get_drill_detail,
        get_training_program_recommendations,
        calculate_phv_stage,
        get_my_programs,
        get_program_by_name,
        get_program_drill_breakdown,
        get_program_by_id,
        rate_drill,
        get_today_training_for_journal,
        get_pending_post_journal,
        save_journal_pre,
        save_journal_post,
    ]
