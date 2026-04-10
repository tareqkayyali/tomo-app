"""
Backfill Script — Migrate athlete_longitudinal_memory → Zep CE
Reads existing memory from Supabase, creates Zep users + sessions,
and seeds Zep with synthesized conversation messages from memory.

Usage:
  cd ai-service
  python -m scripts.backfill_zep_memory --dry-run
  python -m scripts.backfill_zep_memory
  python -m scripts.backfill_zep_memory --limit 10
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from uuid import uuid4

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("backfill-zep")


async def main(dry_run: bool = False, limit: int = 0) -> None:
    """Run the backfill."""
    import psycopg
    from app.services.zep_client import ZepClient, ZepMessage

    # Connect to Supabase
    db_url = os.environ.get("SUPABASE_DB_URL", "")
    if not db_url:
        logger.error("SUPABASE_DB_URL not set")
        return

    zep = ZepClient()

    # Check Zep health
    if not dry_run:
        healthy = await zep.health_check()
        if not healthy:
            logger.error("Zep CE is not reachable — is the service running?")
            return
        logger.info("Zep CE health check: OK")

    # Fetch all athletes with longitudinal memory
    query = "SELECT athlete_id, memory_json, session_count, last_session_summary FROM athlete_longitudinal_memory"
    if limit > 0:
        query += f" LIMIT {limit}"

    async with await psycopg.AsyncConnection.connect(db_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query)
            rows = await cur.fetchall()

    logger.info(f"Found {len(rows)} athletes with longitudinal memory")

    success = 0
    errors = 0

    for row in rows:
        athlete_id = str(row[0])
        memory_json = row[1] if isinstance(row[1], dict) else json.loads(row[1] or "{}")
        session_count = row[2] or 0
        last_summary = row[3] or ""

        if dry_run:
            logger.info(f"[DRY RUN] Would backfill: {athlete_id} ({session_count} sessions)")
            logger.info(f"  Memory keys: {list(memory_json.keys())}")
            success += 1
            continue

        try:
            # Create Zep user
            await zep.ensure_user(
                athlete_id,
                metadata={"source": "backfill", "session_count": session_count},
            )

            # Create a seed session with synthesized messages from memory
            seed_session_id = f"backfill-{athlete_id[:8]}-{uuid4().hex[:8]}"
            await zep.create_session(
                session_id=seed_session_id,
                user_id=athlete_id,
                metadata={"source": "backfill", "original_session_count": session_count},
            )

            # Synthesize messages from memory fields to seed Zep's entity extraction
            messages: list[ZepMessage] = []

            goals = memory_json.get("currentGoals", [])
            if goals:
                messages.append(ZepMessage(
                    role="human", role_type="user",
                    content=f"My current training goals are: {', '.join(goals)}"
                ))
                messages.append(ZepMessage(
                    role="ai", role_type="assistant",
                    content=f"I've noted your goals: {', '.join(goals)}. I'll keep these in mind for your coaching."
                ))

            concerns = memory_json.get("unresolvedConcerns", [])
            if concerns:
                messages.append(ZepMessage(
                    role="human", role_type="user",
                    content=f"I'm concerned about: {', '.join(concerns)}"
                ))
                messages.append(ZepMessage(
                    role="ai", role_type="assistant",
                    content=f"I understand your concerns. Let's address these in your training plan."
                ))

            injuries = memory_json.get("injuryHistory", [])
            if injuries:
                messages.append(ZepMessage(
                    role="human", role_type="user",
                    content=f"My injury history includes: {', '.join(injuries)}"
                ))
                messages.append(ZepMessage(
                    role="ai", role_type="assistant",
                    content=f"I'll factor your injury history into exercise recommendations and load management."
                ))

            milestones = memory_json.get("keyMilestones", [])
            if milestones:
                messages.append(ZepMessage(
                    role="human", role_type="user",
                    content=f"My recent achievements: {', '.join(milestones)}"
                ))
                messages.append(ZepMessage(
                    role="ai", role_type="assistant",
                    content="Great progress! These milestones show your development trajectory."
                ))

            prefs = memory_json.get("coachingPreferences", [])
            if prefs:
                messages.append(ZepMessage(
                    role="human", role_type="user",
                    content=f"I prefer: {', '.join(prefs)}"
                ))
                messages.append(ZepMessage(
                    role="ai", role_type="assistant",
                    content=f"I'll adjust my coaching style to match your preferences."
                ))

            if messages:
                await zep.add_memory(seed_session_id, messages)
                logger.info(
                    f"Backfilled {athlete_id[:8]}...: "
                    f"{len(messages)} messages, {session_count} original sessions"
                )
            else:
                logger.info(f"Skipped {athlete_id[:8]}...: empty memory")

            success += 1

        except Exception as e:
            logger.error(f"Failed {athlete_id[:8]}...: {e}")
            errors += 1

    await zep.close()

    logger.info(f"\nBackfill complete: {success} success, {errors} errors, {len(rows)} total")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill Zep memory from athlete_longitudinal_memory")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to Zep")
    parser.add_argument("--limit", type=int, default=0, help="Max athletes to process (0 = all)")
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, limit=args.limit))
