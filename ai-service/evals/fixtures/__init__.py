"""
Eval fixture pool.

Exports `EVAL_ATHLETES` — a declarative list of 20 synthetic athlete contexts
used by safety_live / behavior_live eval suites (Phase 2+). Stable UUIDs so
scenarios can reference fixtures by slug.

NOT PRODUCTION DATA. All fixtures carry is_eval_fixture=TRUE and are excluded
from anon/authenticated reads by the RESTRICTIVE RLS policy on public.users
(migration 00000000000092).
"""

from .pool import EVAL_ATHLETES, get_by_slug, FIXTURE_PREFIX

__all__ = ["EVAL_ATHLETES", "get_by_slug", "FIXTURE_PREFIX"]
