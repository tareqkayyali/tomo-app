"""
Tomo AI Service — Timeline Agent Tools (6 tools)
Calendar CRUD, schedule viewing, load collision detection.

Factory function creates tools bound to a specific user_id + PlayerContext.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.timeline")


def _safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _extract_hhmm(timestamp_text: str | None) -> str | None:
    """Pull HH:MM (24h) out of a timestamp string like '2026-04-17 17:30:00'."""
    if not timestamp_text:
        return None
    import re as _re
    match = _re.search(r"(\d{2}):(\d{2})", timestamp_text)
    if not match:
        return None
    return f"{match.group(1)}:{match.group(2)}"


def _to_12h(timestamp_text: str | None) -> str:
    """Format a timestamp string's clock component as 12h (e.g., '5:30 PM'). Returns '' if unparseable."""
    hhmm = _extract_hhmm(timestamp_text)
    if not hhmm:
        return ""
    h, m = int(hhmm[:2]), int(hhmm[3:5])
    period = "PM" if h >= 12 else "AM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {period}"


def _shape_event(e: dict) -> dict:
    """Convert an internal event dict to the mobile capsule event shape."""
    shaped = {
        "id": e.get("id", ""),
        "title": e.get("title", "Untitled"),
        "eventType": e.get("event_type", "other"),
        "localStart": _to_12h(e.get("start")),
        "localEnd": _to_12h(e.get("end")),
    }
    intensity = e.get("intensity")
    if intensity:
        shaped["intensity"] = intensity
    return shaped


# TS backend Zod-validated event types
_VALID_EVENT_TYPES = {"training", "match", "recovery", "study_block", "study", "exam", "other"}

# Map LLM-generated event types to valid Zod enum values
_EVENT_TYPE_MAP = {
    "gym": "training",
    "gym_session": "training",
    "club_training": "training",
    "speed_training": "training",
    "speed_session": "training",
    "speed": "training",
    "strength": "training",
    "conditioning": "training",
    "practice": "training",
    "session": "training",
    "workout": "training",
    "rest": "recovery",
    "rest_day": "recovery",
    "personal_dev": "other",
    "personal": "other",
}


def _map_event_type(et: str) -> str:
    """Map AI agent event types to TS backend calendar event types.
    Falls back to 'training' for any unmapped type (safest default)."""
    mapped = _EVENT_TYPE_MAP.get(et, et)
    return mapped if mapped in _VALID_EVENT_TYPES else "training"


def make_timeline_tools(user_id: str, context: PlayerContext) -> list:
    """Create timeline agent tools bound to a specific user context."""

    @tool
    async def get_today_events(date: str = "") -> dict:
        """Get all events scheduled for a specific date. Defaults to today if no date provided. When the conversation is about tomorrow or another day, pass that date as YYYY-MM-DD. Shows training, matches, study, exams, and personal events with times, types, and intensity."""
        from app.db.supabase import get_pool
        pool = get_pool()
        tz = context.timezone or "UTC"
        target_date = date or context.today_date
        if tz == "UTC":
            # Loud warning so we catch the "every time is 3 AM" class of bugs
            # in Railway logs. An athlete's tz should never fall back to UTC
            # in production — the mobile client always sends Intl TZ.
            logger.warning(
                f"get_today_events: context.timezone is UTC -- "
                f"schedule card will render times in UTC, not local. "
                f"user_id={user_id[:8]}... date={target_date}"
            )
        logger.info(f"get_today_events: timezone={tz}, date={target_date}")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type,
                          (start_at AT TIME ZONE %s)::text,
                          (end_at AT TIME ZONE %s)::text,
                          intensity, notes, sport, session_plan
                   FROM calendar_events
                   WHERE user_id = %s
                     AND (start_at AT TIME ZONE %s)::date = %s::date
                   ORDER BY calendar_events.start_at""",
                (tz, tz, user_id, tz, target_date),
            )
            rows = await result.fetchall()

        events = [
            {
                "id": str(row[0]),  # str() -- psycopg3 returns uuid.UUID, not JSON serializable
                "title": row[1],
                "event_type": row[2],
                "start_time": row[3],
                "end_time": row[4],
                "intensity": row[5],
                "notes": row[6],
                "sport": row[7],
                # session_plan JSONB -- structured drill list for Tomo-built
                # sessions. Multi-step flow reads this when attaching new
                # drills to an existing event so it can merge rather than
                # overwrite. None for events that were never AI-built.
                "session_plan": row[8],
            }
            for row in rows
        ]

        return {"date": target_date, "events": events, "total": len(events)}

    @tool
    async def get_week_schedule(start_date: str = "") -> dict:
        """Get the full week schedule starting from a date (defaults to today). Shows all 7 days with events, rest days, and load distribution."""
        from app.db.supabase import get_pool
        pool = get_pool()
        tz = context.timezone or "UTC"

        start = start_date or context.today_date
        end = (datetime.strptime(start, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type,
                          (start_at AT TIME ZONE %s)::date::text,
                          (start_at AT TIME ZONE %s)::text,
                          (end_at AT TIME ZONE %s)::text,
                          intensity, notes
                   FROM calendar_events
                   WHERE user_id = %s
                     AND (start_at AT TIME ZONE %s)::date >= %s::date
                     AND (start_at AT TIME ZONE %s)::date <= %s::date
                   ORDER BY calendar_events.start_at""",
                (tz, tz, tz, user_id, tz, start, tz, end),
            )
            rows = await result.fetchall()

        # Group by date
        days: dict[str, list] = {}
        for row in rows:
            d = row[3]
            if d not in days:
                days[d] = []
            days[d].append({
                "id": str(row[0]),
                "title": row[1],
                "event_type": row[2],
                "start_time": row[4],
                "end_time": row[5],
                "intensity": row[6],
                "notes": row[7],
            })

        # Fill in empty days
        schedule = []
        current = datetime.strptime(start, "%Y-%m-%d")
        for i in range(7):
            d = current.strftime("%Y-%m-%d")
            day_name = current.strftime("%A")
            schedule.append({
                "date": d,
                "day": day_name,
                "events": days.get(d, []),
                "event_count": len(days.get(d, [])),
                "is_rest_day": len(days.get(d, [])) == 0,
            })
            current += timedelta(days=1)

        return {
            "start_date": start,
            "end_date": end,
            "schedule": schedule,
            "total_events": len(rows),
        }

    @tool
    async def create_event(
        title: str,
        event_type: str,
        date: str,
        start_time: str,
        end_time: str = "",
        intensity: str = "MODERATE",
        notes: str = "",
        description: str = "",
        session_plan: dict | None = None,
        linked_program_slugs: list[str] | None = None,
    ) -> dict:
        """Create a new calendar event. event_type: training, match, gym, study, exam, rest, personal_dev, club_training, recovery. Date: YYYY-MM-DD. Times: HH:MM (24h). Intensity: LIGHT/MODERATE/HARD. Optional session_plan: structured drill list (see session_plan schema in migration 046). Optional linked_program_slugs: program slugs (e.g. POSITION_MATRIX entries) to auto-link on the new event at write time. Backend resolves slug -> training_programs.id and inserts event_linked_programs rows with linked_by='tomo'. This is a WRITE action requiring confirmation."""
        from app.agents.tools.bridge import bridge_post

        # Validate date is in the future
        try:
            event_date = datetime.strptime(date, "%Y-%m-%d").date()
            today = datetime.strptime(context.today_date, "%Y-%m-%d").date()
            if event_date < today:
                return {"error": "Cannot create events in the past"}
        except ValueError:
            return {"error": "Invalid date format. Use YYYY-MM-DD"}

        tz = context.timezone or "UTC"
        body: dict = {
            "name": title,
            "type": _map_event_type(event_type),
            "date": date,
            "startTime": start_time,
            "endTime": end_time or None,
            "intensity": intensity,
            "notes": notes or None,
            "timezone": tz,
        }
        if session_plan:
            body["sessionPlan"] = session_plan
        # Phase 5: auto-link prescribed programs at write time. Cap
        # defensively; backend Zod schema also enforces .max(10).
        if linked_program_slugs:
            cleaned = [s for s in linked_program_slugs if isinstance(s, str) and s][:10]
            if cleaned:
                body["linkedProgramSlugs"] = cleaned
        return await bridge_post("/api/v1/calendar/events", body, user_id=user_id)

    @tool
    async def update_event(
        event_id: str,
        title: str = "",
        start_time: str = "",
        end_time: str = "",
        intensity: str = "",
        notes: str = "",
        date: str = "",
        session_plan: dict | None = None,
    ) -> dict:
        """Update an existing calendar event. Only provide fields you want to change. event_id MUST be a valid UUID from get_today_events results (the [event_id=...] field). Optional session_plan: structured drill list (see session_plan schema in migration 046). This is a WRITE action requiring confirmation."""
        from app.agents.tools.bridge import bridge_patch

        # Validate event_id looks like a UUID (not an event title)
        if event_id and len(event_id) < 20:
            return {"error": f"Invalid event_id '{event_id}'. Use the UUID from get_today_events [event_id=...] field, not the event title."}

        body: dict = {}
        if title:
            body["name"] = title
        if start_time:
            body["startTime"] = start_time
        if end_time:
            body["endTime"] = end_time
        if intensity:
            # DB CHECK constraint requires uppercase: REST, LIGHT, MODERATE, HARD
            body["intensity"] = intensity.upper()
        if notes:
            body["notes"] = notes
        if date:
            body["date"] = date
        if session_plan is not None:
            body["sessionPlan"] = session_plan

        # Always pass timezone for proper time conversion
        tz = context.timezone or "UTC"
        body["timezone"] = tz

        return await bridge_patch(f"/api/v1/calendar/events/{event_id}", body, user_id=user_id)

    @tool
    async def delete_event(event_id: str) -> dict:
        """Delete a calendar event by ID. This is a WRITE action requiring confirmation."""
        from app.agents.tools.bridge import bridge_delete
        return await bridge_delete(f"/api/v1/calendar/events/{event_id}", user_id=user_id)

    @tool
    async def detect_load_collision(date: str = "", days: int = 1) -> dict:
        """Detect scheduling conflicts and load collisions. By default checks a single day (today unless `date` is given). Pass `days>1` to scan a contiguous range starting from that date. Flags overlapping events, excessive load (2+ HARD in one day, >3 events), RED readiness + HARD clash, and training scheduled inside school hours."""
        from app.db.supabase import get_pool

        pool = get_pool()
        tz = context.timezone or "UTC"
        start_date = date or context.today_date
        days = max(1, min(int(days or 1), 14))

        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            return {
                "date": start_date,
                "days_checked": days,
                "total_events": 0,
                "conflicts": [],
                "events": 0,
                "clashes": [],
                "warnings": [],
                "has_issues": False,
            }

        date_list = [(start_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]
        end_date = date_list[-1]

        # Pull all events in range in one query
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type,
                          (start_at AT TIME ZONE %s)::text,
                          (end_at AT TIME ZONE %s)::text,
                          intensity,
                          (start_at AT TIME ZONE %s)::date::text
                   FROM calendar_events
                   WHERE user_id = %s
                     AND (start_at AT TIME ZONE %s)::date >= %s::date
                     AND (start_at AT TIME ZONE %s)::date <= %s::date
                   ORDER BY calendar_events.start_at""",
                (tz, tz, tz, user_id, tz, start_date, tz, end_date),
            )
            rows = await result.fetchall()

        # Group events by date
        events_by_date: dict[str, list[dict]] = {d: [] for d in date_list}
        for row in rows:
            ev = {
                "id": str(row[0]),
                "title": row[1] or "Untitled",
                "event_type": row[2] or "other",
                "start": row[3],
                "end": row[4],
                "intensity": row[5],
            }
            day_key = row[6]
            if day_key in events_by_date:
                events_by_date[day_key].append(ev)

        prefs = context.schedule_preferences
        readiness_red = getattr(context, "readiness_score", None) == "Red"
        total_events = sum(len(v) for v in events_by_date.values())

        conflicts: list[dict] = []
        legacy_clashes: list[dict] = []
        legacy_warnings: list[str] = []

        for day in date_list:
            day_events = events_by_date.get(day, [])
            if not day_events:
                continue

            # Same-day overlaps
            for i, a in enumerate(day_events):
                for b in day_events[i + 1:]:
                    if a.get("end") and b.get("start") and a["end"] > b["start"]:
                        clash_events = [_shape_event(a), _shape_event(b)]
                        conflicts.append({
                            "date": day,
                            "issue": f"'{a['title']}' overlaps '{b['title']}'",
                            "severity": "danger",
                            "events": clash_events,
                            "suggestions": [
                                {"label": "Reschedule later", "action": f"Move '{b['title']}' on {day} to a clean slot"},
                                {"label": "Drop one", "action": f"Remove '{b['title']}' on {day}"},
                            ],
                        })
                        legacy_clashes.append({
                            "event_a": a["title"],
                            "event_b": b["title"],
                            "overlap": f"{a['end']} overlaps {b['start']}",
                        })

            # HARD stacking
            hard_events = [e for e in day_events if e.get("intensity") == "HARD"]
            if len(hard_events) >= 2:
                conflicts.append({
                    "date": day,
                    "issue": f"{len(hard_events)} HARD sessions in one day — overload risk",
                    "severity": "warning",
                    "events": [_shape_event(e) for e in hard_events],
                    "suggestions": [
                        {"label": "Swap one to LIGHT", "action": f"Lower one HARD session on {day} to LIGHT"},
                        {"label": "Move to rest day", "action": f"Move one HARD session from {day} to a rest day"},
                    ],
                })
                legacy_warnings.append(f"{day}: two or more HARD sessions — risk of overload")

            # RED + HARD
            if readiness_red and hard_events:
                conflicts.append({
                    "date": day,
                    "issue": "RED readiness with HARD session — should be LIGHT or REST only",
                    "severity": "danger",
                    "events": [_shape_event(e) for e in hard_events],
                    "suggestions": [
                        {"label": "Downgrade to LIGHT", "action": f"Change HARD session on {day} to LIGHT"},
                        {"label": "Take a rest day", "action": f"Turn {day} into a rest day"},
                    ],
                })
                legacy_warnings.append(f"{day}: RED readiness with HARD session — downgrade or rest")

            # Too many events
            if len(day_events) > 3:
                conflicts.append({
                    "date": day,
                    "issue": f"{len(day_events)} events scheduled — consider reducing",
                    "severity": "warning",
                    "events": [_shape_event(e) for e in day_events],
                    "suggestions": [
                        {"label": "Trim schedule", "action": f"Help me reduce load on {day}"},
                    ],
                })
                legacy_warnings.append(f"{day}: {len(day_events)} events scheduled — consider reducing")

            # School-hour encroachment (only on school days)
            try:
                weekday = datetime.strptime(day, "%Y-%m-%d").isoweekday()
            except ValueError:
                weekday = None
            school_days = getattr(prefs, "school_days", None) if prefs else None
            school_start = getattr(prefs, "school_start", None) if prefs else None
            school_end = getattr(prefs, "school_end", None) if prefs else None
            if school_days and school_start and school_end and weekday in school_days:
                for e in day_events:
                    start_time = _extract_hhmm(e.get("start"))
                    if start_time and school_start <= start_time <= school_end:
                        conflicts.append({
                            "date": day,
                            "issue": f"'{e['title']}' during school hours ({school_start}-{school_end})",
                            "severity": "warning",
                            "events": [_shape_event(e)],
                            "suggestions": [
                                {"label": "Move after school", "action": f"Reschedule '{e['title']}' on {day} to after school"},
                            ],
                        })
                        legacy_warnings.append(f"{day}: '{e['title']}' scheduled during school hours")

        return {
            "date": start_date,
            "days_checked": days,
            "total_events": total_events,
            "conflicts": conflicts,
            "events": len(events_by_date.get(start_date, [])),
            "clashes": legacy_clashes,
            "warnings": legacy_warnings,
            "has_issues": len(conflicts) > 0,
        }

    @tool
    async def suggest_time_slots(date: str, event_type: str = "training", duration_minutes: int = 60) -> dict:
        """Suggest 2-3 best available time slots for a given date and event type. Uses the schedule engine to respect school hours, buffers, and preferences. Returns scored suggestions with 12h times. Call this BEFORE creating events to offer the athlete time choices."""
        from app.agents.tools.bridge import bridge_get
        tz = context.timezone or "UTC"

        result = await bridge_get(
            "/api/v1/calendar/suggest-slots",
            params={
                "date": date,
                "eventType": event_type,
                "durationMin": str(duration_minutes),
                "timezone": tz,
            },
            user_id=user_id,
        )

        if "error" in result:
            return {"error": result["error"], "date": date}

        return result

    return [
        get_today_events,
        get_week_schedule,
        create_event,
        update_event,
        delete_event,
        detect_load_collision,
        suggest_time_slots,
    ]
