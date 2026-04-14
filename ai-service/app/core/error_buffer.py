"""
Tomo AI Service -- In-Memory Error Buffer

Ring buffer that captures the last N errors from any part of the system.
Accessible via /health/errors for production debugging without Railway log access.

Thread-safe: uses asyncio.Lock for concurrent request safety.
Not persisted: resets on restart (that's fine -- we need recent errors, not historical).
"""

from __future__ import annotations

import asyncio
import traceback as _tb
from collections import deque
from datetime import datetime, timezone
from typing import Optional

# Max errors to retain in memory (oldest are dropped when full)
_MAX_ERRORS = 100
_MAX_REQUESTS = 200

_errors: deque = deque(maxlen=_MAX_ERRORS)
_requests: deque = deque(maxlen=_MAX_REQUESTS)
_lock = asyncio.Lock()


async def capture_error(
    *,
    error: str,
    traceback: str,
    request_id: str = "-",
    user_id: str = "-",
    session_id: str = "-",
    node: str = "-",
    message: str = "-",
    intent_id: str = "-",
) -> None:
    """Capture an error into the ring buffer. Call from except blocks."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "request_id": request_id,
        "user_id": _truncate(user_id),
        "session_id": _truncate(session_id),
        "node": node,
        "message": message[:120] if message else "-",
        "intent_id": intent_id,
        "error": error[:500] if error else "-",
        "traceback": traceback,
    }
    async with _lock:
        _errors.appendleft(entry)


async def capture_request(
    *,
    request_id: str,
    user_id: str,
    session_id: str,
    message: str,
    intent_id: str = "-",
    agent: str = "-",
    pattern: str = "-",
    status: str,
    cost_usd: float = 0.0,
    latency_ms: float = 0.0,
) -> None:
    """Capture a completed request into the ring buffer."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "request_id": request_id,
        "user_id": _truncate(user_id),
        "session_id": _truncate(session_id),
        "message": message[:80] if message else "-",
        "intent_id": intent_id,
        "agent": agent,
        "pattern": pattern,
        "status": status,
        "cost_usd": round(cost_usd, 6),
        "latency_ms": round(latency_ms, 1),
    }
    async with _lock:
        _requests.appendleft(entry)


def get_errors(limit: int = 20) -> list:
    """Return the most recent errors (newest first)."""
    return list(_errors)[:limit]


def get_requests(limit: int = 50) -> list:
    """Return the most recent requests (newest first)."""
    return list(_requests)[:limit]


def _truncate(s: str) -> str:
    """Truncate an ID to first 8 chars for readability."""
    if not s or s == "-":
        return "-"
    return s[:8] + "..."
