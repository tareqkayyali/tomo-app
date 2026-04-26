"""
Tomo AI Service — 4-Layer Performance Model (Phase 2)

Pure functions: compute_layer_gaps() + build_performance_layers_block()

Replaces the permanently-None benchmark_profile path with a structured
four-layer gap analysis computed entirely from existing SnapshotEnrichment
fields — no additional DB queries needed.

Layers:
  Physical  — fitness, recovery, load management (CCRS-anchored)
  Technical — skill execution, training discipline (mastery + compliance)
  Tactical  — game intelligence, coaching receptiveness (coachability + rec adoption)
  Mental    — psychological readiness, wellbeing (wellness + sleep + stress)

Per-position priorities (1–5) tell the AI which gaps matter most for this athlete's
role. A gap in a HIGH-priority layer warrants direct coaching attention; a gap in a
LOW-priority layer is noted but not emphasized.

Design contract:
  - Zero I/O. Accepts PlayerContext (already assembled), returns a dataclass.
  - Returns None when there is insufficient data across all layers.
  - PHV adjustment: mid-PHV athletes get expected physical-layer norms lowered by
    one band (i.e. a score of 58 reads as 'on_track' rather than 'developing').
  - Social layer is intentionally excluded from backend computation (UI-only).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.layers")

# ── Gap thresholds ─────────────────────────────────────────────────────────────

# (label, min_score_inclusive)  — evaluated top-down
_THRESHOLDS = [
    ("strength",   75),
    ("on_track",   55),
    ("developing", 35),
    ("gap",         0),
]

_GAP_SYMBOLS = {
    "strength":   "●",
    "on_track":   "●",
    "developing": "⚠",
    "gap":        "✗",
}

_PHV_PHYSICAL_BONUS = 8  # mid-PHV athletes earn +8 on raw physical score before thresholding
                          # reflects that lower absolute readiness is expected + safe during growth

# ── Per-position priority weights (sport → position_key → layer → priority 1–5) ─

_POSITION_PRIORITIES: dict[str, dict[str, dict[str, int]]] = {
    "football": {
        "goalkeeper":   {"physical": 3, "technical": 3, "tactical": 5, "mental": 4},
        "gk":           {"physical": 3, "technical": 3, "tactical": 5, "mental": 4},
        "centre-back":  {"physical": 4, "technical": 3, "tactical": 4, "mental": 3},
        "cb":           {"physical": 4, "technical": 3, "tactical": 4, "mental": 3},
        "defender":     {"physical": 4, "technical": 3, "tactical": 4, "mental": 3},
        "full-back":    {"physical": 4, "technical": 4, "tactical": 3, "mental": 3},
        "fb":           {"physical": 4, "technical": 4, "tactical": 3, "mental": 3},
        "midfielder":   {"physical": 4, "technical": 4, "tactical": 5, "mental": 3},
        "cm":           {"physical": 4, "technical": 4, "tactical": 5, "mental": 3},
        "cdm":          {"physical": 4, "technical": 3, "tactical": 5, "mental": 3},
        "cam":          {"physical": 3, "technical": 5, "tactical": 4, "mental": 3},
        "winger":       {"physical": 5, "technical": 4, "tactical": 3, "mental": 2},
        "lw":           {"physical": 5, "technical": 4, "tactical": 3, "mental": 2},
        "rw":           {"physical": 5, "technical": 4, "tactical": 3, "mental": 2},
        "forward":      {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
        "striker":      {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
        "cf":           {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
        "st":           {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
    },
    "soccer": {  # alias — same weights as football
        "goalkeeper":   {"physical": 3, "technical": 3, "tactical": 5, "mental": 4},
        "gk":           {"physical": 3, "technical": 3, "tactical": 5, "mental": 4},
        "defender":     {"physical": 4, "technical": 3, "tactical": 4, "mental": 3},
        "midfielder":   {"physical": 4, "technical": 4, "tactical": 5, "mental": 3},
        "forward":      {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
        "striker":      {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
        "winger":       {"physical": 5, "technical": 4, "tactical": 3, "mental": 2},
    },
    "basketball": {
        "point guard":    {"physical": 4, "technical": 4, "tactical": 5, "mental": 4},
        "pg":             {"physical": 4, "technical": 4, "tactical": 5, "mental": 4},
        "shooting guard": {"physical": 4, "technical": 5, "tactical": 3, "mental": 3},
        "sg":             {"physical": 4, "technical": 5, "tactical": 3, "mental": 3},
        "small forward":  {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
        "sf":             {"physical": 5, "technical": 4, "tactical": 3, "mental": 3},
        "power forward":  {"physical": 5, "technical": 3, "tactical": 4, "mental": 3},
        "pf":             {"physical": 5, "technical": 3, "tactical": 4, "mental": 3},
        "center":         {"physical": 5, "technical": 3, "tactical": 3, "mental": 3},
        "c":              {"physical": 5, "technical": 3, "tactical": 3, "mental": 3},
    },
    "tennis": {
        "baseline":       {"physical": 5, "technical": 4, "tactical": 4, "mental": 4},
        "serve-volley":   {"physical": 4, "technical": 5, "tactical": 4, "mental": 3},
        "all-court":      {"physical": 5, "technical": 4, "tactical": 4, "mental": 4},
        "singles":        {"physical": 5, "technical": 4, "tactical": 4, "mental": 4},
        "doubles":        {"physical": 4, "technical": 4, "tactical": 5, "mental": 3},
    },
    "padel": {
        "drive":          {"physical": 4, "technical": 5, "tactical": 3, "mental": 3},
        "lob":            {"physical": 3, "technical": 4, "tactical": 5, "mental": 4},
        "all-round":      {"physical": 4, "technical": 4, "tactical": 4, "mental": 3},
    },
}

_DEFAULT_PRIORITIES = {"physical": 4, "technical": 4, "tactical": 4, "mental": 3}

_PRIORITY_LABELS = {1: "LOW", 2: "LOW", 3: "MEDIUM", 4: "HIGH", 5: "VERY HIGH"}


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class LayerScore:
    layer: str              # physical | technical | tactical | mental
    score: float            # 0-100 normalised composite
    priority: int           # 1-5 for this athlete's position
    gap_label: str          # strength | on_track | developing | gap
    data_points: int        # how many metrics contributed (confidence indicator)
    key_signals: list[str] = field(default_factory=list)  # human-readable signal names


@dataclass(frozen=True)
class LayerGapResult:
    layers: list[LayerScore]
    primary_gap: Optional[str]       # layer name with worst weighted gap, or None
    primary_strength: Optional[str]  # layer name with best weighted score, or None
    sport: str
    position: str


# ── Normalisation helpers ──────────────────────────────────────────────────────

def _norm(value: Optional[float], lo: float = 0.0, hi: float = 100.0) -> Optional[float]:
    """Clamp and normalise value to [0, 100]. Returns None if value is None."""
    if value is None:
        return None
    clamped = max(lo, min(hi, float(value)))
    return (clamped - lo) / (hi - lo) * 100.0


def _norm_rate(value: Optional[float]) -> Optional[float]:
    """Normalise a 0-1 rate to 0-100. Returns None if value is None."""
    return _norm(value, 0.0, 1.0)


def _gap_label(score: float) -> str:
    for label, threshold in _THRESHOLDS:
        if score >= threshold:
            return label
    return "gap"


def _weighted_avg(pairs: list[tuple[float, float]]) -> float:
    """Weighted average of (value, weight) pairs. Assumes weights > 0."""
    total_w = sum(w for _, w in pairs)
    if total_w == 0:
        return 0.0
    return sum(v * w for v, w in pairs) / total_w


def _priority_for(sport: str, position: Optional[str]) -> dict[str, int]:
    if not position:
        return _DEFAULT_PRIORITIES
    sport_map = _POSITION_PRIORITIES.get(sport.lower(), {})
    pos_key = position.lower().strip()
    return sport_map.get(pos_key, _DEFAULT_PRIORITIES)


# ── Layer computation ──────────────────────────────────────────────────────────

def _compute_physical(se) -> tuple[Optional[float], list[str]]:  # type: ignore[return]
    """
    Physical layer: fitness, recovery, load management.
    Anchor: CCRS (60% weight). Secondary: recovery_score/wellness, monotony penalty.
    """
    pairs: list[tuple[float, float]] = []
    signals: list[str] = []

    # CCRS — primary readiness signal (already 0-100)
    if se.ccrs is not None:
        pairs.append((float(se.ccrs), 0.60))
        signals.append(f"CCRS={int(se.ccrs)}")

    # Recovery score (0-100)
    if se.recovery_score is not None:
        pairs.append((float(se.recovery_score), 0.20))
        signals.append(f"recovery={int(se.recovery_score)}")

    # Wellness 7-day avg — could be 0-10 or 0-100; normalise defensively
    if se.wellness_7day_avg is not None:
        w = float(se.wellness_7day_avg)
        normed = _norm(w, 0.0, 10.0) if w <= 10.0 else _norm(w, 0.0, 100.0)
        if normed is not None:
            pairs.append((normed, 0.15))
            signals.append(f"wellness={w:.1f}")

    # Training monotony penalty: high monotony (>1.5) = reduced physical variety
    if se.training_monotony is not None:
        mono = float(se.training_monotony)
        mono_score = max(0.0, 100.0 - max(0.0, (mono - 1.0) / 1.5 * 100.0))
        pairs.append((mono_score, 0.05))
        signals.append(f"monotony={mono:.2f}")

    if not pairs:
        return None, []

    return _weighted_avg(pairs), signals


def _compute_technical(se) -> tuple[Optional[float], list[str]]:
    """
    Technical layer: skill execution + training discipline.
    Anchor: mastery_scores avg. Secondary: plan compliance, check-in consistency.
    """
    pairs: list[tuple[float, float]] = []
    signals: list[str] = []

    # Mastery scores — dict of skill→score (0-100); use average
    if se.mastery_scores:
        values = [float(v) for v in se.mastery_scores.values() if v is not None]
        if values:
            avg = sum(values) / len(values)
            pairs.append((avg, 0.50))
            signals.append(f"mastery_avg={avg:.0f}")

    # Plan compliance 7d (0-1 → 0-100)
    if se.plan_compliance_7d is not None:
        normed = _norm_rate(se.plan_compliance_7d)
        if normed is not None:
            pairs.append((normed, 0.30))
            signals.append(f"plan_compliance={se.plan_compliance_7d:.0%}")

    # Check-in consistency (0-1 → 0-100) — data discipline proxy
    if se.checkin_consistency_7d is not None:
        normed = _norm_rate(se.checkin_consistency_7d)
        if normed is not None:
            pairs.append((normed, 0.20))
            signals.append(f"checkin={se.checkin_consistency_7d:.0%}")

    if not pairs:
        return None, []

    return _weighted_avg(pairs), signals


def _compute_tactical(se) -> tuple[Optional[float], list[str]]:
    """
    Tactical layer: game intelligence + coaching receptiveness.
    Anchor: coachability_index. Secondary: rec_action_rate_30d.
    """
    pairs: list[tuple[float, float]] = []
    signals: list[str] = []

    # Coachability index (0-100)
    if se.coachability_index is not None:
        pairs.append((float(se.coachability_index), 0.60))
        signals.append(f"coachability={int(se.coachability_index)}")

    # Recommendation action rate (0-1 → 0-100)
    if se.rec_action_rate_30d is not None:
        normed = _norm_rate(se.rec_action_rate_30d)
        if normed is not None:
            pairs.append((normed, 0.40))
            signals.append(f"rec_adoption={se.rec_action_rate_30d:.0%}")

    if not pairs:
        return None, []

    return _weighted_avg(pairs), signals


def _compute_mental(se, ctx) -> tuple[Optional[float], list[str]]:
    """
    Mental layer: psychological readiness + wellbeing.
    Anchor: wellness 7d avg. Secondary: sleep quality, academic stress (inverted).
    """
    pairs: list[tuple[float, float]] = []
    signals: list[str] = []

    # Wellness 7-day avg (0-10 or 0-100)
    if se.wellness_7day_avg is not None:
        w = float(se.wellness_7day_avg)
        normed = _norm(w, 0.0, 10.0) if w <= 10.0 else _norm(w, 0.0, 100.0)
        if normed is not None:
            pairs.append((normed, 0.40))
            signals.append(f"wellness={w:.1f}")

    # Sleep quality (0-10 or 0-100)
    if se.sleep_quality is not None:
        sq = float(se.sleep_quality)
        normed = _norm(sq, 0.0, 10.0) if sq <= 10.0 else _norm(sq, 0.0, 100.0)
        if normed is not None:
            pairs.append((normed, 0.35))
            signals.append(f"sleep={sq:.1f}")

    # Academic stress from PlayerContext (0-10 scale, lower = better)
    acad = getattr(ctx, "academic_load_score", None)
    if acad is not None:
        # Invert: high academic load = low mental layer score
        mental_from_acad = max(0.0, 100.0 - float(acad) * 10.0)
        pairs.append((mental_from_acad, 0.25))
        signals.append(f"acad_load={float(acad):.1f}/10")

    if not pairs:
        return None, []

    return _weighted_avg(pairs), signals


# ── Public API ────────────────────────────────────────────────────────────────

def compute_layer_gaps(ctx: "PlayerContext") -> Optional[LayerGapResult]:
    """
    Compute the 4-layer performance model for this athlete.

    Pure function — reads PlayerContext (already assembled), returns LayerGapResult.
    Returns None when all four layers have insufficient data.

    PHV adjustment: mid-PHV athletes receive a +{_PHV_PHYSICAL_BONUS}-point bonus
    on the raw physical score before thresholding, reflecting that lower absolute
    physical readiness is both expected and safe during peak growth velocity.
    """
    se = ctx.snapshot_enrichment
    if se is None:
        return None

    sport = (ctx.sport or "football").lower()
    position = ctx.position or "General"
    priorities = _priority_for(sport, position)

    is_mid_phv = (
        se.phv_stage is not None
        and se.phv_stage.lower() in ("mid_phv", "mid", "circa")
    )

    # ── Compute each layer ──
    layers: list[LayerScore] = []
    data_rich = 0  # count layers with actual data

    for layer_name, compute_fn, extra_args in [
        ("physical",  lambda se: _compute_physical(se),            ()),
        ("technical", lambda se: _compute_technical(se),           ()),
        ("tactical",  lambda se: _compute_tactical(se),            ()),
        ("mental",    lambda se: _compute_mental(se, ctx),         ()),
    ]:
        raw_score, signals = compute_fn(se)

        if raw_score is None:
            continue

        # PHV adjustment on physical layer
        adjusted = raw_score
        if layer_name == "physical" and is_mid_phv:
            adjusted = min(100.0, raw_score + _PHV_PHYSICAL_BONUS)

        score_rounded = round(adjusted, 1)
        label = _gap_label(score_rounded)
        priority = priorities.get(layer_name, 3)
        data_rich += 1

        layers.append(LayerScore(
            layer=layer_name,
            score=score_rounded,
            priority=priority,
            gap_label=label,
            data_points=len(signals),
            key_signals=signals,
        ))

    if data_rich == 0:
        return None

    # ── Identify primary gap + primary strength ──
    # Weight by (100 - score) × priority for gap, score × priority for strength
    gap_weighted = [(100.0 - ls.score) * ls.priority for ls in layers]
    strength_weighted = [ls.score * ls.priority for ls in layers]

    primary_gap = layers[gap_weighted.index(max(gap_weighted))].layer if layers else None
    primary_strength = layers[strength_weighted.index(max(strength_weighted))].layer if layers else None

    # If primary gap is already a "strength", don't report it as a gap
    for ls in layers:
        if ls.layer == primary_gap and ls.gap_label == "strength":
            primary_gap = None
            break

    return LayerGapResult(
        layers=layers,
        primary_gap=primary_gap,
        primary_strength=primary_strength,
        sport=sport,
        position=position,
    )


def build_performance_layers_block(ctx: "PlayerContext") -> str:
    """
    Block 2.1b: 4-layer performance model — injected after SPORT CONTEXT.

    Renders as a compact table so the AI understands the athlete's development
    profile at a glance. High-priority gaps get an explicit coaching note.
    Returns empty string when layer computation yields no data.
    """
    gap_result = compute_layer_gaps(ctx)
    if gap_result is None:
        return ""

    position_label = gap_result.position
    sport_label = gap_result.sport.title()
    lines = [f"PERFORMANCE LAYERS — {position_label} ({sport_label}):"]

    for ls in gap_result.layers:
        symbol = _GAP_SYMBOLS.get(ls.gap_label, "·")
        priority_label = _PRIORITY_LABELS.get(ls.priority, "MEDIUM")
        score_str = f"{int(ls.score)}/100"
        label_upper = ls.gap_label.upper().replace("_", " ")
        signal_str = f" [{', '.join(ls.key_signals)}]" if ls.key_signals else ""
        lines.append(
            f"  {ls.layer.title():<10} {score_str:>7}  {symbol} {label_upper:<11}  "
            f"Priority: {priority_label}{signal_str}"
        )

    # Coaching notes for high-priority gaps
    notes = []
    high_pri_gaps = [
        ls for ls in gap_result.layers
        if ls.gap_label in ("developing", "gap") and ls.priority >= 4
    ]
    if high_pri_gaps:
        worst = sorted(high_pri_gaps, key=lambda ls: ls.score)[0]
        notes.append(
            f"→ Priority development focus: {worst.layer.title()} "
            f"(key requirement for this position)"
        )

    if gap_result.primary_strength:
        st = next((ls for ls in gap_result.layers if ls.layer == gap_result.primary_strength), None)
        if st and st.gap_label in ("strength", "on_track"):
            notes.append(f"→ Anchor strength: {st.layer.title()} (build confidence from here)")

    if notes:
        lines.append("")
        lines.extend(notes)

    return "\n".join(lines)
