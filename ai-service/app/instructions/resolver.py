"""
Methodology Resolver — Phase 3.

The thin runtime layer between the AI service and the PD's published
directives. Every injection site (prompt_builder identity, validate
PHV gate, validate tone rules, performance_layers thresholds, …) reads
from this module rather than holding its own hardcoded constants.

Usage:

    from app.instructions.resolver import resolve

    rules = await resolve(
        audience="athlete",
        sport=context.sport,
        age_band=context.age_band,
        phv_stage=context.phv_stage,
    )

    identity_text = rules.identity_block()
    phv = rules.guardrail_phv()
    if phv:
        for pattern in phv.compiled_blocked_patterns:
            …

Hard-cutover semantic (per Phase 0/2 plan): if a callsite expects a
specific directive type but the snapshot has none, the accessor
returns None and the callsite must handle absence explicitly. The seed
snapshot guarantees identity / tone / guardrail_phv coverage, so on a
cold install all foundational hooks have something to read.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Pattern, Sequence

from app.instructions.loader import load_live_snapshot
from app.instructions.types import (
    CoachDashboardPolicyPayload,
    Directive,
    DirectiveSnapshot,
    DirectiveType,
    EscalationPayload,
    GuardrailPhvPayload,
    IdentityPayload,
    MemoryPolicyPayload,
    ParentReportPolicyPayload,
    RagPolicyPayload,
    RecommendationPolicyPayload,
    ResponseShapePayload,
    RoutingClassifierPayload,
    RoutingIntentPayload,
    SurfacePolicyPayload,
    TonePayload,
)

logger = logging.getLogger("tomo-ai.instructions.resolver")


# ── Compiled-pattern wrappers ───────────────────────────────────────────


@dataclass(frozen=True)
class _GuardrailPhv:
    """Resolved PHV guardrail with patterns compiled once for fast matching."""

    payload: GuardrailPhvPayload
    compiled_blocked_patterns: Sequence[Pattern[str]]

    @property
    def blocked_exercises(self) -> Sequence[str]:
        return self.payload.blocked_exercises

    @property
    def safety_warning(self) -> str:
        return self.payload.safety_warning_template

    @property
    def advisory_or_blocking(self) -> str:
        return self.payload.advisory_or_blocking

    @property
    def unknown_age_default(self) -> str:
        return self.payload.unknown_age_default


@dataclass(frozen=True)
class _ToneRules:
    payload: TonePayload
    compiled_banned_patterns: Sequence[Pattern[str]]

    @property
    def banned_phrases(self) -> Sequence[str]:
        return self.payload.banned_phrases

    @property
    def youth_jargon_terms(self) -> Sequence[str]:
        return self.payload.acronym_scaffolding_rules


# ── Resolved instruction set ────────────────────────────────────────────


class ResolvedInstructionSet:
    """Typed, scope-filtered view of the live snapshot.

    Filtering policy: a directive matches if its scope arrays are empty
    (= applies everywhere) or contain the request scope value. `all`
    audience matches every audience.
    """

    def __init__(
        self,
        snapshot: DirectiveSnapshot,
        audience: str,
        sport: Optional[str],
        age_band: Optional[str],
        phv_stage: Optional[str],
    ) -> None:
        self._snapshot = snapshot
        self.audience = audience
        self.sport = sport
        self.age_band = age_band
        self.phv_stage = phv_stage

        self._matches: List[Directive] = [
            d for d in snapshot.directives if self._matches_scope(d)
        ]

    # ── Scope filter ────────────────────────────────────────────────

    def _matches_scope(self, d: Directive) -> bool:
        # Audience: 'all' matches anything; otherwise must match exactly.
        if d.audience != "all" and d.audience != self.audience:
            return False
        if d.sport_scope and self.sport and self.sport not in d.sport_scope:
            return False
        if d.age_scope and self.age_band and self.age_band not in d.age_scope:
            return False
        if d.phv_scope and self.phv_stage and self.phv_stage not in d.phv_scope:
            return False
        return True

    def _by_type(self, t: DirectiveType) -> List[Directive]:
        return [d for d in self._matches if d.directive_type == t]

    def _highest_priority(self, t: DirectiveType) -> Optional[Directive]:
        """Return the directive of this type with the lowest priority value
        (= highest priority). Tiebreak by newest updated_at."""
        candidates = self._by_type(t)
        if not candidates:
            return None
        return min(
            candidates,
            key=lambda d: (d.priority, -(d.updated_at.timestamp() if d.updated_at else 0)),
        )

    # ── Typed accessors ─────────────────────────────────────────────

    def identity(self) -> Optional[IdentityPayload]:
        d = self._highest_priority(DirectiveType.IDENTITY)
        if not d:
            return None
        return IdentityPayload.model_validate(d.payload)

    def identity_block(self) -> str:
        """Return the identity prose for direct injection into Block 1.
        Empty string if no identity directive in scope."""
        ident = self.identity()
        return ident.persona_description if ident else ""

    # ── Phase 6: directive-id provenance ───────────────────────────

    def directive_id(self, t: DirectiveType) -> Optional[str]:
        """Return the id of the directive of type `t` that won priority.

        Used by consumers (prompt_builder, validate, memory_service) that
        want to log which directive drove each rendered block, so the
        Prompt Inspector can show source provenance.
        """
        d = self._highest_priority(t)
        return d.id if d else None

    def directive_ids(self, t: DirectiveType) -> List[str]:
        """Every directive id of type `t` that matched scope (in priority order)."""
        return [d.id for d in self._by_type(t)]

    def tone_rules(self) -> Optional[_ToneRules]:
        d = self._highest_priority(DirectiveType.TONE)
        if not d:
            return None
        payload = TonePayload.model_validate(d.payload)
        compiled = []
        for pat in payload.banned_patterns:
            try:
                compiled.append(re.compile(pat, re.I))
            except re.error as exc:
                logger.warning(
                    "[resolver] Skipping invalid tone regex %r: %s", pat, exc
                )
        return _ToneRules(payload=payload, compiled_banned_patterns=tuple(compiled))

    def response_shape(self) -> Optional[ResponseShapePayload]:
        """Return the highest-priority response_shape directive in scope."""
        d = self._highest_priority(DirectiveType.RESPONSE_SHAPE)
        if not d:
            return None
        return ResponseShapePayload.model_validate(d.payload)

    def memory_policy(self) -> Optional[MemoryPolicyPayload]:
        d = self._highest_priority(DirectiveType.MEMORY_POLICY)
        if not d:
            return None
        return MemoryPolicyPayload.model_validate(d.payload)

    def recommendation_policy(self) -> Optional[RecommendationPolicyPayload]:
        d = self._highest_priority(DirectiveType.RECOMMENDATION_POLICY)
        if not d:
            return None
        return RecommendationPolicyPayload.model_validate(d.payload)

    def rag_policy(self) -> Optional[RagPolicyPayload]:
        d = self._highest_priority(DirectiveType.RAG_POLICY)
        if not d:
            return None
        return RagPolicyPayload.model_validate(d.payload)

    def routing_classifier(self) -> Optional[RoutingClassifierPayload]:
        d = self._highest_priority(DirectiveType.ROUTING_CLASSIFIER)
        if not d:
            return None
        return RoutingClassifierPayload.model_validate(d.payload)

    def routing_intent(self, intent_id: str) -> Optional[RoutingIntentPayload]:
        """Return the routing_intent directive matching `intent_id`, or None."""
        for d in self._by_type(DirectiveType.ROUTING_INTENT):
            payload = d.payload
            if isinstance(payload, dict) and payload.get("intent_id") == intent_id:
                return RoutingIntentPayload.model_validate(payload)
        return None

    def all_routing_intents(self) -> List[RoutingIntentPayload]:
        out: List[RoutingIntentPayload] = []
        for d in self._by_type(DirectiveType.ROUTING_INTENT):
            try:
                out.append(RoutingIntentPayload.model_validate(d.payload))
            except Exception as exc:
                logger.warning("[resolver] Skipping invalid routing_intent: %s", exc)
        return out

    # ── Phase 5: coach + parent surface accessors ──────────────────

    def surface_policy(self) -> Optional[SurfacePolicyPayload]:
        """Return the highest-priority surface_policy directive in scope.

        Surface policies usually scope to a specific audience, so callers
        should resolve with `audience="coach"` or `audience="parent"` to
        pick up the relevant policy.
        """
        d = self._highest_priority(DirectiveType.SURFACE_POLICY)
        if not d:
            return None
        return SurfacePolicyPayload.model_validate(d.payload)

    def all_surface_policies(self) -> List[SurfacePolicyPayload]:
        out: List[SurfacePolicyPayload] = []
        for d in self._by_type(DirectiveType.SURFACE_POLICY):
            try:
                out.append(SurfacePolicyPayload.model_validate(d.payload))
            except Exception as exc:
                logger.warning("[resolver] Skipping invalid surface_policy: %s", exc)
        return out

    def escalation(self) -> Optional[EscalationPayload]:
        d = self._highest_priority(DirectiveType.ESCALATION)
        if not d:
            return None
        return EscalationPayload.model_validate(d.payload)

    def all_escalations(self) -> List[EscalationPayload]:
        """Every escalation directive matching the current scope.

        Unlike most types, escalations stack — every matching trigger can
        independently fire. Callers should iterate this list and check each.
        """
        out: List[EscalationPayload] = []
        for d in self._by_type(DirectiveType.ESCALATION):
            try:
                out.append(EscalationPayload.model_validate(d.payload))
            except Exception as exc:
                logger.warning("[resolver] Skipping invalid escalation: %s", exc)
        return out

    def coach_dashboard_policy(self) -> Optional[CoachDashboardPolicyPayload]:
        d = self._highest_priority(DirectiveType.COACH_DASHBOARD_POLICY)
        if not d:
            return None
        return CoachDashboardPolicyPayload.model_validate(d.payload)

    def parent_report_policy(self) -> Optional[ParentReportPolicyPayload]:
        d = self._highest_priority(DirectiveType.PARENT_REPORT_POLICY)
        if not d:
            return None
        return ParentReportPolicyPayload.model_validate(d.payload)

    def guardrail_phv(self) -> Optional[_GuardrailPhv]:
        d = self._highest_priority(DirectiveType.GUARDRAIL_PHV)
        if not d:
            return None
        payload = GuardrailPhvPayload.model_validate(d.payload)
        compiled = []
        for pat in payload.blocked_patterns:
            try:
                compiled.append(re.compile(pat, re.I))
            except re.error as exc:
                logger.warning(
                    "[resolver] Skipping invalid PHV regex %r: %s", pat, exc
                )
        return _GuardrailPhv(
            payload=payload, compiled_blocked_patterns=tuple(compiled)
        )

    # ── Diagnostic ──────────────────────────────────────────────────

    @property
    def snapshot_label(self) -> str:
        return self._snapshot.label

    @property
    def matches(self) -> Sequence[Directive]:
        return tuple(self._matches)


# ── Public entry point ──────────────────────────────────────────────────


async def resolve(
    audience: str = "athlete",
    sport: Optional[str] = None,
    age_band: Optional[str] = None,
    phv_stage: Optional[str] = None,
) -> ResolvedInstructionSet:
    """Build a ResolvedInstructionSet for the given scope.

    Cheap to call: the snapshot is cached with a 60s TTL by the loader.
    Scope filtering is in-memory list comprehension over a small set of
    directives.
    """
    snapshot = await load_live_snapshot()
    return ResolvedInstructionSet(
        snapshot=snapshot,
        audience=audience,
        sport=sport,
        age_band=age_band,
        phv_stage=phv_stage,
    )


# ── Sync convenience for code paths that can't await yet ────────────────


def resolve_sync(
    audience: str = "athlete",
    sport: Optional[str] = None,
    age_band: Optional[str] = None,
    phv_stage: Optional[str] = None,
) -> ResolvedInstructionSet:
    """Sync variant: loads the seed snapshot directly without DB.

    Use only from sync code paths during the cutover (e.g., synchronous
    prompt builders). The async `resolve` is preferred and will pick up
    the live DB snapshot.
    """
    from app.instructions.seed import build_seed_snapshot

    # If the loader has already cached a real snapshot, reuse it.
    from app.instructions import loader as _loader

    snap = _loader._CACHED  # noqa: SLF001 — intentional read of module cache
    if snap is None:
        snap = build_seed_snapshot()
    return ResolvedInstructionSet(
        snapshot=snap,
        audience=audience,
        sport=sport,
        age_band=age_band,
        phv_stage=phv_stage,
    )


__all__ = [
    "ResolvedInstructionSet",
    "resolve",
    "resolve_sync",
]
