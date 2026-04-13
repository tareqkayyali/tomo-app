"""
Tomo AI Service — Per-User Cost Tracker

Tracks API costs per user with daily and monthly caps.
Prevents a single user or buggy session from burning through budget.

Costs are tracked in a `user_cost_ledger` table with rolling windows.
The tracker is checked at the start of each chat request — if the user
is over their daily or monthly cap, the request is rejected with a
friendly message instead of an API call.

Thresholds:
  - Daily cap: $1.00/user (adjustable via env)
  - Monthly cap: $15.00/user (adjustable via env)
  - Alert threshold: 80% of cap → log warning

This is a pure function module — I/O is at the boundaries only.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

logger = logging.getLogger("tomo-ai.cost_tracker")

# Configurable caps via environment
DAILY_CAP_USD = float(os.environ.get("USER_DAILY_COST_CAP_USD", "1.00"))
MONTHLY_CAP_USD = float(os.environ.get("USER_MONTHLY_COST_CAP_USD", "15.00"))
ALERT_THRESHOLD_PCT = 0.80  # Alert at 80% of cap


@dataclass
class CostCheckResult:
    """Result of a cost limit check."""
    allowed: bool
    daily_spent_usd: float
    monthly_spent_usd: float
    daily_remaining_usd: float
    monthly_remaining_usd: float
    reason: Optional[str] = None  # Reason for denial


def check_cost_limit(
    daily_spent: float,
    monthly_spent: float,
    estimated_cost: float = 0.01,
) -> CostCheckResult:
    """
    Check if a user is within their cost limits.

    Pure function — no I/O. Call with current spend from DB.

    Args:
        daily_spent: Total spent today (USD)
        monthly_spent: Total spent this month (USD)
        estimated_cost: Estimated cost of the next request (USD)

    Returns:
        CostCheckResult with allowed flag and remaining budgets
    """
    daily_remaining = max(0, DAILY_CAP_USD - daily_spent)
    monthly_remaining = max(0, MONTHLY_CAP_USD - monthly_spent)

    # Check daily cap
    if daily_spent + estimated_cost > DAILY_CAP_USD:
        logger.warning(
            f"Daily cost cap hit: spent=${daily_spent:.4f}, "
            f"cap=${DAILY_CAP_USD:.2f}, estimated=${estimated_cost:.4f}"
        )
        return CostCheckResult(
            allowed=False,
            daily_spent_usd=daily_spent,
            monthly_spent_usd=monthly_spent,
            daily_remaining_usd=0,
            monthly_remaining_usd=monthly_remaining,
            reason="daily_cap_exceeded",
        )

    # Check monthly cap
    if monthly_spent + estimated_cost > MONTHLY_CAP_USD:
        logger.warning(
            f"Monthly cost cap hit: spent=${monthly_spent:.4f}, "
            f"cap=${MONTHLY_CAP_USD:.2f}"
        )
        return CostCheckResult(
            allowed=False,
            daily_spent_usd=daily_spent,
            monthly_spent_usd=monthly_spent,
            daily_remaining_usd=daily_remaining,
            monthly_remaining_usd=0,
            reason="monthly_cap_exceeded",
        )

    # Alert at 80% threshold
    if daily_spent / DAILY_CAP_USD >= ALERT_THRESHOLD_PCT:
        logger.info(
            f"Cost alert: daily spend at {daily_spent / DAILY_CAP_USD:.0%} "
            f"(${daily_spent:.4f} / ${DAILY_CAP_USD:.2f})"
        )

    return CostCheckResult(
        allowed=True,
        daily_spent_usd=daily_spent,
        monthly_spent_usd=monthly_spent,
        daily_remaining_usd=daily_remaining,
        monthly_remaining_usd=monthly_remaining,
    )


async def get_user_spend(user_id: str) -> tuple[float, float]:
    """
    Fetch current daily and monthly spend for a user from ai_trace_log.

    Returns: (daily_spent_usd, monthly_spent_usd)
    """
    from app.db.supabase import get_pool
    pool = get_pool()
    if not pool:
        return 0.0, 0.0

    today = date.today().isoformat()
    month_start = date.today().replace(day=1).isoformat()

    try:
        async with pool.connection() as conn:
            # Daily spend
            result = await conn.execute(
                "SELECT COALESCE(SUM(total_cost_usd), 0) FROM ai_trace_log "
                "WHERE user_id = %s AND created_at::date = %s::date",
                (user_id, today),
            )
            row = await result.fetchone()
            daily = float(row[0]) if row else 0.0

            # Monthly spend
            result = await conn.execute(
                "SELECT COALESCE(SUM(total_cost_usd), 0) FROM ai_trace_log "
                "WHERE user_id = %s AND created_at::date >= %s::date",
                (user_id, month_start),
            )
            row = await result.fetchone()
            monthly = float(row[0]) if row else 0.0

            return daily, monthly

    except Exception as e:
        logger.error(f"Cost lookup failed for {user_id}: {e}")
        return 0.0, 0.0  # Fail open — don't block on DB errors


def build_cost_limit_response() -> str:
    """Build a friendly response for when cost limit is hit."""
    return (
        "You've been chatting a lot today and I want to make sure I stay sharp for you. "
        "Let's pick this back up in a bit — your data and schedule are all saved."
    )
