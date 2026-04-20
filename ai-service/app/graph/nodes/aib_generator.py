"""
Tomo AI Service — Athlete Intelligence Brief (AIB) Generator
Background pipeline that pre-synthesizes athlete snapshot data into a
coaching-ready text summary using Haiku (~$0.003/generation).

AIB replaces the need for agents to interpret 90+ raw snapshot fields
on every request. Instead, they get a pre-digested coaching narrative.

Triggers:
  1. Snapshot change — whenever writeSnapshot() updates athlete_snapshots
  2. Lazy fallback — if AIB is stale (>24h) when context_assembly requests it

The AIB table stores versioned briefs with staleness tracking.
"""

from __future__ import annotations

import logging
import hashlib
from datetime import datetime, timezone
from typing import Optional

from app.config import get_settings
from app.db.supabase import get_pool
from app.models.context import PlayerContext, SnapshotEnrichment

logger = logging.getLogger("tomo-ai.aib")

# ── AIB System Prompt ────────────────────────────────────────────────

AIB_SYSTEM_PROMPT_WITH_ACWR = """You are an elite sports scientist and youth athletic development specialist.
Your task is to synthesize raw athlete data into a concise coaching intelligence brief.

The brief MUST contain exactly 6 sections:
1. **Readiness & Recovery** — Current readiness state, HRV trends, sleep quality, recovery needs
2. **Load Management** — ACWR status, training load trends, injury risk assessment, dual-load balance
3. **Performance Profile** — Key strengths, gaps, recent test improvements, benchmark percentiles
4. **Development Context** — PHV stage implications, training age, age-band considerations
5. **Behavioral Signals** — Engagement patterns, journal consistency, coaching preference, plan compliance
6. **Coaching Priorities** — Top 3 actionable priorities for the next interaction

Rules:
- Be specific with numbers (e.g., "ACWR at 1.3 — approaching overtraining zone")
- Flag RED/AMBER items prominently
- Use sport-specific language appropriate to the athlete's sport and position
- Keep total brief under 400 words
- Write in present tense, coaching voice
- If data is missing, say "Data pending" — never fabricate values"""


# Post-decommission system prompt — ACWR is not surfaced to the AIB
# pipeline. The load/readiness narrative is driven by CCRS + injury risk
# + wellness trend. Academic dual-load remains visible via DLI and
# exam-proximity fields already in the user template.
AIB_SYSTEM_PROMPT_CCRS = """You are an elite sports scientist and youth athletic development specialist.
Your task is to synthesize raw athlete data into a concise coaching intelligence brief.

The brief MUST contain exactly 6 sections:
1. **Readiness & Recovery** — CCRS score and recommendation, HRV trends, sleep quality, recovery needs
2. **Load & Dual-Load** — CCRS-driven load guidance, injury risk assessment, athletic vs academic balance
3. **Performance Profile** — Key strengths, gaps, recent test improvements, benchmark percentiles
4. **Development Context** — PHV stage implications, training age, age-band considerations
5. **Behavioral Signals** — Engagement patterns, journal consistency, coaching preference, plan compliance
6. **Coaching Priorities** — Top 3 actionable priorities for the next interaction

Rules:
- Ground load guidance in the CCRS recommendation (full_load / moderate / reduced / recovery / blocked), not in raw ratios
- Flag RED/AMBER items prominently
- Use sport-specific language appropriate to the athlete's sport and position
- Keep total brief under 400 words
- Write in present tense, coaching voice
- If data is missing, say "Data pending" — never fabricate values
- Never reference ACWR, ATL, CTL, or any raw load-ratio number"""


def _system_prompt() -> str:
    return (
        AIB_SYSTEM_PROMPT_WITH_ACWR
        if get_settings().acwr_ai_enabled
        else AIB_SYSTEM_PROMPT_CCRS
    )


# Back-compat alias so external callers/logging referencing AIB_SYSTEM_PROMPT
# keep working; resolved lazily via _system_prompt() at send time.
AIB_SYSTEM_PROMPT = AIB_SYSTEM_PROMPT_WITH_ACWR

AIB_USER_TEMPLATE_WITH_ACWR = """Generate an Athlete Intelligence Brief for:

**Athlete**: {name} ({sport}, {position})
**Age Band**: {age_band} | **Gender**: {gender}
**Date**: {today_date} | **Time**: {current_time}

**Readiness**: {readiness_score} (checked in: {checkin_date})
{readiness_detail}

**Load Management**:
- ACWR: {acwr} | ATL-7d: {atl_7day} | CTL-28d: {ctl_28day}
- Injury Risk: {injury_risk_flag}
- Athletic Load 7d: {athletic_load_7day} | Academic Load 7d: {academic_load_7day}
- Dual Load Index: {dual_load_index}
- Projected Load 7d: {projected_load_7day} | Projected ACWR: {projected_acwr}
- Training Monotony: {training_monotony} | Training Strain: {training_strain}

**Wellness & Vitals**:
- HRV Baseline: {hrv_baseline_ms}ms | Today: {hrv_today_ms}ms | Trend: {hrv_trend_7d_pct}%
- Sleep Quality: {sleep_quality} | Sleep Debt 3d: {sleep_debt_3d}
- Wellness 7d Avg: {wellness_7day_avg} | Trend: {wellness_trend}
- Recovery Score: {recovery_score} | SpO2: {spo2_pct}%

**Performance**:
- Sessions: {sessions_total} | Training Age: {training_age_weeks}wk | Streak: {streak_days}d
- CV Completeness: {cv_completeness}%
- Coachability: {coachability_index}

**Development**:
- PHV Stage: {phv_stage} | Offset: {phv_offset_years}yr
- Triangle RAG: {triangle_rag} | Readiness RAG: {readiness_rag}

**Engagement**:
- Journal Completeness 7d: {journal_completeness_7d} | Streak: {journal_streak_days}d
- Plan Compliance 7d: {plan_compliance_7d}
- Checkin Consistency 7d: {checkin_consistency_7d}
- Rec Action Rate 30d: {rec_action_rate_30d}
- Coaching Preference: {coaching_preference}

**Context**:
- Matches Next 7d: {matches_next_7d} | Exams Next 14d: {exams_next_14d}
- Season Phase: {season_phase}
- Active Mode: {athlete_mode} | Dual Load Zone: {dual_load_zone}
- Data Confidence: {data_confidence_score}"""


# Post-decommission template. ACWR/ATL/CTL/projected_acwr/training_monotony
# /training_strain omitted — the AIB ignores raw load ratios and leans on
# CCRS + injury risk + dual-load for the Load section.
AIB_USER_TEMPLATE_CCRS = """Generate an Athlete Intelligence Brief for:

**Athlete**: {name} ({sport}, {position})
**Age Band**: {age_band} | **Gender**: {gender}
**Date**: {today_date} | **Time**: {current_time}

**Readiness**: {readiness_score} (checked in: {checkin_date})
{readiness_detail}

**CCRS**:
- Score: {ccrs} | Recommendation: {ccrs_recommendation} | Confidence: {ccrs_confidence}
- Alert Flags: {ccrs_alert_flags}
- Data Freshness: {data_freshness}

**Load & Dual-Load**:
- Injury Risk: {injury_risk_flag}
- Athletic Load 7d: {athletic_load_7day} | Academic Load 7d: {academic_load_7day}
- Dual Load Index: {dual_load_index}

**Wellness & Vitals**:
- HRV Baseline: {hrv_baseline_ms}ms | Today: {hrv_today_ms}ms | Trend: {hrv_trend_7d_pct}%
- Sleep Quality: {sleep_quality} | Sleep Debt 3d: {sleep_debt_3d}
- Wellness 7d Avg: {wellness_7day_avg} | Trend: {wellness_trend}
- Recovery Score: {recovery_score} | SpO2: {spo2_pct}%

**Performance**:
- Sessions: {sessions_total} | Training Age: {training_age_weeks}wk | Streak: {streak_days}d
- CV Completeness: {cv_completeness}%
- Coachability: {coachability_index}

**Development**:
- PHV Stage: {phv_stage} | Offset: {phv_offset_years}yr
- Triangle RAG: {triangle_rag} | Readiness RAG: {readiness_rag}

**Engagement**:
- Journal Completeness 7d: {journal_completeness_7d} | Streak: {journal_streak_days}d
- Plan Compliance 7d: {plan_compliance_7d}
- Checkin Consistency 7d: {checkin_consistency_7d}
- Rec Action Rate 30d: {rec_action_rate_30d}
- Coaching Preference: {coaching_preference}

**Context**:
- Matches Next 7d: {matches_next_7d} | Exams Next 14d: {exams_next_14d}
- Season Phase: {season_phase}
- Active Mode: {athlete_mode} | Dual Load Zone: {dual_load_zone}
- Data Confidence: {data_confidence_score}"""


AIB_USER_TEMPLATE = AIB_USER_TEMPLATE_WITH_ACWR


def _format_aib_prompt(context: PlayerContext) -> str:
    """Format the AIB user prompt from PlayerContext."""
    se = context.snapshot_enrichment
    rc = context.readiness_components

    readiness_detail = ""
    if rc:
        readiness_detail = (
            f"Energy: {rc.energy}/5, Soreness: {rc.soreness}/5, "
            f"Sleep: {rc.sleep_hours}h, Mood: {rc.mood}/5, "
            f"Academic Stress: {rc.academic_stress or 'N/A'}, "
            f"Pain: {'YES' if rc.pain_flag else 'No'}"
        )

    def _v(val, suffix: str = "") -> str:
        if val is None:
            return "N/A"
        return f"{val}{suffix}"

    if se:
        acwr_enabled = get_settings().acwr_ai_enabled
        common_kwargs = dict(
            name=context.name,
            sport=context.sport,
            position=context.position or "N/A",
            age_band=context.age_band or "N/A",
            gender=context.gender or "N/A",
            today_date=context.today_date,
            current_time=context.current_time,
            readiness_score=context.readiness_score or "No checkin",
            checkin_date=context.checkin_date or "N/A",
            readiness_detail=readiness_detail or "No checkin data",
            injury_risk_flag=_v(se.injury_risk_flag),
            athletic_load_7day=_v(se.athletic_load_7day),
            academic_load_7day=_v(se.academic_load_7day),
            dual_load_index=_v(se.dual_load_index),
            hrv_baseline_ms=_v(se.hrv_baseline_ms),
            hrv_today_ms=_v(se.hrv_today_ms),
            hrv_trend_7d_pct=_v(se.hrv_trend_7d_pct),
            sleep_quality=_v(se.sleep_quality),
            sleep_debt_3d=_v(se.sleep_debt_3d),
            wellness_7day_avg=_v(se.wellness_7day_avg),
            wellness_trend=_v(se.wellness_trend),
            recovery_score=_v(se.recovery_score),
            spo2_pct=_v(se.spo2_pct),
            sessions_total=_v(se.sessions_total),
            training_age_weeks=_v(se.training_age_weeks),
            streak_days=_v(se.streak_days),
            cv_completeness=_v(se.cv_completeness),
            coachability_index=_v(se.coachability_index),
            phv_stage=_v(se.phv_stage),
            phv_offset_years=_v(se.phv_offset_years),
            triangle_rag=_v(se.triangle_rag),
            readiness_rag=_v(se.readiness_rag),
            journal_completeness_7d=_v(se.journal_completeness_7d),
            journal_streak_days=_v(se.journal_streak_days),
            plan_compliance_7d=_v(se.plan_compliance_7d),
            checkin_consistency_7d=_v(se.checkin_consistency_7d),
            rec_action_rate_30d=_v(se.rec_action_rate_30d),
            coaching_preference=_v(se.coaching_preference),
            matches_next_7d=_v(se.matches_next_7d),
            exams_next_14d=_v(se.exams_next_14d),
            season_phase=_v(se.season_phase),
            athlete_mode=_v(se.athlete_mode),
            dual_load_zone=_v(se.dual_load_zone),
            data_confidence_score=_v(se.data_confidence_score),
        )
        if acwr_enabled:
            return AIB_USER_TEMPLATE_WITH_ACWR.format(
                acwr=_v(se.acwr),
                atl_7day=_v(se.atl_7day),
                ctl_28day=_v(se.ctl_28day),
                projected_load_7day=_v(se.projected_load_7day),
                projected_acwr=_v(se.projected_acwr),
                training_monotony=_v(se.training_monotony),
                training_strain=_v(se.training_strain),
                **common_kwargs,
            )
        flags = ", ".join(se.ccrs_alert_flags) if se.ccrs_alert_flags else "None"
        return AIB_USER_TEMPLATE_CCRS.format(
            ccrs=_v(se.ccrs),
            ccrs_recommendation=_v(se.ccrs_recommendation),
            ccrs_confidence=_v(se.ccrs_confidence),
            ccrs_alert_flags=flags,
            data_freshness=_v(se.data_freshness),
            **common_kwargs,
        )
    else:
        # No snapshot — minimal AIB from checkin data only
        return f"""Generate an Athlete Intelligence Brief for:

**Athlete**: {context.name} ({context.sport}, {context.position or 'N/A'})
**Age Band**: {context.age_band or 'N/A'} | **Gender**: {context.gender or 'N/A'}
**Date**: {context.today_date} | **Time**: {context.current_time}

**Readiness**: {context.readiness_score or 'No checkin'}
{readiness_detail or 'No checkin data'}

**Note**: Full snapshot data not yet available. Generate brief from available data only.
Mark unavailable sections as "Data pending"."""


def _compute_snapshot_hash(context: PlayerContext) -> str:
    """
    Compute a hash of the snapshot data to detect changes.
    AIB regenerates only when this hash changes.
    """
    se = context.snapshot_enrichment
    if not se:
        return "no-snapshot"

    # Hash key snapshot fields that would change the coaching narrative.
    # With ACWR decommissioned, CCRS recommendation is the primary load
    # driver. Including both makes the hash bump under either mode so
    # rolling the flag forces a fresh AIB on next request.
    key_fields = (
        f"{se.acwr}|{se.ccrs}|{se.ccrs_recommendation}|"
        f"{se.readiness_rag}|{se.injury_risk_flag}|"
        f"{se.wellness_trend}|{se.phv_stage}|{se.streak_days}|"
        f"{se.checkin_consistency_7d}|{se.plan_compliance_7d}|"
        f"{se.athlete_mode}|{se.dual_load_zone}"
    )
    return hashlib.md5(key_fields.encode()).hexdigest()[:16]


async def generate_aib(context: PlayerContext) -> Optional[str]:
    """
    Generate an Athlete Intelligence Brief using Claude Haiku.
    Cost: ~$0.003 per generation.

    Returns the AIB text summary, or None on failure.
    """
    from langchain_anthropic import ChatAnthropic
    from app.config import get_settings

    try:
        settings = get_settings()
        llm = ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            temperature=0.3,
            max_tokens=600,
            anthropic_api_key=settings.anthropic_api_key,
        )

        prompt = _format_aib_prompt(context)
        response = await llm.ainvoke([
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": prompt},
        ])

        aib_text = response.content
        if isinstance(aib_text, list):
            # LangChain sometimes returns list of content blocks
            aib_text = "".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in aib_text
            )
        logger.info(f"AIB generated for {context.user_id} ({len(aib_text)} chars)")
        return aib_text

    except Exception as e:
        import traceback
        logger.error(f"AIB generation failed for {context.user_id}: {e}\n{traceback.format_exc()}")
        return None


async def save_aib(
    user_id: str,
    summary_text: str,
    snapshot_hash: str,
    context: PlayerContext,
) -> bool:
    """
    Save generated AIB to athlete_intelligence_briefs table.
    Marks previous briefs as non-current.
    """
    pool = get_pool()
    if not pool:
        logger.error("DB pool not available — cannot save AIB")
        return False

    try:
        async with pool.connection() as conn:
            # Mark all previous briefs as non-current
            await conn.execute(
                """
                UPDATE athlete_intelligence_briefs
                SET is_current = false
                WHERE athlete_id = %s AND is_current = true
                """,
                (user_id,),
            )

            # Insert new brief
            await conn.execute(
                """
                INSERT INTO athlete_intelligence_briefs (
                    athlete_id, summary_text, snapshot_hash,
                    sport, position, age_band,
                    readiness_score, acwr, injury_risk_flag,
                    model_used, cost_usd, is_current, generated_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    'claude-haiku-4-5-20251001', 0.003, true, NOW()
                )
                """,
                (
                    user_id,
                    summary_text,
                    snapshot_hash,
                    context.sport,
                    context.position,
                    context.age_band,
                    context.readiness_score,
                    context.snapshot_enrichment.acwr if context.snapshot_enrichment else None,
                    context.snapshot_enrichment.injury_risk_flag if context.snapshot_enrichment else None,
                ),
            )

        logger.info(f"AIB saved for {user_id} (hash={snapshot_hash})")
        return True

    except Exception as e:
        logger.error(f"Failed to save AIB for {user_id}: {e}")
        return False


async def ensure_fresh_aib(context: PlayerContext) -> Optional[str]:
    """
    Ensure a fresh AIB exists for the athlete.

    Logic:
      1. Check if current AIB exists and snapshot hash matches → return cached
      2. If stale or missing → generate new AIB → save → return

    This is the lazy fallback trigger (+400ms).
    Called from context_assembly_node when aib_summary is None or stale.
    """
    pool = get_pool()
    if not pool:
        return None

    user_id = context.user_id
    current_hash = _compute_snapshot_hash(context)

    try:
        # Check existing AIB
        async with pool.connection() as conn:
            result = await conn.execute(
                """
                SELECT summary_text, snapshot_hash, generated_at
                FROM athlete_intelligence_briefs
                WHERE athlete_id = %s AND is_current = true
                ORDER BY generated_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            row = await result.fetchone()

        if row:
            existing_text, existing_hash, generated_at = row
            # Fresh if hash matches (snapshot hasn't changed)
            if existing_hash == current_hash:
                logger.debug(f"AIB cache hit for {user_id}")
                return existing_text

            logger.info(
                f"AIB stale for {user_id} "
                f"(hash {existing_hash} → {current_hash})"
            )

        # Generate new AIB
        aib_text = await generate_aib(context)
        if aib_text:
            await save_aib(user_id, aib_text, current_hash, context)
            return aib_text

        # Fall back to stale AIB if generation fails
        if row:
            logger.warning(f"AIB generation failed, using stale brief for {user_id}")
            return row[0]

        return None

    except Exception as e:
        logger.error(f"ensure_fresh_aib failed for {user_id}: {e}")
        return None
