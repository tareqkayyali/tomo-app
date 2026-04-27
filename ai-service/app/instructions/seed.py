"""
Seed Snapshot — Phase 3 bootstrap.

When the resolver starts and finds no live snapshot in
methodology_publish_snapshots, it falls back to this in-memory seed.
Every directive here is a verbatim translation of a value that was
previously hardcoded in app/agents/prompt_builder.py or
app/graph/nodes/validate.py — so flipping to resolver-backed reads
produces zero behaviour change.

Once the PD publishes their first real snapshot via the CMS, this seed
is no longer consulted. Operators can also write the seed to the DB
explicitly via scripts/bootstrap_methodology_seed.py.

Verbatim text constants live in `_seed_text.py` so this module stays
focused on directive structure.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.instructions._seed_text import (
    COACHING_IDENTITY_TEXT,
    MEMORY_EXTRACTION_PROMPT_TEMPLATE,
    PHV_SAFETY_WARNING_TEXT,
)
from app.instructions.types import (
    Directive,
    DirectiveSnapshot,
    DirectiveType,
)


# ── Identity ─────────────────────────────────────────────────────────────

SEED_IDENTITY_PAYLOAD = {
    "persona_name": "Tomo",
    "persona_description": COACHING_IDENTITY_TEXT,
    "voice_attributes": ["honest", "warm", "real", "direct", "evidence-based"],
    "emoji_policy": "none",
    "cultural_register": "elder-sibling, sport-literate, no-agenda",
}


# ── Tone ─────────────────────────────────────────────────────────────────

# Verbatim from validate.py BANNED_PHRASES
SEED_BANNED_PHRASES = [
    "great effort",
    "fantastic work",
    "amazing job",
    "keep it up",
    "you've got this",
    "believe in yourself",
    "stay focused",
    "crushing it",
    "optimal performance",
    "according to your data",
    "your metrics indicate",
    "it is recommended",
    "you should consider",
    "thank you for your input",
    "session has been generated",
    "based on your performance",
    "incredible work",
    "amazing progress",
    "keep pushing",
    "stay motivated",
    "excellent work",
]

# Verbatim regex source strings from validate.py BANNED_PATTERNS
SEED_BANNED_PATTERNS = [
    r"today'?s session (will|focuses|is designed)",
    r"the programme (requires|states|indicates)",
    r"research shows that",
    r"it is important to (note|understand|remember)",
    r"according to (your|the) data",
    r"your (ACWR|HRV|readiness score) (is|indicates|shows)",
    r"based on (your|the) (data|metrics|performance)",
    r"I recommend that you",
    r"studies (show|suggest|indicate)",
    r"\bacute[\s:/\\-]+chronic(?:\s+workload)?\b",
    r"\bacute[\s:/\\-]+chronic\s+ratio\b",
]

SEED_TONE_PAYLOAD = {
    "banned_phrases": SEED_BANNED_PHRASES,
    "banned_patterns": SEED_BANNED_PATTERNS,
    "required_companion_clauses": {},
    "clinical_language_rules": [],
    "acronym_scaffolding_rules": ["ACWR", "PHV", "acute:chronic", "acute/chronic"],
}


# ── Guardrail PHV ────────────────────────────────────────────────────────

# Verbatim regex source strings from validate.py PHV_BLOCKED_PATTERNS
SEED_PHV_BLOCKED_PATTERNS = [
    r"\bbarbell\s+(?:back\s+)?squat",
    r"\bdepth\s+jump",
    r"\bdrop\s+jump",
    r"\bolympic\s+lift",
    r"\bclean\s+and\s+jerk",
    r"\bsnatch\b",
    r"\bmax(?:imal)?\s+sprint",
    r"\bheavy\s+deadlift",
    r"\bmax\s+(?:effort\s+)?(?:squat|deadlift|bench)",
    r"\b1\s*rm\b",
    r"\bplyometric.*max",
]

SEED_GUARDRAIL_PHV_PAYLOAD = {
    "blocked_exercises": [],
    "blocked_patterns": SEED_PHV_BLOCKED_PATTERNS,
    "phv_stage_rules": {},
    "advisory_or_blocking": "advisory",
    "safe_alternatives": {},
    "safety_warning_template": PHV_SAFETY_WARNING_TEXT,
    "unknown_age_default": "conservative",
}


# ── Memory policy ────────────────────────────────────────────────────────

SEED_MEMORY_POLICY_PAYLOAD = {
    "extraction_prompt_template": MEMORY_EXTRACTION_PROMPT_TEMPLATE,
    "atom_types": [
        "current_goals",
        "unresolved_concerns",
        "injury_history",
        "behavioral_patterns",
        "coaching_preferences",
        "last_topics",
        "key_milestones",
    ],
    "truncation_tokens": 500,
    "dedup_strategy": "embedding",
    "retention_days": 365,
    "sport_aware_rules": {},
    "extraction_trigger": {"on_signal": []},
}


# ── Build the snapshot ──────────────────────────────────────────────────

def _make_directive(
    directive_type: DirectiveType,
    payload: dict,
    audience: str = "all",
    priority: int = 100,
    source_excerpt: str | None = None,
) -> Directive:
    return Directive(
        id=str(uuid4()),
        document_id=None,
        directive_type=directive_type,
        audience=audience,  # type: ignore[arg-type]
        sport_scope=[],
        age_scope=[],
        phv_scope=[],
        position_scope=[],
        mode_scope=[],
        priority=priority,
        payload=payload,
        source_excerpt=source_excerpt,
        confidence=None,
        status="published",
        schema_version=1,
        updated_at=datetime.now(timezone.utc),
    )


def build_seed_snapshot() -> DirectiveSnapshot:
    """Produce the in-memory seed snapshot. Idempotent — fresh ids each call.

    The resolver caches its loaded snapshot, so this is invoked at most once
    per resolver lifetime in practice.
    """
    directives = [
        _make_directive(
            DirectiveType.IDENTITY,
            SEED_IDENTITY_PAYLOAD,
            audience="all",
            priority=10,  # foundational
            source_excerpt="Bootstrap identity from prompt_builder.COACHING_IDENTITY",
        ),
        _make_directive(
            DirectiveType.TONE,
            SEED_TONE_PAYLOAD,
            audience="athlete",
            priority=20,
            source_excerpt="Bootstrap tone rules from validate.BANNED_PHRASES + BANNED_PATTERNS",
        ),
        _make_directive(
            DirectiveType.GUARDRAIL_PHV,
            SEED_GUARDRAIL_PHV_PAYLOAD,
            audience="athlete",
            priority=10,  # safety always wins
            source_excerpt="Bootstrap PHV gate from validate.PHV_BLOCKED_PATTERNS + PHV_SAFETY_WARNING",
        ),
        _make_directive(
            DirectiveType.MEMORY_POLICY,
            SEED_MEMORY_POLICY_PAYLOAD,
            audience="athlete",
            priority=50,
            source_excerpt="Bootstrap memory extraction from memory_service.update_longitudinal_memory",
        ),
    ]

    return DirectiveSnapshot(
        id="00000000-0000-0000-0000-00000000aaaa",
        label="seed (bootstrap)",
        directives=directives,
        directive_count=len(directives),
        schema_version=1,
        is_live=True,
        published_at=datetime.now(timezone.utc),
    )
