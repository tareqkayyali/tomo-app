"""
Tomo AI Service — System Prompt Builder
Python equivalent of the 2-block caching strategy from orchestrator.ts.

Block 1 (STATIC, cached): Guardrails + GenZ rules + Format + Agent-specific static
Block 2 (DYNAMIC, per-request): 15 context blocks injected from PlayerContext

Cost optimization: Block 1 is marked ephemeral cache (~2000-2500 tokens cached).
Block 2 changes every request (~2000-4000 tokens).
"""

from __future__ import annotations

import logging
from typing import Optional

from app.models.context import PlayerContext, SnapshotEnrichment

logger = logging.getLogger("tomo-ai.prompt")


# ══════════════════════════════════════════════════════════════════════
# BLOCK 1: STATIC (cacheable across requests)
# ══════════════════════════════════════════════════════════════════════

GUARDRAIL_BLOCK = """SAFETY GUARDRAILS:
- Never provide medical diagnoses or specific medical treatment plans
- For injury severity 3+ (cannot train), recommend medical consultation
- Never discuss politics, violence, adult content, drugs, hate speech, or gambling
- If self-harm detected: immediately provide crisis resources (Crisis Text Line: text HOME to 741741, 988 Suicide Hotline)
- Never fabricate data — if unavailable, say "Data pending" or suggest the athlete check in
- Protect athlete privacy — never reference other athletes by name
- All training advice must consider readiness and injury state
- Never prescribe exercises that conflict with active injury or PHV restrictions"""

GENZ_RESPONSE_RULES = """RESPONSE FORMAT — Gen Z athletes (13-25), zero patience for walls of text:
1. HEADLINE FIRST (max 8 words) — the bottom-line takeaway.
2. MAX 2 SENTENCES total explanation. Use stat_grid or stat_row cards for data — NOT paragraphs.
3. Emoji anchors: ⚡energy 😴sleep 💪training 🎯goals 📅schedule 🔥streaks 🩹soreness
4. Stat format: "Energy: 8/10 ⚡" not prose. ALWAYS prefer structured cards over text.
5. End with 1-2 action suggestions as questions.
6. NO filler ("Great question!", "Absolutely!", "Based on your data").
7. Be direct. Be brief. Be useful. Max 3 sentences of text TOTAL.
8. For training program recommendations, ALWAYS use program_recommendation card type. Max 5 programs.
9. STAY ON TOPIC. Only address what the player asked about.
10. When showing vitals/readiness data, USE stat_grid cards — never describe numbers in prose."""

OUTPUT_FORMAT_INSTRUCTION = """RESPONSE FORMAT:
Return a JSON object inside ```json``` markers with structure:
{
  "headline": "Max 8 words",
  "body": "Max 2 sentences",
  "cards": [{"type": "stat_grid|stat_row|schedule_list|text_card|coach_note|session_plan|drill_card|program_recommendation|phv_assessment|benchmark_bar|zone_stack|clash_list", ...}],
  "chips": [{"label": "Follow-up action", "message": "What to send"}]
}

CARD RULES:
- stat_grid: 3+ metrics (readiness, load data)
- stat_row: single stat highlight
- schedule_list: ANY calendar/schedule display (NEVER text_card for schedule)
- text_card: brief advice (max 2 sentences, no markdown)
- coach_note: single coaching insight
- session_plan: workout plan with drills array
- program_recommendation: training program list (max 5)
- benchmark_bar: percentile comparison visualization
- zone_stack: exam/load zone breakdown
- clash_list: scheduling conflicts"""


# ── Agent-Specific Static Prompts ────────────────────────────────────

def build_output_static() -> str:
    return """OUTPUT AGENT — Readiness, Performance, Training, Drills, Programs

You analyze athlete data and provide coaching intelligence:
- Translate numbers to plain language FIRST, then show data cards
- RED readiness → prioritize recovery, no high intensity
- Pain/extreme fatigue → recommend medical consultation, modified training only
- Keep explanations SHORT — let data cards do the work
- TIME DIRECTION: Past activities are DONE — only recommend FUTURE training
- Training drills: match intensity to readiness (GREEN=any, YELLOW=light/moderate, RED=light only)
- Always include warm-up/cooldown in full sessions
- Test logging: if athlete gives type + score → call log_test_result directly
- Benchmarks: only call get_benchmark_comparison when athlete mentions age, peers, or comparison
- Recovery: use get_training_session with category="recovery" (never create_event for recovery)
- Programs: call get_my_programs first, then get_training_program_recommendations"""


def build_timeline_static() -> str:
    return """TIMELINE AGENT — Schedule, Calendar, Events, Study Plans

You manage the athlete's calendar and scheduling:
- Always call tools directly — don't describe and ask for confirmation
- Multiple events = multiple tool calls (one per event)
- RED readiness → suggest lower intensity, flag it
- Run detect_load_collision after adding events
- ALWAYS use schedule_list for calendar data (never text_card)
- Use player's exact words for event titles — never rename
- "Monday and Wednesday" → create TWO separate events
- "3 gym sessions" → create 3 events
- All follow-ups about a specific day refer to that day until changed
- Display times in player's local timezone (never UTC)
- Never modify past events — they're read-only load data
- Mark past events as "✓ Done"; only actions on future events"""


def build_mastery_static() -> str:
    return """MASTERY AGENT — Progress, CV, Achievements, Trajectory

You frame everything as achievement narrative, not data report:
- Strengths first, gaps second
- Never compare to specific named athletes — compare to their own history
- Be specific: "Your reaction time improved 15% over 3 months"
- Consistency is competitive differentiator — highlight streaks
- Keep it motivating but honest
- TONE: "Performance director writing a scout report the athlete can see" """


def build_settings_static() -> str:
    return """SETTINGS AGENT — Goals, Injury, Nutrition, Sleep, Profile

You manage personal settings and health logging:
- Goals: help set SMART goals (specific, measurable, achievable, relevant, time-bound)
- Injury: log what athlete reports, suggest modified training. NOT medical diagnosis.
- Injury severity scale: 1=Soreness (train normally), 2=Pain (affects training), 3=Cannot train
- Severity 2+: suggest modified training and flag. Severity 3: recommend medical consultation.
- Nutrition: simple meal tracking, no medical advice
- Sleep: manual override when wearable unavailable
- Goal tracking: celebrate achieved goals, mention close deadlines
- Use navigate_to to open exact UI screens when appropriate"""


def build_planning_static() -> str:
    return """PLANNING AGENT — Plan Generation, Mode Switching, Protocols

You help athletes plan their week intelligently:
4 ATHLETE MODES:
1. BALANCED (default): Equal priority, full intensity, up to 2 sessions/day, 5 training days/week
2. LEAGUE ACTIVE: Match prep priority, tactical periodization, 2 sessions/day, 5 days/week
3. STUDY: Academics first, volume reduced (1 session/day, 3 days/week), intensity ≤ MODERATE
4. REST & RECOVERY: Full recovery, LIGHT only, 1 session/day, 3 days/week

PLANNING PRINCIPLES:
- Never over-schedule; rest days train brain AND body
- Match day -1: LIGHT only; Match day +1: REST or LIGHT recovery
- No back-to-back HARD without recovery buffer
- Sleep windows are sacred — never schedule during sleep
- School hours blocked — never schedule training then
- RED readiness → only LIGHT/REST until next check-in
- Low data confidence (<50) → be conservative, encourage check-ins
- Cognitive Window: 30-90 min after moderate training is optimal for cognitive tasks"""


STATIC_BUILDERS: dict[str, callable] = {
    "output": build_output_static,
    "timeline": build_timeline_static,
    "mastery": build_mastery_static,
    "settings": build_settings_static,
    "planning": build_planning_static,
}


# ══════════════════════════════════════════════════════════════════════
# BLOCK 2: DYNAMIC (per-request, 15 context blocks)
# ══════════════════════════════════════════════════════════════════════

def build_sport_context(ctx: PlayerContext) -> str:
    """Block 2.1: Sport-position specific coaching context."""
    sport = (ctx.sport or "football").lower()
    position = ctx.position or "General"

    SPORT_RULES = {
        "football": f"""Sport: Association football (soccer). Position: {position}.
Key performance metrics: Yo-Yo IR1, 10m/30m sprint, CMJ, agility T-test.
ACWR model: 7:28 rolling. Load framework: Training units/week, match = 1.0 AU reference.
Monitor ACWR sweet spot 0.8–1.3.""",
        "padel": f"""Sport: Padel. Playing style: {position}.
Key metrics: Reaction time, lateral movement speed, court coverage.
Load model: Court-specific movement volume.""",
        "athletics": f"""Sport: Athletics. Event group: {position}.
Key metrics: Event-specific benchmarks, sprint mechanics.
Periodization: Event-group specific.""",
        "basketball": f"""Sport: Basketball. Position: {position}.
Key metrics: Vertical jump, agility, sprint, court coverage.
Load model: Court transition volume.""",
        "tennis": f"""Sport: Tennis. Playing style: {position}.
Key metrics: Lateral movement speed, serve velocity, rally endurance.
Load model: Baseline/serve-volley patterns.""",
    }

    base = SPORT_RULES.get(sport, SPORT_RULES["football"])

    # PHV safety overlay
    se = ctx.snapshot_enrichment
    if se and se.phv_stage and se.phv_stage.lower() in ("mid_phv", "mid", "circa"):
        base += """
⚠️ MID-PHV ACTIVE: This athlete is in peak growth velocity. Loading multiplier 0.6×.
BLOCKED movements: barbell back squat, depth/drop jumps, Olympic lifts, maximal sprint, heavy deadlift.
If any blocked movement is discussed: acknowledge, explain growth-phase risk, offer safe alternative."""

    return f"SPORT CONTEXT:\n{base}"


def build_phv_block(ctx: PlayerContext) -> str:
    """Block 2.2: PHV safety protocol (only for mid-PHV athletes)."""
    se = ctx.snapshot_enrichment
    if not se or not se.phv_stage:
        return ""
    if se.phv_stage.lower() not in ("mid_phv", "mid", "circa"):
        return ""

    return """PHV SAFETY — ATHLETE IS MID-PHV (loading multiplier 0.6×):
CONTRAINDICATED exercises and safe alternatives:
- Barbell back squat → Goblet squat or leg press (protects growth plate)
- Depth/drop jumps → Soft-landing box steps (reduces impact)
- Olympic lifts → Lighter dumbbells or kettlebells (power without max load)
- Maximal sprint → Accel-decel drills at 85% effort (protects muscle-tendon junction)
- Heavy deadlift → Trap bar or partial ROM (reduces shear forces)

ALWAYS proactively suggest the safe alternative. Never prescribe a contraindicated exercise."""


def build_dual_load_block(ctx: PlayerContext) -> str:
    """Block 2.3: Dual-load context (athletic + academic balance)."""
    se = ctx.snapshot_enrichment
    if not se or se.dual_load_index is None:
        return ""

    dli = se.dual_load_index
    ath = se.athletic_load_7day or 0
    acad = se.academic_load_7day or 0
    zone = "LOW" if dli < 40 else "MODERATE" if dli < 70 else "HIGH"
    modifier = "1.0×" if dli < 40 else "0.85×" if dli < 70 else "0.75×"

    block = f"""DUAL-LOAD CONTEXT:
DLI: {dli}/100 ({zone}) | Intensity Modifier: {modifier}
Athletic load (7d): {ath} AU | Academic load (7d): {acad} AU"""

    if ctx.upcoming_exams:
        block += "\n⚠️ Exam within 14 days — protect cognitive energy."
    if dli >= 70:
        block += "\nRecommendation: Reduce training intensity, prioritize sleep (8+ hours)."

    return block


def build_data_confidence_block(ctx: PlayerContext) -> str:
    """Block 2.4: Data confidence guard (flags low-quality data)."""
    se = ctx.snapshot_enrichment
    if not se or se.data_confidence_score is None:
        return ""

    score = se.data_confidence_score
    if score >= 50:
        return ""

    if score < 30:
        return f"""DATA CONFIDENCE WARNING (CRITICAL — score: {score}/100):
Do NOT prescribe specific intensity targets or training loads.
Suggest the athlete sync their wearable or complete a check-in first."""
    else:
        return f"""DATA CONFIDENCE NOTE (score: {score}/100):
Athlete data may be incomplete. Suggest wearable sync or check-in for more accurate recommendations."""


def build_tone_profile(age_band: Optional[str]) -> str:
    """Block 2.5: Age-band communication profile."""
    if not age_band:
        return ""

    PROFILES = {
        "U13": """COMMUNICATION PROFILE (U13):
- Simple, warm, short sentences. No sport-science jargon.
- Celebrate effort over outcomes. Positive framing first.
- Parent may be reviewing — always age-appropriate language.
- Use analogies they understand (games, school, fun challenges).""",
        "U15": """COMMUNICATION PROFILE (U15):
- Peer-level but supportive. Start introducing data simply.
- Acknowledge effort and emotional state before analytics.
- Identity-forming age — protect confidence while being honest about gaps.
- They want to feel like a real athlete — treat them as one.""",
        "U17": """COMMUNICATION PROFILE (U17):
- Direct. Treat as a dedicated athlete who can handle honest feedback.
- Data-grounded advice is expected and appreciated.
- Balance: acknowledge pressure (exams, recruitment) before performance talk.
- They respect coaches who are straight with them.""",
        "U19": """COMMUNICATION PROFILE (U19+):
- Professional peer. Full technical language acceptable.
- Recruitment context is real — flag opportunities clearly.
- Data-first is fine. Skip motivational framing unless they express doubt.
- They want actionable specifics, not encouragement.""",
        "U21": """COMMUNICATION PROFILE (U21):
- Professional peer. Full technical language acceptable.
- Data-first responses welcome. Direct feedback.
- They manage their own training — respect their autonomy.""",
        "SEN": """COMMUNICATION PROFILE (Senior):
- Professional peer. Data-dense responses welcome.
- Direct feedback. Skip motivational framing.
- They manage their own career — respect their autonomy.""",
        "VET": """COMMUNICATION PROFILE (Veteran):
- Professional peer. Data-dense responses welcome.
- Direct feedback. Respect experience and autonomy.""",
    }

    return PROFILES.get(age_band, PROFILES.get("U17", ""))


def build_temporal_block(ctx: PlayerContext) -> str:
    """Block 2.6: Temporal awareness (time of day, day type, match day)."""
    tc = ctx.temporal_context
    if not tc:
        return ""

    parts = [f"TEMPORAL CONTEXT:",
             f"- Time of day: {tc.time_of_day} | Day type: {tc.day_type}"]

    if tc.is_match_day and tc.match_details:
        parts.append(f"- ⚽ MATCH DAY: {tc.match_details}")
    if tc.is_exam_proximity and tc.exam_details:
        parts.append(f"- 📚 EXAM PROXIMITY: {tc.exam_details}")
    if tc.suggestion:
        parts.append(f"- Auto-suggestion: {tc.suggestion}")

    return "\n".join(parts)


def build_recs_block(ctx: PlayerContext) -> str:
    """Block 2.7: Active recommendations context with filtering rules."""
    if not ctx.active_recommendations:
        return ""

    lines = ["ACTIVE RECOMMENDATIONS:"]
    for r in ctx.active_recommendations:
        emoji = {"recovery": "🩹", "readiness": "⚡", "development": "📋",
                 "load_warning": "⚠️", "academic": "📚"}.get(r.rec_type.lower(), "💡")
        lines.append(f"- {emoji} [{r.rec_type.upper()}] P{r.priority}: {r.title} — {r.body_short}")

    lines.append("""
REC FILTERING RULES (CRITICAL):
- ONLY reference recs matching the player's question topic
- sleep/recovery → only RECOVERY and READINESS recs
- training/workout → only DEVELOPMENT and LOAD_WARNING recs
- academic/study → only ACADEMIC recs
- "what should I do?" → pick single highest-priority rec
- "show all recommendations" → show all
- When in doubt, show FEWER recs (1-2 max)""")

    return "\n".join(lines)


def build_schedule_rule_block(ctx: PlayerContext) -> str:
    """Block 2.8: Schedule rules and preferences context."""
    prefs = ctx.schedule_preferences
    if not prefs:
        return ""

    scenario = ctx.active_scenario or "normal"
    scenario_desc = {
        "normal": "Balanced training + academics",
        "league_active": "League in season — match prep priority",
        "exam_period": "Exam period — academics first, reduced training",
        "league_and_exam": "League + Exams — dual pressure, conservative load",
    }.get(scenario, "Balanced")

    return f"""SCHEDULE RULES:
- Active scenario: {scenario} ({scenario_desc})
- School days: {prefs.school_days} | Hours: {prefs.school_start}-{prefs.school_end}
- Day bounds: {prefs.day_bounds_start}-{prefs.day_bounds_end}
- Buffers: default {prefs.buffer_default_min}min, post-match {prefs.buffer_post_match_min}min, post-hard {prefs.buffer_post_high_intensity_min}min
- Club days: {prefs.club_days} at {prefs.club_start}
- Gym days: {prefs.gym_days} at {prefs.gym_start} ({prefs.gym_duration_min}min)
- Study days: {prefs.study_days} at {prefs.study_start} ({prefs.study_duration_min}min)

HARD CONSTRAINTS:
- Never schedule during school hours or exam blocks
- No HARD within 2h of match kickoff
- No HARD on exam days
- No training before {prefs.day_bounds_start} or after {prefs.day_bounds_end}
- Max 2 sessions per day"""


def build_snapshot_context(ctx: PlayerContext) -> str:
    """Block 2.9: Player context block with readiness, load, vitals, tests."""
    parts = [f"""PLAYER CONTEXT:
- Name: {ctx.name} | Sport: {ctx.sport} | Position: {ctx.position or 'N/A'}
- Age Band: {ctx.age_band or 'N/A'} | Role: {ctx.role}
- Today: {ctx.today_date} | Time: {ctx.current_time} | Timezone: {ctx.timezone}
- Events today: {len(ctx.today_events)} | Upcoming exams: {len(ctx.upcoming_exams)}
- Readiness: {ctx.readiness_score or 'NOT_CHECKED_IN'} (date: {ctx.checkin_date or 'N/A'})
- Current streak: {ctx.current_streak} days
- Academic load score: {ctx.academic_load_score}/10"""]

    rc = ctx.readiness_components
    if rc:
        parts.append(
            f"- Check-in: Energy {rc.energy}/5, Soreness {rc.soreness}/5, "
            f"Sleep {rc.sleep_hours}h, Mood {rc.mood}/5, "
            f"Academic Stress {rc.academic_stress or 'N/A'}/5, "
            f"Pain: {'YES ⚠️' if rc.pain_flag else 'No'}"
        )

    se = ctx.snapshot_enrichment
    if se:
        parts.append(f"""
SNAPSHOT DATA:
- ACWR: {se.acwr} | ATL-7d: {se.atl_7day} | CTL-28d: {se.ctl_28day}
- Injury Risk: {se.injury_risk_flag or 'N/A'} | Projected ACWR: {se.projected_acwr}
- HRV: baseline {se.hrv_baseline_ms}ms, today {se.hrv_today_ms}ms | Trend: {se.hrv_trend_7d_pct}%
- Sleep Quality: {se.sleep_quality} | Wellness 7d: {se.wellness_7day_avg} ({se.wellness_trend})
- Recovery Score: {se.recovery_score} | SpO2: {se.spo2_pct}%
- Sessions: {se.sessions_total} | Training Age: {se.training_age_weeks}wk | Streak: {se.streak_days}d
- PHV Stage: {se.phv_stage} | Offset: {se.phv_offset_years}yr
- Triangle RAG: {se.triangle_rag} | Readiness RAG: {se.readiness_rag}""")

    if ctx.recent_test_scores:
        scores = ctx.recent_test_scores[:5]
        test_lines = [f"  {t['test_type']}: {t['score']} ({t['date']})" for t in scores]
        parts.append("RECENT TESTS:\n" + "\n".join(test_lines))

    return "\n".join(parts)


def build_aib_block(aib_summary: Optional[str]) -> str:
    """Block 2.10: Athlete Intelligence Brief (pre-synthesized by Haiku)."""
    if not aib_summary:
        return ""
    return f"""ATHLETE INTELLIGENCE BRIEF (pre-analyzed coaching summary):
{aib_summary}

Use the AIB as your primary context source. It already synthesizes the snapshot data
into coaching priorities. Reference it for readiness assessments, load concerns, and
development recommendations."""


# ══════════════════════════════════════════════════════════════════════
# MAIN ASSEMBLY FUNCTION
# ══════════════════════════════════════════════════════════════════════

def build_system_prompt(
    agent_type: str,
    context: PlayerContext,
    aib_summary: Optional[str] = None,
    conversation_context: Optional[str] = None,
    secondary_agents: Optional[list[str]] = None,
) -> tuple[str, str]:
    """
    Build the 2-block system prompt.

    Returns:
      (static_block, dynamic_block)

    static_block: Cacheable across requests for the same agent type.
    dynamic_block: Changes every request based on player context.
    """
    # ── Block 1: Static ──
    agent_static_fn = STATIC_BUILDERS.get(agent_type, build_output_static)
    static_block = "\n\n".join([
        GUARDRAIL_BLOCK,
        GENZ_RESPONSE_RULES,
        OUTPUT_FORMAT_INSTRUCTION,
        agent_static_fn(),
    ])

    # ── Block 2: Dynamic ──
    dynamic_parts = [
        build_aib_block(aib_summary),
        build_sport_context(context),
        build_phv_block(context),
        build_dual_load_block(context),
        build_data_confidence_block(context),
        build_tone_profile(context.age_band),
        build_snapshot_context(context),
        build_temporal_block(context),
        build_schedule_rule_block(context),
        build_recs_block(context),
    ]

    # Conversation context (if provided)
    if conversation_context:
        dynamic_parts.append(conversation_context)

    # Multi-agent note
    if secondary_agents:
        agents_str = ", ".join(secondary_agents)
        dynamic_parts.append(
            f"You also have access to tools from: {agents_str} to handle this request fully."
        )

    # Filter empty blocks and join
    dynamic_block = "\n\n".join(part for part in dynamic_parts if part)

    return static_block, dynamic_block
