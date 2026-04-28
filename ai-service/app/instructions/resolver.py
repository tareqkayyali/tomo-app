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
from typing import Any, Dict, Iterable, List, Optional, Pattern, Sequence

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

    def _by_type_sorted(self, t: DirectiveType) -> List[Directive]:
        """All matching directives of type `t`, sorted highest priority first
        (lowest priority value). Tiebreak by newest updated_at."""
        return sorted(
            self._by_type(t),
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
        """Merge every in-scope tone directive additively.

        Two complementary rules ("never use 'great effort'", "never use 'fantastic'")
        both apply at runtime. Lists union (de-duped, order preserved highest-priority-first);
        dict-keyed rules take the highest-priority value when a key collides.
        """
        directives = self._by_type_sorted(DirectiveType.TONE)
        if not directives:
            return None

        banned_phrases: List[str] = []
        banned_patterns: List[str] = []
        clinical_language_rules: List[str] = []
        acronym_scaffolding_rules: List[str] = []
        required_companion_clauses: Dict[str, str] = {}
        age_specific_jargon_rules: Dict[str, List[str]] = {}

        def _extend_unique(dst: List[str], src: Iterable[str]) -> None:
            seen = set(dst)
            for item in src:
                if item not in seen:
                    dst.append(item)
                    seen.add(item)

        for d in directives:
            payload = TonePayload.model_validate(d.payload)
            _extend_unique(banned_phrases, payload.banned_phrases)
            _extend_unique(banned_patterns, payload.banned_patterns)
            _extend_unique(clinical_language_rules, payload.clinical_language_rules)
            _extend_unique(acronym_scaffolding_rules, payload.acronym_scaffolding_rules)
            for k, v in payload.required_companion_clauses.items():
                required_companion_clauses.setdefault(k, v)
            if payload.age_specific_jargon_rules:
                for k, v in payload.age_specific_jargon_rules.items():
                    bucket = age_specific_jargon_rules.setdefault(k, [])
                    _extend_unique(bucket, v)

        merged = TonePayload(
            banned_phrases=banned_phrases,
            banned_patterns=banned_patterns,
            required_companion_clauses=required_companion_clauses,
            age_specific_jargon_rules=age_specific_jargon_rules or None,
            clinical_language_rules=clinical_language_rules,
            acronym_scaffolding_rules=acronym_scaffolding_rules,
        )

        compiled = []
        for pat in merged.banned_patterns:
            try:
                compiled.append(re.compile(pat, re.I))
            except re.error as exc:
                logger.warning(
                    "[resolver] Skipping invalid tone regex %r: %s", pat, exc
                )
        return _ToneRules(payload=merged, compiled_banned_patterns=tuple(compiled))

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
        """Merge every in-scope recommendation_policy directive additively.

        Block / mandatory categories union. The cap (max_recs_per_turn) takes
        the MIN — most restrictive cap wins. priority_override picks the
        most restrictive (P0 > P1 > P2 > P3). forced_inclusions / scope_conditions
        merge dict keys, highest-priority value wins on key collision.
        """
        directives = self._by_type_sorted(DirectiveType.RECOMMENDATION_POLICY)
        if not directives:
            return None

        blocked_categories: List[str] = []
        mandatory_categories: List[str] = []
        max_recs_per_turn: Optional[int] = None
        priority_override: Optional[str] = None
        forced_inclusions: Dict[str, Any] = {}
        scope_conditions: Dict[str, Any] = {}

        # P0 most restrictive → P3 least.
        priority_rank = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}

        def _extend_unique(dst: List[str], src: Iterable[str]) -> None:
            seen = set(dst)
            for item in src:
                if item not in seen:
                    dst.append(item)
                    seen.add(item)

        for d in directives:
            payload = RecommendationPolicyPayload.model_validate(d.payload)
            _extend_unique(blocked_categories, payload.blocked_categories)
            _extend_unique(mandatory_categories, payload.mandatory_categories)
            if payload.max_recs_per_turn is not None:
                max_recs_per_turn = (
                    payload.max_recs_per_turn
                    if max_recs_per_turn is None
                    else min(max_recs_per_turn, payload.max_recs_per_turn)
                )
            if payload.priority_override is not None:
                if priority_override is None or priority_rank[payload.priority_override] < priority_rank[priority_override]:
                    priority_override = payload.priority_override
            for k, v in payload.forced_inclusions.items():
                forced_inclusions.setdefault(k, v)
            for k, v in payload.scope_conditions.items():
                scope_conditions.setdefault(k, v)

        return RecommendationPolicyPayload(
            scope_conditions=scope_conditions,
            blocked_categories=blocked_categories,
            mandatory_categories=mandatory_categories,
            priority_override=priority_override,  # type: ignore[arg-type]
            max_recs_per_turn=max_recs_per_turn,
            forced_inclusions=forced_inclusions,
        )

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
        """Merge every in-scope guardrail_phv directive additively.

        Block lists union. advisory_or_blocking picks "blocking" if any rule
        is blocking (most restrictive). unknown_age_default picks "conservative"
        if any rule is conservative. safety_warning_template concatenates
        unique non-empty messages in priority order. phv_stage_rules and
        safe_alternatives merge by stage / exercise key with union of inner
        lists and MIN load_multiplier / most-restrictive intensity_cap.
        """
        directives = self._by_type_sorted(DirectiveType.GUARDRAIL_PHV)
        if not directives:
            return None

        intensity_rank = {"rest": 0, "light": 1, "moderate": 2, "full": 3}

        def _extend_unique(dst: List[str], src: Iterable[str]) -> None:
            seen = set(dst)
            for item in src:
                if item not in seen:
                    dst.append(item)
                    seen.add(item)

        blocked_exercises: List[str] = []
        blocked_patterns: List[str] = []
        warning_lines: List[str] = []
        phv_stage_rules: Dict[str, Dict[str, Any]] = {}
        safe_alternatives: Dict[str, List[str]] = {}
        advisory_or_blocking = "advisory"
        unknown_age_default = "permissive"

        for d in directives:
            payload = GuardrailPhvPayload.model_validate(d.payload)
            _extend_unique(blocked_exercises, payload.blocked_exercises)
            _extend_unique(blocked_patterns, payload.blocked_patterns)
            warning = (payload.safety_warning_template or "").strip()
            if warning and warning not in warning_lines:
                warning_lines.append(warning)
            if payload.advisory_or_blocking == "blocking":
                advisory_or_blocking = "blocking"
            if payload.unknown_age_default == "conservative":
                unknown_age_default = "conservative"

            for stage, rule in payload.phv_stage_rules.items():
                merged = phv_stage_rules.setdefault(
                    stage,
                    {"blocked_exercises": [], "intensity_cap": None, "load_multiplier": None},
                )
                _extend_unique(merged["blocked_exercises"], rule.blocked_exercises)
                if rule.intensity_cap is not None:
                    cur = merged["intensity_cap"]
                    if cur is None or intensity_rank[rule.intensity_cap] < intensity_rank[cur]:
                        merged["intensity_cap"] = rule.intensity_cap
                if rule.load_multiplier is not None:
                    cur = merged["load_multiplier"]
                    merged["load_multiplier"] = (
                        rule.load_multiplier if cur is None else min(cur, rule.load_multiplier)
                    )

            for ex, alts in payload.safe_alternatives.items():
                bucket = safe_alternatives.setdefault(ex, [])
                _extend_unique(bucket, alts)

        merged_payload = GuardrailPhvPayload(
            blocked_exercises=blocked_exercises,
            blocked_patterns=blocked_patterns,
            phv_stage_rules=phv_stage_rules,  # type: ignore[arg-type]
            advisory_or_blocking=advisory_or_blocking,  # type: ignore[arg-type]
            safe_alternatives=safe_alternatives,
            safety_warning_template="\n\n".join(warning_lines),
            unknown_age_default=unknown_age_default,  # type: ignore[arg-type]
        )

        compiled = []
        for pat in merged_payload.blocked_patterns:
            try:
                compiled.append(re.compile(pat, re.I))
            except re.error as exc:
                logger.warning(
                    "[resolver] Skipping invalid PHV regex %r: %s", pat, exc
                )
        return _GuardrailPhv(
            payload=merged_payload, compiled_blocked_patterns=tuple(compiled)
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
