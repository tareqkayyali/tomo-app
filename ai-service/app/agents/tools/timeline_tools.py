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


def make_timeline_tools(user_id: str, context: PlayerContext) -> list:
    """Create timeline agent tools bound to a specific user context."""

    @tool
    async def get_today_events() -> dict:
        """Get all events scheduled for today. Shows training, matches, study, exams, and personal events with times, types, and intensity."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type, start_at::text, end_at::text,
                          intensity, notes, sport
                   FROM calendar_events
                   WHERE user_id = %s AND start_at::date = %s::date
                   ORDER BY start_at""",
                (user_id, context.today_date),
            )
            rows = await result.fetchall()

        events = [
            {
                "id": row[0],
                "title": row[1],
                "event_type": row[2],
                "start_time": row[3],
                "end_time": row[4],
                "intensity": row[5],
                "notes": row[6],
                "sport": row[7],
            }
            for row in rows
        ]

        return {"date": context.today_date, "events": events, "total": len(events)}

    @tool
    async def get_week_schedule(start_date: str = "") -> dict:
        """Get the full week schedule starting from a date (defaults to today). Shows all 7 days with events, rest days, and load distribution."""
        from app.db.supabase import get_pool
        pool = get_pool()

        start = start_date or context.today_date
        end = (datetime.strptime(start, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type, start_at::date::text, start_at::text,
                          end_at::text, intensity, notes
                   FROM calendar_events
                   WHERE user_id = %s
                     AND start_at::date >= %s::date AND start_at::date <= %s::date
                   ORDER BY start_at""",
                (user_id, start, end),
            )
            rows = await result.fetchall()

        # Group by date
        days: dict[str, list] = {}
        for row in rows:
            d = row[3]
            if d not in days:
                days[d] = []
            days[d].append({
                "id": row[0],
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
    ) -> dict:
        """Create a new calendar event. event_type: training, match, gym, study, exam, rest, personal_dev, club_training, recovery. Date: YYYY-MM-DD. Times: HH:MM (24h). Intensity: LIGHT/MODERATE/HARD. This is a WRITE action requiring confirmation."""
        from app.agents.tools.bridge import bridge_post

        # Validate date is in the future
        try:
            event_date = datetime.strptime(date, "%Y-%m-%d").date()
            today = datetime.strptime(context.today_date, "%Y-%m-%d").date()
            if event_date < today:
                return {"error": "Cannot create events in the past"}
        except ValueError:
            return {"error": "Invalid date format. Use YYYY-MM-DD"}

        return await bridge_post(
            "/api/v1/events",
            {
                "title": title,
                "event_type": event_type,
                "date": date,
                "start_time": start_time,
                "end_time": end_time or "",
                "intensity": intensity,
                "notes": notes,
                "description": description,
            },
            user_id=user_id,
        )

    @tool
    async def update_event(
        event_id: str,
        title: str = "",
        start_time: str = "",
        end_time: str = "",
        intensity: str = "",
        notes: str = "",
        date: str = "",
    ) -> dict:
        """Update an existing calendar event. Only provide fields you want to change. This is a WRITE action requiring confirmation."""
        from app.agents.tools.bridge import bridge_put

        body: dict = {"event_id": event_id}
        if title:
            body["title"] = title
        if start_time:
            body["start_time"] = start_time
        if end_time:
            body["end_time"] = end_time
        if intensity:
            body["intensity"] = intensity
        if notes:
            body["notes"] = notes
        if date:
            body["date"] = date

        return await bridge_put(f"/api/v1/events/{event_id}", body, user_id=user_id)

    @tool
    async def delete_event(event_id: str) -> dict:
        """Delete a calendar event by ID. This is a WRITE action requiring confirmation."""
        from app.agents.tools.bridge import bridge_delete
        return await bridge_delete(f"/api/v1/events/{event_id}", user_id=user_id)

    @tool
    async def detect_load_collision(date: str = "") -> dict:
        """Detect scheduling conflicts and load collisions for a specific date or today. Checks for overlapping events, excessive load, and rule violations (e.g., HARD after HARD, training during school)."""
        from app.db.supabase import get_pool
        pool = get_pool()
        target_date = date or context.today_date

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type, start_at::text, end_at::text, intensity
                   FROM calendar_events
                   WHERE user_id = %s AND start_at::date = %s::date
                   ORDER BY start_at""",
                (user_id, target_date),
            )
            rows = await result.fetchall()

        events = [
            {
                "id": row[0], "title": row[1], "type": row[2],
                "start": row[3], "end": row[4], "intensity": row[5],
            }
            for row in rows
        ]

        clashes = []
        warnings = []

        # Check for time overlaps
        for i, a in enumerate(events):
            for b in events[i + 1:]:
                if a["end"] and b["start"] and a["end"] > b["start"]:
                    clashes.append({
                        "event_a": a["title"],
                        "event_b": b["title"],
                        "overlap": f"{a['end']} overlaps {b['start']}",
                    })

        # Check for load issues
        hard_count = sum(1 for e in events if e["intensity"] == "HARD")
        if hard_count >= 2:
            warnings.append("Two or more HARD sessions in one day — risk of overload")

        total_events = len(events)
        if total_events > 3:
            warnings.append(f"{total_events} events scheduled — consider reducing")

        # Check readiness constraint
        if context.readiness_score == "Red" and any(e["intensity"] == "HARD" for e in events):
            warnings.append("RED readiness with HARD session — should be LIGHT or REST only")

        # Check school hours (if schedule prefs available)
        prefs = context.schedule_preferences
        for e in events:
            if e["start"] and prefs.school_start <= e["start"] <= prefs.school_end:
                weekday = datetime.strptime(target_date, "%Y-%m-%d").isoweekday()
                if weekday in prefs.school_days:
                    warnings.append(f"'{e['title']}' scheduled during school hours ({prefs.school_start}-{prefs.school_end})")

        return {
            "date": target_date,
            "events": len(events),
            "clashes": clashes,
            "warnings": warnings,
            "has_issues": len(clashes) > 0 or len(warnings) > 0,
        }

    return [
        get_today_events,
        get_week_schedule,
        create_event,
        update_event,
        delete_event,
        detect_load_collision,
    ]
