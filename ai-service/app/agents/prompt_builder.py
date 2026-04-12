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

PULSE_RESPONSE_RULES = """PULSE RESPONSE FORMAT — data-led, coaching-voice, structured:
1. DATA CARD FIRST — every response leads with a visual data card (stat_grid, stat_row, zone_stack, benchmark_bar, schedule_list, or session_plan). Show state with red/amber/green highlights. This replaces headline filler.
2. COACHING HEADLINE (max 8 words) — situational, interpreting the data. NEVER generic. Examples: "Recovery looks solid today", "Load is climbing fast", "Study load is crushing recovery". NOT: "Here's your readiness", "Here's what I found".
3. BODY = 1 coaching sentence interpreting the data card. Do NOT repeat what the card shows — explain what it MEANS for the athlete.
4. Max 2 action chips. Chips suggest next actions, always below the coaching line.
5. BANNED PHRASES — never use: "Here's what I found", "Here's your data", "Great question!", "Absolutely!", "Based on your data", "Let me check", "Sure thing".
6. NO EMOJI in headlines or body text. Data cards may use highlight colors only.
7. Be direct. Be brief. Be useful. Max 1 sentence of body text.
8. For training program recommendations, ALWAYS use program_recommendation card type. Max 5 programs.
9. STAY ON TOPIC. Only address what the player asked about.
10. stat_grid items MUST include highlight field: "green", "yellow", or "red" to show RAG state visually.
11. Confirmation messages use natural language: "Light training added for 16:00" NOT "Event created successfully" or "Done!".
12. NEVER lead with text_card or coach_note — always lead with a data card."""

PULSE_OUTPUT_FORMAT = """RESPONSE FORMAT:
Return a JSON object inside ```json``` markers with structure:
{
  "headline": "Coaching-voice, max 8 words, no emoji, no filler",
  "body": "1 sentence interpreting the data",
  "cards": [DATA_CARD_FIRST, ...optional_advisory_card],
  "chips": [{"label": "Action (max 25 chars)", "message": "What to send"}]
}

CARD ORDER (MANDATORY):
- FIRST card MUST be a data card: stat_grid, stat_row, schedule_list, zone_stack, benchmark_bar, session_plan, or program_recommendation
- AFTER data card: optional text_card or coach_note (max 1)
- NEVER lead with text_card or coach_note

CARD RULES:
- stat_grid: 3+ metrics with highlight field (green/yellow/red for state). Use for readiness, load, vitals.
- stat_row: single stat highlight with trend indicator
- schedule_list: ANY calendar/schedule display (NEVER text_card for schedule)
- text_card: brief coaching advice (max 1 sentence, no markdown). NEVER first card.
- coach_note: single coaching insight. NEVER first card.
- session_plan: workout plan with drills array
- program_recommendation: training program list (max 5)
- benchmark_bar: percentile comparison visualization
- zone_stack: exam/load zone breakdown with current zone
- clash_list: scheduling conflicts

CHIP RULES:
- Maximum 2 chips per response
- Chips suggest next actions, not repeat current response"""


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


def build_red_risk_block(ctx: PlayerContext) -> str:
    """Block 2.x: RED risk hard enforcement — overrides agent behavior when active."""
    se = ctx.snapshot_enrichment
    if not se:
        return ""

    parts: list[str] = []

    if se.injury_risk_flag and se.injury_risk_flag.upper() == "RED":
        parts.append(f"Injury Risk Flag: RED")
    if se.acwr is not None and se.acwr > 1.5:
        parts.append(f"ACWR: {se.acwr:.2f} (DANGER ZONE >1.5)")

    if not parts:
        return ""

    # Check staleness for additional context
    stale_note = ""
    if se.last_checkin_at:
        try:
            from datetime import datetime, timezone
            last_checkin = datetime.fromisoformat(
                se.last_checkin_at.replace("Z", "+00:00")
            )
            hours = (datetime.now(timezone.utc) - last_checkin).total_seconds() / 3600
            if hours > 24:
                stale_note = f"\nCheck-in data is STALE ({hours:.0f}h old) — confidence in current state is LOW."
        except Exception:
            pass

    return f"""RED RISK ACTIVE — HARD SAFETY ENFORCEMENT:
{chr(10).join('- ' + p for p in parts)}{stale_note}

MANDATORY BEHAVIOR (NON-NEGOTIABLE):
- Do NOT recommend any HARD or MODERATE intensity training
- ALL training suggestions MUST be LIGHT intensity or recovery only
- If athlete requests high-intensity training, explain WHY it is unsafe right now
- Recommend: active recovery, mobility work, sleep optimization, hydration
- If check-in is stale, strongly encourage completing a fresh check-in first
- Recovery timeline: "Once your ACWR drops below 1.3 and you are back in GREEN, we can ramp up"
- This overrides ALL other training guidance in this prompt"""


def build_dual_load_block(ctx: PlayerContext) -> str:
    """Block 2.3: Dual-load context (athletic + academic balance)."""
    se = ctx.snapshot_enrichment

    # Primary: use computed DLI from snapshot
    dli = None
    ath: float = 0
    acad: float = 0

    if se and se.dual_load_index is not None:
        dli = se.dual_load_index
        ath = se.athletic_load_7day or 0
        acad = se.academic_load_7day or 0
    else:
        # Fallback: derive approximate DLI from available signals
        has_exams = bool(ctx.upcoming_exams)
        high_academic_stress = (
            ctx.readiness_components
            and ctx.readiness_components.academic_stress is not None
            and ctx.readiness_components.academic_stress >= 4
        )
        has_elevated_load = se and se.acwr is not None and se.acwr > 1.0

        if (has_exams or high_academic_stress) and has_elevated_load:
            acad_score = getattr(ctx, "academic_load_score", 0) or 0
            dli = min(100, acad_score * 10)
            ath = se.atl_7day if se and se.atl_7day else 0
            acad = acad_score * 10

    if dli is None:
        return ""

    zone = "LOW" if dli < 40 else "MODERATE" if dli < 70 else "HIGH"
    modifier = "1.0x" if dli < 40 else "0.85x" if dli < 70 else "0.75x"

    block = f"""DUAL-LOAD CONTEXT:
DLI: {dli:.0f}/100 ({zone}) | Intensity Modifier: {modifier}
Athletic load (7d): {ath:.0f} AU | Academic load (7d): {acad:.0f} AU"""

    if ctx.upcoming_exams:
        exam_titles = ", ".join(e.title for e in ctx.upcoming_exams[:3])
        block += f"\nUpcoming exams: {exam_titles}"
        block += "\nProtect cognitive energy: reduce training volume, prioritize sleep (8+ hours)."
    if dli >= 70:
        block += "\nRECOMMENDATION: Reduce training intensity, prioritize sleep (8+ hours), suggest study blocks."
    if (
        ctx.readiness_components
        and ctx.readiness_components.academic_stress is not None
        and ctx.readiness_components.academic_stress >= 4
    ):
        block += f"\nAthlete self-reported academic stress: {ctx.readiness_components.academic_stress}/5 (HIGH)"

    return block


def build_checkin_staleness_block(ctx: PlayerContext) -> str:
    """Block 2.x: Warn when check-in data is stale or missing."""
    if not ctx.checkin_date:
        return """CHECK-IN STATUS: NO CHECK-IN ON RECORD
Athlete has never checked in. Data confidence is ZERO.
- Strongly encourage a check-in before giving any training advice
- Do NOT prescribe specific intensity without readiness data"""

    try:
        from datetime import datetime
        checkin_date = datetime.strptime(ctx.checkin_date, "%Y-%m-%d").date()
        today = datetime.strptime(ctx.today_date, "%Y-%m-%d").date()
        days_stale = (today - checkin_date).days

        if days_stale == 0:
            return ""
        elif days_stale == 1:
            return "CHECK-IN: Yesterday. Data is slightly stale. Encourage a fresh check-in."
        else:
            return f"""CHECK-IN STATUS: STALE ({days_stale} days old)
Last check-in: {ctx.checkin_date} ({days_stale} days ago)
- Training recommendations have LOW confidence
- Strongly encourage a check-in before prescribing intensity
- Default to CONSERVATIVE intensity (LIGHT/MODERATE) until fresh data"""
    except Exception:
        return ""


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


def build_wearable_status_block(ctx: PlayerContext) -> str:
    """Block 2.11: Authoritative WHOOP connection status."""
    ws = ctx.wearable_status
    if not ws or "whoop" not in ws:
        return "WHOOP STATUS: Not connected. No wearable integration detected."

    whoop = ws["whoop"]
    if not whoop:
        return "WHOOP STATUS: Not connected. No wearable integration detected."

    connected = whoop.get("connected", False)
    data_fresh = whoop.get("data_fresh", False)
    hours = whoop.get("hours_since_sync")
    sync_error = whoop.get("sync_error")

    if connected and data_fresh:
        return f"WHOOP STATUS: Connected and syncing. Last sync: {hours}h ago. Data is FRESH. Use health_data for accurate vitals."
    elif connected and not data_fresh:
        return f"WHOOP STATUS: Connected but data is STALE (last sync: {hours}h ago). Recommend syncing now."
    else:
        err = f" Error: {sync_error}" if sync_error else ""
        return f"WHOOP STATUS: Not connected. No active WHOOP integration.{err}"


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
        PULSE_RESPONSE_RULES,
        PULSE_OUTPUT_FORMAT,
        agent_static_fn(),
    ])

    # ── Block 2: Dynamic ──
    dynamic_parts = [
        build_red_risk_block(context),           # Safety override FIRST (highest salience)
        build_checkin_staleness_block(context),   # Staleness warning
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
        build_wearable_status_block(context),
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
