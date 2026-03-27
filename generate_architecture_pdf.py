#!/usr/bin/env python3
"""Generate Tomo Architecture Technical Reference PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from datetime import date

# Colors
TOMO_ORANGE = HexColor("#FF6B35")
TOMO_TEAL = HexColor("#00D9FF")
DARK_BG = HexColor("#0D0C0E")
ELEVATED = HexColor("#1B191E")
TEXT_PRIMARY = HexColor("#FFFFFF")
TEXT_SECONDARY = HexColor("#A0A0A0")
SECTION_BG = HexColor("#1A1A2E")
TABLE_HEADER = HexColor("#FF6B35")
TABLE_ROW_EVEN = HexColor("#F8F5F0")
TABLE_ROW_ODD = HexColor("#FFFFFF")
BORDER_COLOR = HexColor("#E0E0E0")

# Setup
output_path = "/Users/tareqelkayyali/Desktop/Tomo/Tomo_Technical_Architecture.pdf"

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    rightMargin=50,
    leftMargin=50,
    topMargin=60,
    bottomMargin=50,
)

styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle(
    name="CoverTitle",
    fontName="Helvetica-Bold",
    fontSize=32,
    textColor=HexColor("#222222"),
    alignment=TA_CENTER,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="CoverSubtitle",
    fontName="Helvetica",
    fontSize=14,
    textColor=HexColor("#FF6B35"),
    alignment=TA_CENTER,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="CoverDate",
    fontName="Helvetica",
    fontSize=11,
    textColor=HexColor("#666666"),
    alignment=TA_CENTER,
    spaceAfter=20,
))
styles.add(ParagraphStyle(
    name="SectionTitle",
    fontName="Helvetica-Bold",
    fontSize=18,
    textColor=HexColor("#FF6B35"),
    spaceBefore=20,
    spaceAfter=10,
    borderPadding=(0, 0, 4, 0),
))
styles.add(ParagraphStyle(
    name="SubSection",
    fontName="Helvetica-Bold",
    fontSize=13,
    textColor=HexColor("#222222"),
    spaceBefore=14,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="SubSubSection",
    fontName="Helvetica-Bold",
    fontSize=11,
    textColor=HexColor("#444444"),
    spaceBefore=10,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="Body",
    fontName="Helvetica",
    fontSize=9.5,
    textColor=HexColor("#333333"),
    spaceBefore=2,
    spaceAfter=4,
    leading=13,
))
styles.add(ParagraphStyle(
    name="BulletCustom",
    fontName="Helvetica",
    fontSize=9.5,
    textColor=HexColor("#333333"),
    leftIndent=18,
    spaceBefore=1,
    spaceAfter=1,
    leading=13,
    bulletIndent=6,
))
styles.add(ParagraphStyle(
    name="CodeCustom",
    fontName="Courier",
    fontSize=8,
    textColor=HexColor("#333333"),
    backColor=HexColor("#F5F5F5"),
    leftIndent=10,
    spaceBefore=4,
    spaceAfter=4,
    leading=11,
))
styles.add(ParagraphStyle(
    name="TOCEntry",
    fontName="Helvetica",
    fontSize=11,
    textColor=HexColor("#333333"),
    spaceBefore=4,
    spaceAfter=4,
    leftIndent=10,
))
styles.add(ParagraphStyle(
    name="TOCTitle",
    fontName="Helvetica-Bold",
    fontSize=18,
    textColor=HexColor("#FF6B35"),
    spaceBefore=20,
    spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="FooterNote",
    fontName="Helvetica-Oblique",
    fontSize=8,
    textColor=HexColor("#999999"),
    alignment=TA_CENTER,
))

def make_table(headers, rows, col_widths=None):
    data = [headers] + rows
    w = col_widths or [doc.width / len(headers)] * len(headers)
    t = Table(data, colWidths=w, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 0 else TABLE_ROW_ODD
        style.append(("BACKGROUND", (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style))
    return t

def hr():
    return HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceBefore=6, spaceAfter=6)

def b(text):
    return f"<b>{text}</b>"

def bullet(text):
    return Paragraph(f"<bullet>&bull;</bullet> {text}", styles["BulletCustom"])

# ─── Build Story ───
story = []

# Cover Page
story.append(Spacer(1, 120))
story.append(Paragraph("TOMO", styles["CoverTitle"]))
story.append(Paragraph("AI Coaching Platform for Young Athletes", styles["CoverSubtitle"]))
story.append(Spacer(1, 20))
story.append(Paragraph("Technical Architecture Reference", ParagraphStyle(
    "CoverSub2", fontName="Helvetica-Bold", fontSize=16, textColor=HexColor("#333333"), alignment=TA_CENTER, spaceAfter=12
)))
story.append(Spacer(1, 30))
story.append(hr())
story.append(Spacer(1, 10))
story.append(Paragraph(f"Version 2.0  |  {date.today().strftime('%B %Y')}", styles["CoverDate"]))
story.append(Paragraph("Confidential  |  CTO Reference Document", styles["CoverDate"]))
story.append(Spacer(1, 30))

cover_data = [
    ["Stack", "Expo/React Native + Next.js 16 + Supabase PostgreSQL"],
    ["AI Engine", "Claude (Anthropic) 3-Agent Orchestrator + Haiku for cost-optimized personalization"],
    ["Deployment", "Vercel (api.my-tomo.com + app.my-tomo.com)"],
    ["Database", "48 tables, 20 migrations, 28 event types, 4-layer data fabric"],
    ["API Surface", "175 authenticated endpoints across 12 domains"],
    ["Frontend", "71 screens, 120 components, 38 hooks, 11 capsule types"],
]
t = Table(cover_data, colWidths=[100, doc.width - 100])
t.setStyle(TableStyle([
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("TEXTCOLOR", (0, 0), (0, -1), TOMO_ORANGE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
    ("BACKGROUND", (0, 0), (-1, -1), HexColor("#FAFAFA")),
]))
story.append(t)
story.append(PageBreak())

# Table of Contents
story.append(Paragraph("Table of Contents", styles["TOCTitle"]))
toc_items = [
    "1. System Overview & Project Structure",
    "2. Backend Architecture (Next.js 16 + Vercel)",
    "3. API Surface (175 Endpoints)",
    "4. Chat AI System (3-Agent Orchestrator)",
    "5. Capsule Command Center (11 Types)",
    "6. Athlete Data Fabric (4 Layers)",
    "7. Database Schema (48 Tables)",
    "8. Training Program Recommendation Pipeline",
    "9. Schedule Rule Engine",
    "10. Drill Recommendation System",
    "11. Mastery & DNA System",
    "12. Mobile Frontend Architecture",
    "13. Theme & Design System",
    "14. CMS Admin Panel",
    "15. Coach Portal",
    "16. Parent Portal",
    "17. Relationship & Multi-Role System",
    "18. Integrations (Whoop, Content CMS)",
    "19. Deployment & DevOps",
    "20. Performance Optimizations",
    "21. Golden Rules & Risk Mitigations",
]
for item in toc_items:
    story.append(Paragraph(item, styles["TOCEntry"]))
story.append(PageBreak())

# ─── Section 1: System Overview ───
story.append(Paragraph("1. System Overview & Project Structure", styles["SectionTitle"]))
story.append(Paragraph("Tomo is an AI-powered coaching platform for young athletes (13-25) that combines real-time readiness monitoring, AI-driven training recommendations, and comprehensive performance tracking across multiple sports.", styles["Body"]))
story.append(Spacer(1, 8))
story.append(Paragraph("Project Structure", styles["SubSection"]))
story.append(make_table(
    ["Directory", "Purpose", "Key Stats"],
    [
        ["tomo-app/backend/", "Next.js 16 API server", "175 routes, 100 service files"],
        ["tomo-app/mobile/", "Expo/React Native app", "71 screens, 120 components"],
        ["backend/app/api/v1/", "Versioned REST API", "12 domain groups"],
        ["backend/services/agents/", "AI orchestrator + agents", "3 agents, 31+ tools"],
        ["backend/supabase/", "Migrations + seed data", "20 migrations, 48 tables"],
        ["mobile/src/hooks/", "Custom React hooks", "38 hooks"],
        ["mobile/src/types/", "TypeScript types", "11 capsule types"],
    ],
    [doc.width * 0.28, doc.width * 0.42, doc.width * 0.30]
))
story.append(PageBreak())

# ─── Section 2: Backend Architecture ───
story.append(Paragraph("2. Backend Architecture", styles["SectionTitle"]))
story.append(Paragraph("Framework & Deployment", styles["SubSection"]))
story.append(bullet("Next.js 16 with App Router, deployed to Vercel at api.my-tomo.com"))
story.append(bullet("Authentication via proxy.ts: Bearer token (mobile) with cookie fallback (web)"))
story.append(bullet("Service role bypass for webhooks and Supabase triggers"))
story.append(bullet("CORS: app.my-tomo.com, api.my-tomo.com, localhost (3000, 8081, 19006)"))

story.append(Paragraph("Auth Flow (proxy.ts)", styles["SubSection"]))
story.append(Paragraph("1. Check Authorization header for Bearer token (mobile apps)", styles["Body"]))
story.append(Paragraph("2. Fallback to cookies (web sessions)", styles["Body"]))
story.append(Paragraph("3. Service role bypass for CRON_SECRET and Supabase webhooks", styles["Body"]))
story.append(Paragraph("4. Sets x-user-id and x-user-email headers for downstream routes", styles["Body"]))
story.append(Paragraph("5. Public routes exempted: /api/health, /api/v1/content/*, /api/v1/config/*", styles["Body"]))
story.append(PageBreak())

# ─── Section 3: API Surface ───
story.append(Paragraph("3. API Surface (175 Endpoints)", styles["SectionTitle"]))
story.append(make_table(
    ["Domain", "Routes", "Purpose"],
    [
        ["Admin Panel", "48", "CMS: sports, drills, assessments, normative data, themes, flags"],
        ["Chat AI", "11", "Orchestrator, agents, streaming, sessions, briefing, transcription"],
        ["Calendar", "8", "Events CRUD, auto-fill, ghost suggestions, day locks"],
        ["Training", "6", "Drill catalog, recommendations, search, programs"],
        ["Testing", "5", "Phone tests, BlazePods, football tests, padel, benchmarks"],
        ["Content CMS", "5", "Manifest, bundle, items, UI config"],
        ["Health/Recovery", "8", "Sleep, WHOOP integration, health data, readiness"],
        ["Athlete Data", "13", "Snapshots, events, daily load, CV profile"],
        ["Recommendations", "4", "For-You feed, suggestions, deep refresh"],
        ["Programs", "5", "Active, interact, refresh, recommend, linked"],
        ["Coach/Parent", "14", "Player management, assessments, programmes"],
        ["Leaderboards", "5", "Global, archetype, streaks, local, team"],
        ["Other", "44", "Points, notifications, checkin, users, relationships, batch"],
    ],
    [doc.width * 0.20, doc.width * 0.10, doc.width * 0.70]
))
story.append(PageBreak())

# ─── Section 4: Chat AI System ───
story.append(Paragraph("4. Chat AI System (3-Agent Orchestrator)", styles["SectionTitle"]))
story.append(Paragraph("The chat system uses a 6-layer context pipeline feeding into a 3-agent orchestrator. All user messages pass through intent detection, agent routing, and a write action gate before execution.", styles["Body"]))

story.append(Paragraph("6-Layer Context Pipeline", styles["SubSection"]))
story.append(make_table(
    ["Layer", "Source", "Purpose"],
    [
        ["1. Player Memory", "users + athlete_snapshots", "Name, age, sport, position, archetype, streak"],
        ["2. Temporal Context", "System clock + calendar", "Time of day, match day, exam proximity, load status"],
        ["3. Schedule Rules", "player_schedule_preferences", "School hours, gym times, sleep, master priority rules"],
        ["4. Session History", "chat_messages", "Last 3-5 messages for conversation continuity"],
        ["5. State Extractor", "Conversation analysis", "Infers drill name, date refs, events from chat"],
        ["6. Intent Router", "Keyword matching", "Routes to Timeline/Output/Mastery agent + lock"],
    ],
    [doc.width * 0.22, doc.width * 0.30, doc.width * 0.48]
))

story.append(Paragraph("3-Agent System", styles["SubSection"]))
story.append(Paragraph(f"{b('Timeline Agent')} (12 tools) — Calendar CRUD, scheduling, load collision detection, ghost suggestions, auto-fill, day locks, schedule rules management.", styles["Body"]))
story.append(Paragraph(f"{b('Output Agent')} (15+ tools) — Readiness, vitals, check-ins, tests, metrics, drill recommendations, programs, benchmarks, drill ratings, test logging.", styles["Body"]))
story.append(Paragraph(f"{b('Mastery Agent')} (4 tools) — CV/identity, achievement history, test trajectory, consistency scoring.", styles["Body"]))

story.append(Paragraph("Write Action Gate", styles["SubSection"]))
story.append(Paragraph("All create/update/delete operations go through a confirmation flow:", styles["Body"]))
story.append(bullet(f"{b('Direct actions')} (single-step): log_test_result, log_check_in, rate_drill, sync_whoop"))
story.append(bullet(f"{b('Gated actions')} (two-step confirmation): create/update/delete_event, generate_training_plan, add_exam"))
story.append(bullet("Write actions produce PendingWriteAction, rendered as ConfirmationCard in the UI"))

story.append(Paragraph("Quick Action Fast-Paths", styles["SubSection"]))
story.append(Paragraph("Pattern-matched shortcuts that bypass AI for deterministic responses ($0 cost):", styles["Body"]))
story.append(make_table(
    ["Pattern", "Tool", "Response Type"],
    [
        ['"my readiness" / "how do I feel"', "get_readiness_detail", "stat_grid"],
        ['"my streak" / "consistency"', "get_consistency_score", "stat_grid"],
        ['"my load" / "dual load"', "get_dual_load_score", "stat_grid"],
        ['"today\'s schedule"', "get_today_events", "schedule_list"],
        ['"show my week" / "this week"', "get_week_schedule", "week_schedule"],
        ['"my tests" / "test results"', "get_test_results", "stat_grid"],
    ],
    [doc.width * 0.35, doc.width * 0.30, doc.width * 0.35]
))
story.append(PageBreak())

# ─── Section 5: Capsule System ───
story.append(Paragraph("5. Capsule Command Center (11 Types)", styles["SectionTitle"]))
story.append(Paragraph("Capsules are inline interactive cards in the chat that replace multi-step AI conversations with deterministic, form-based workflows. Each capsule type has input validation, a confirmation tier, and a DB write handler.", styles["Body"]))
story.append(Spacer(1, 6))
story.append(make_table(
    ["Capsule Type", "Confirmation", "Purpose"],
    [
        ["test_log_capsule", "Direct", "Log phone test results inline"],
        ["checkin_capsule", "Direct", "Daily wellness check-in form"],
        ["drill_rating_capsule", "Direct", "Rate drill after completion"],
        ["program_action_capsule", "Direct", "Start/pause/complete program"],
        ["event_edit_capsule", "Gated", "Create/edit/delete calendar events"],
        ["schedule_rules_capsule", "Gated", "Update player schedule preferences"],
        ["training_schedule_capsule", "Gated", "Generate multi-week training plan"],
        ["study_schedule_capsule", "Gated", "Generate exam prep study plan"],
        ["cv_edit_capsule", "Gated", "Edit player CV/profile fields"],
        ["phv_calculator_capsule", "Direct", "Calculate growth stage (PHV)"],
        ["navigation_capsule", "Direct", "Navigate to app tabs/screens"],
    ],
    [doc.width * 0.32, doc.width * 0.15, doc.width * 0.53]
))
story.append(PageBreak())

# ─── Section 6: Athlete Data Fabric ───
story.append(Paragraph("6. Athlete Data Fabric (4 Layers)", styles["SectionTitle"]))
story.append(Paragraph("The data fabric is an event-sourced architecture that separates raw event capture from computed state, enabling real-time updates and retroactive corrections.", styles["Body"]))

story.append(Paragraph("Layer 1: Event Stream (athlete_events)", styles["SubSection"]))
story.append(bullet("Append-only, immutable event log"))
story.append(bullet("28 event types across 5 dimensions: Wellness, Load, Performance, Stakeholder, Corrections"))
story.append(bullet("Never read directly by UI; consumed by event processor"))

story.append(Paragraph("Layer 2: Snapshot (athlete_snapshots)", styles["SubSection"]))
story.append(bullet("Single pre-computed document per athlete"))
story.append(bullet("Refreshed by event processor after every Layer 1 insert"))
story.append(bullet("All UI reads from this via readSnapshot() / useTriangleSnapshot()"))
story.append(bullet("Fields: readiness, ACWR, ATL, CTL, dual_load, PHV stage, mastery scores, wellness trend"))

story.append(Paragraph("Layer 3: Time-Series (athlete_daily_load)", styles["SubSection"]))
story.append(bullet("Daily aggregates: academic_load, athletic_load, dual_load_index"))
story.append(bullet("Used for load warning recommendations and ACWR calculation"))

story.append(Paragraph("Layer 4: Recommendations (athlete_recommendations)", styles["SubSection"]))
story.append(bullet("Cached personalized recs (drill, program, recovery, readiness tips)"))
story.append(bullet("Populated by recommendation engine, delivery log tracks shown/dismissed"))

story.append(Paragraph("28 Event Types", styles["SubSection"]))
events_data = [
    ["Wellness (5)", "WELLNESS_CHECKIN, SLEEP_RECORD, VITAL_READING, WEARABLE_SYNC, INJURY_FLAG"],
    ["Load (4)", "SESSION_LOG, ACADEMIC_EVENT, DRILL_COMPLETED, STUDY_SESSION_LOG"],
    ["Performance (3)", "ASSESSMENT_RESULT, COMPETITION_RESULT, PHV_MEASUREMENT"],
    ["Stakeholder (5)", "COACH_NOTE, COACH_ASSESSMENT, PARENT_INPUT, TRIANGLE_FLAG, INJURY_CLEARED"],
    ["Programs (4)", "PROGRAM_STARTED, PROGRAM_COMPLETED, PROGRAM_PAUSED, DRILL_RATED"],
    ["Goals (2)", "GOAL_SET, GOAL_ACHIEVED"],
    ["Corrections (3)", "TEST_EDITED, TEST_DELETED, CORRECTION_ISSUED"],
    ["Other (2)", "CUSTOM_EVENT, (reserved)"],
]
story.append(make_table(
    ["Dimension", "Event Types"],
    events_data,
    [doc.width * 0.20, doc.width * 0.80]
))
story.append(PageBreak())

# ─── Section 7: Database Schema ───
story.append(Paragraph("7. Database Schema (48 Tables)", styles["SectionTitle"]))
story.append(Paragraph("Supabase PostgreSQL with Row-Level Security on all tables. Service role bypasses RLS for API handlers.", styles["Body"]))

db_tables = [
    ["users", "Profile, archetype, streaks, freeze tokens, onboarding"],
    ["checkins", "Daily wellness: energy, soreness, sleep, mood, stress, pain, readiness"],
    ["plans", "AI-generated daily training plans with exercises and alerts"],
    ["calendar_events", "title, event_type, start_at/end_at (timestamptz), notes, intensity"],
    ["chat_messages", "Message history with session_id and structured metadata"],
    ["chat_sessions", "Session state, conversation_state (JSONB), active agent"],
    ["athlete_events", "Layer 1: Append-only immutable event stream (28 types)"],
    ["athlete_snapshots", "Layer 2: Pre-computed athlete state document"],
    ["athlete_daily_load", "Layer 3: Daily academic + athletic load aggregates"],
    ["athlete_recommendations", "Layer 4: Cached personalized recommendations"],
    ["training_drills", "Drill catalog with progressions, equipment, attributes"],
    ["phone_test_sessions", "On-device test results (reaction, sprint, jump, agility)"],
    ["player_schedule_preferences", "Schedule rules: school days/times, gym, sleep"],
    ["health_data", "Generic vital readings (HR, HRV, steps, VO2)"],
    ["sleep_logs", "Sleep tracking (hours, quality, source)"],
    ["relationships", "Coach/parent-to-player links (accepted/pending)"],
    ["notifications", "Push notification history and read status"],
    ["sport_normative_data", "8 rows per test: ALL + 7 age bands (U12-U19)"],
    ["content_items", "CMS-managed page content"],
    ["page_configs", "UI configuration per screen (metadata, empty states, tabs)"],
]
story.append(make_table(
    ["Table", "Purpose"],
    db_tables,
    [doc.width * 0.30, doc.width * 0.70]
))
story.append(Paragraph("(28 additional tables for sports, drills, milestones, CV, coach programmes, leaderboards, etc.)", styles["Body"]))
story.append(PageBreak())

# ─── Section 8: Training Program Pipeline ───
story.append(Paragraph("8. Training Program Recommendation Pipeline", styles["SectionTitle"]))
story.append(Paragraph("3-Phase Engine", styles["SubSection"]))
story.append(Paragraph(f"{b('Phase 1: Event to Snapshot')} - New test score, check-in, or session triggers event processor which computes incremental snapshot updates.", styles["Body"]))
story.append(Paragraph(f"{b('Phase 2: Snapshot to Guardrails')} - 8 deterministic guardrails filter and constrain recommendations:", styles["Body"]))
story.append(make_table(
    ["#", "Guardrail", "Rule"],
    [
        ["1", "Age-appropriate", "Block high-impact if U12-U14"],
        ["2", "PHV-aware", "Block power programs if CIRCA-PHV"],
        ["3", "Injury-aware", "Block categories if return-to-play active"],
        ["4", "Load-aware", "Cap intensity if ACWR > 2.0"],
        ["5", "Fatigue-aware", "Recommend recovery if HRV down 20%+"],
        ["6", "Consistency-aware", "Lock to familiar categories if streak < 14 days"],
        ["7", "Dual-load-aware", "Reduce volume if academic + athletic > 75%"],
        ["8", "Time-aware", "Adjust duration by training age"],
    ],
    [doc.width * 0.05, doc.width * 0.25, doc.width * 0.70]
))
story.append(Paragraph(f"{b('Phase 3: AI Personalization')} - Claude Haiku refines with archetype, benchmark trends, preferred drills, and calendar context. Cached with 3-day TTL ($0.0002/call).", styles["Body"]))
story.append(PageBreak())

# ─── Section 9: Schedule Rule Engine ───
story.append(Paragraph("9. Schedule Rule Engine", styles["SectionTitle"]))
story.append(Paragraph("Master Priority Rules", styles["SubSection"]))
story.append(make_table(
    ["Priority", "Event Type", "Description"],
    [
        ["P1", "School", "School hours are immovable"],
        ["P1", "Exam", "Exam prep takes top priority"],
        ["P2", "Match", "Competition scheduling"],
        ["P3", "Recovery", "Sleep, rest days"],
        ["P4", "Club Training", "Academy/team training"],
        ["P5", "Gym", "Individual strength/conditioning"],
        ["P6", "Study", "Academic subjects"],
        ["P7", "Personal Dev", "Film study, tactical review"],
    ],
    [doc.width * 0.12, doc.width * 0.20, doc.width * 0.68]
))
story.append(Paragraph("4 Scheduling Scenarios", styles["SubSection"]))
story.append(bullet(f"{b('Normal')} - Regular season, no exams"))
story.append(bullet(f"{b('League Active')} - Competition phase (matches every 7d, tighter load caps)"))
story.append(bullet(f"{b('Exam Period')} - Exams within 2 weeks (academic priority)"))
story.append(bullet(f"{b('League + Exam')} - Most restrictive (dual load < 70%, training volume capped)"))
story.append(PageBreak())

# ─── Section 10-11: Drill + Mastery ───
story.append(Paragraph("10. Drill Recommendation System", styles["SectionTitle"]))
story.append(bullet("Drill catalog in training_drills table with progressions, equipment, attributes"))
story.append(bullet("Filtering: position, primary attribute, age band, equipment, injury restrictions"))
story.append(bullet("Primary attribute scoring based on test gaps, benchmark percentiles, position demands"))
story.append(bullet("Full-text search by attribute, skill, category (warmup/activation/main/cooldown)"))
story.append(Spacer(1, 12))
story.append(Paragraph("11. Mastery & DNA System", styles["SectionTitle"]))
story.append(bullet("DNA Radar Chart: 7 mastery pillars computed from test scores"))
story.append(bullet("Respects disabled pillars (redistributes axes equally)"))
story.append(bullet("Peer average benchmark shown as bold red dashed line"))
story.append(bullet("Mastery snapshot fields: mastery_scores (JSONB), cv_completeness, coachability_index"))
story.append(bullet("Achievement tracking: PRs, plan completions, streak milestones"))
story.append(PageBreak())

# ─── Section 12: Mobile Frontend ───
story.append(Paragraph("12. Mobile Frontend Architecture", styles["SectionTitle"]))
story.append(Paragraph("Framework: Expo / React Native with TypeScript. Web via expo export to Vercel. iOS/Android via Expo Go or EAS builds.", styles["Body"]))

story.append(Paragraph("5-Tab Navigation", styles["SubSection"]))
story.append(make_table(
    ["Tab", "Screen", "Purpose"],
    [
        ["Timeline", "TrainingScreen.tsx", "Calendar grid, daily flow, AI insights, exam planner"],
        ["Output", "TestsScreen.tsx", "3 sub-tabs: My Vitals, My Metrics, My Programs"],
        ["Tomo Chat", "HomeScreen.tsx", "AI Command Center, 3-agent orchestrator"],
        ["Mastery", "ProgressScreen.tsx", "DNA card, 7 pillars, streak tiers, milestones"],
        ["Own It", "ForYouScreen.tsx", "Recommendation feed, readiness, recovery tips"],
    ],
    [doc.width * 0.15, doc.width * 0.28, doc.width * 0.57]
))

story.append(Paragraph("Key Stats", styles["SubSection"]))
story.append(bullet("71 total screens (core athlete, phone tests, calendar, programs, auth, settings, coach/parent)"))
story.append(bullet("120 total components (layout, cards, forms, charts, drill UI, calendar, chat, progress)"))
story.append(bullet("38 custom hooks (auth, data, sport, content, config, features, integrations)"))
story.append(bullet("Provider stack: GestureHandlerRootView > ContentProvider > AuthProvider > SportProvider > ThemeProvider"))
story.append(PageBreak())

# ─── Section 13: Theme & Design ───
story.append(Paragraph("13. Theme & Design System", styles["SectionTitle"]))
story.append(Paragraph("70/20/10 Rule: 70% dark surfaces, 20% neutral text, 10% orange-teal accent.", styles["Body"]))

story.append(make_table(
    ["Token", "Dark Mode", "Light Mode"],
    [
        ["background", "#0D0C0E", "#F8F5F0"],
        ["backgroundElevated", "#1B191E", "#F0EBE3"],
        ["accent1 (Tomo Orange)", "#FF6B35", "#FF6B35"],
        ["accent2 (Tomo Teal)", "#00D9FF", "#00D9FF"],
        ["Readiness Green", "#30D158", "#30D158"],
        ["Readiness Yellow", "#F39C12", "#F39C12"],
        ["Readiness Red", "#E74C3C", "#E74C3C"],
    ],
    [doc.width * 0.35, doc.width * 0.325, doc.width * 0.325]
))
story.append(Spacer(1, 6))
story.append(bullet("Typography: Poppins (300-700 weights), 8pt spacing grid"))
story.append(bullet("Border radius: sm (8px), md (12px), lg (16px), full (9999px), blobMax (60px)"))
story.append(bullet("Tab pattern: underline tabs (PlanTabSwitcher), NOT pill buttons"))
story.append(bullet("Input fields: NO visible border, use colors.inputBackground, no borderWidth"))
story.append(PageBreak())

# ─── Section 14: CMS Admin Panel ───
story.append(Paragraph("14. CMS Admin Panel", styles["SectionTitle"]))
story.append(Paragraph("The admin panel is a full-featured CMS built with Next.js 16, shadcn/ui (Radix primitives), and Tailwind CSS. It runs at api.my-tomo.com/admin and requires is_admin flag on the user record.", styles["Body"]))

story.append(Paragraph("Admin Capabilities (48 API endpoints)", styles["SubSection"]))
story.append(make_table(
    ["Category", "Pages", "What Can Be Managed"],
    [
        ["Sports Config", "5 pages per sport", "Sports, attributes, skills, positions, rating levels"],
        ["Drills", "3 pages", "Drill catalog with media, tags, progressions, bulk import, reorder"],
        ["Programs", "3 pages", "Training programs with toggle, linked categories"],
        ["Programmes", "3 pages", "Structured coach programmes with publish workflow"],
        ["Assessments", "3 pages", "Test definitions with derived metrics, input field builder"],
        ["Normative Data", "1 page", "Benchmark data: import/export, spreadsheet editor, bulk update"],
        ["Content Items", "3 pages", "Articles, tips, resources with JSON editor"],
        ["Themes", "4 pages", "Color schemes, typography, import/export, activate"],
        ["Design Pages", "7 pages", "Per-tab styling: Timeline, Output, Chat, Mastery, Own It, Brand, Flags"],
        ["Feature Flags", "2 pages", "A/B test toggles, gradual rollout"],
        ["Page Configs", "3 pages", "Static page content, metadata, empty states"],
        ["Mastery Config", "1 page", "Pillar names, emojis, colors, enabled toggle, metric weights"],
        ["DNA Card", "1 page", "Tier display configuration"],
        ["Recommendation Engine", "1 page", "Algorithm configuration"],
        ["Dashboard", "1 page", "Stats cards: users, sessions, tests, streaks"],
    ],
    [doc.width * 0.20, doc.width * 0.15, doc.width * 0.65]
))

story.append(Paragraph("Admin Auth", styles["SubSection"]))
story.append(bullet("Login at /admin/login via Supabase email/password"))
story.append(bullet("Verifies is_admin flag via /api/v1/admin/auth/verify"))
story.append(bullet("Session managed via Supabase auth cookies"))
story.append(bullet("Unauthorized redirects to /admin/login?error=unauthorized"))

story.append(Paragraph("Key Components (backend/components/admin/)", styles["SubSection"]))
story.append(bullet("AdminSidebar.tsx — Navigation sidebar with 6 collapsible sections"))
story.append(bullet("AdminHeader.tsx — Top bar with user info"))
story.append(bullet("NormativeSpreadsheet.tsx — Excel-like editor for benchmark data"))
story.append(bullet("DerivedMetricEditor.tsx — Formula builder for computed test metrics"))
story.append(bullet("ColorGroupEditor.tsx + TypographyEditor.tsx — Theme design tools"))
story.append(bullet("11 drill management components (builders, media handlers, tag editors)"))
story.append(PageBreak())

# ─── Section 15: Coach Portal ───
story.append(Paragraph("15. Coach Portal", styles["SectionTitle"]))
story.append(Paragraph("The coach portal is a role-based mobile experience with 2 bottom tabs (Players, Profile) and 8 stack screens for player management.", styles["Body"]))

story.append(Paragraph("Coach Screens", styles["SubSection"]))
story.append(make_table(
    ["Screen", "Purpose"],
    [
        ["CoachPlayersScreen", "List all linked players with readiness RAG, ACWR badges, streaks"],
        ["CoachPlayerDetailScreen", "Single player view with 4 tabs: Timeline, Mastery, Programmes, Tests"],
        ["CoachPlayerPlanScreen", "Player's training schedule and recommendations"],
        ["CoachTestInputScreen", "Submit test results for a player (various test types)"],
        ["CoachAddProgramScreen", "Assign training programme to a player"],
        ["CoachInviteScreen", "Generate 6-char invite code, copy/share via native Share"],
        ["CoachOnboardingScreen", "Initial setup flow for new coaches"],
        ["CoachProfileScreen", "Coach's own profile, settings, sign out"],
    ],
    [doc.width * 0.35, doc.width * 0.65]
))

story.append(Paragraph("Coach API Endpoints (/api/v1/coach/)", styles["SubSection"]))
story.append(make_table(
    ["Endpoint", "Methods", "Purpose"],
    [
        ["/players", "GET", "List linked players with snapshots"],
        ["/players/[id]/calendar", "GET", "Player's calendar events"],
        ["/players/[id]/tests", "GET, POST", "View/submit test results"],
        ["/players/[id]/readiness", "GET", "Player's readiness state"],
        ["/assessments", "GET", "Available assessment definitions"],
        ["/notes", "GET, POST, PATCH, DELETE", "Coach notes about players"],
        ["/programmes", "GET, POST", "Coach's custom programmes"],
        ["/programmes/[id]", "GET, PATCH, DELETE", "Edit specific programme"],
        ["/programmes/[id]/publish", "POST", "Publish programme to player"],
        ["/drills", "GET", "Drill library for programme building"],
    ],
    [doc.width * 0.32, doc.width * 0.18, doc.width * 0.50]
))
story.append(PageBreak())

# ─── Section 16: Parent Portal ───
story.append(Paragraph("16. Parent Portal", styles["SectionTitle"]))
story.append(Paragraph("The parent portal focuses on academic-athletic balance with 2 bottom tabs (Children, Profile) and 7 stack screens for study/exam management.", styles["Body"]))

story.append(Paragraph("Parent Screens", styles["SubSection"]))
story.append(make_table(
    ["Screen", "Purpose"],
    [
        ["ParentChildrenScreen", "List all linked children with summary view"],
        ["ParentChildDetailScreen", "Single child view with 3 tabs: Timeline, Exams, Mastery"],
        ["ParentCalendarScreen", "Daily view of child's combined training + study calendar"],
        ["ParentAddStudyScreen", "Add study block to child's calendar"],
        ["ParentAddExamScreen", "Add exam with date, subject, type (final/midterm/quiz)"],
        ["ParentExamScreen", "Child's exam schedule and deadlines"],
        ["ParentStudyPlanScreen", "Child's study blocks and plan overview"],
        ["ParentMasteryScreen", "Child's mastery progress"],
        ["ParentInviteScreen", "Generate 6-char invite code for linking"],
        ["ParentOnboardingScreen", "Initial setup flow for new parents"],
    ],
    [doc.width * 0.35, doc.width * 0.65]
))

story.append(Paragraph("Parent API Endpoints (/api/v1/parent/)", styles["SubSection"]))
story.append(make_table(
    ["Endpoint", "Methods", "Purpose"],
    [
        ["/children", "GET", "List all linked children"],
        ["/children/[id]/calendar", "GET", "Child's combined calendar"],
        ["/children/[id]/study-profile", "GET, PATCH", "Child's study info (subjects, goals)"],
        ["/children/[id]/study-block", "GET, POST, PATCH, DELETE", "Manage study sessions"],
        ["/children/[id]/exam", "GET, POST, PATCH, DELETE", "Manage exam schedule"],
        ["/children/[id]/notify-study-info", "POST", "Notify child of study updates"],
        ["/input", "POST", "General parent input submissions"],
    ],
    [doc.width * 0.35, doc.width * 0.22, doc.width * 0.43]
))
story.append(PageBreak())

# ─── Section 17: Relationship & Multi-Role System ───
story.append(Paragraph("17. Relationship & Multi-Role System", styles["SectionTitle"]))
story.append(Paragraph("Three roles (player, coach, parent) share the same auth infrastructure with role-based navigation and data visibility.", styles["Body"]))

story.append(Paragraph("Role-Based Navigation", styles["SubSection"]))
story.append(bullet(f"{b('Player')} — 5-tab MainNavigator (Timeline, Output, Chat, Mastery, Own It)"))
story.append(bullet(f"{b('Coach')} — 2-tab CoachNavigator (Players, Profile) + 8 stack screens"))
story.append(bullet(f"{b('Parent')} — 2-tab ParentNavigator (Children, Profile) + 7 stack screens"))
story.append(bullet("RootNavigator switches between Auth, Onboarding, and role-based Main navigator"))

story.append(Paragraph("Invite Code Flow", styles["SubSection"]))
story.append(Paragraph("1. Coach/Parent generates 6-character code (no O/0/I/1 confusion) — expires in 7 days", styles["Body"]))
story.append(Paragraph("2. Code shared via native Share sheet or clipboard copy", styles["Body"]))
story.append(Paragraph("3. Player submits code — system validates: exists, not expired, not self-link, no duplicate", styles["Body"]))
story.append(Paragraph("4. Creates relationship with status 'accepted', marks code as used", styles["Body"]))

story.append(Paragraph("Suggestions System (Cross-Role Approval)", styles["SubSection"]))
story.append(Paragraph("When coach/parent submits data (test result, exam, study block), it creates a suggestion with status 'pending'. The player sees it in their inbox and can accept, decline, or edit. On accept, data moves to real tables.", styles["Body"]))

story.append(Paragraph("Snapshot Visibility by Role", styles["SubSection"]))
story.append(bullet(f"{b('Coach sees')}: Readiness RAG, ACWR, dual load, wellness trend, sessions, sport metrics"))
story.append(bullet(f"{b('Parent sees')}: Study blocks, exams, wellness, general activity (not detailed sport metrics)"))
story.append(bullet("Filtering via readMultipleSnapshots(playerIds, role) in getLinkedPlayers()"))
story.append(PageBreak())

# ─── Section 18: Integrations ───
story.append(Paragraph("18. Integrations", styles["SectionTitle"]))
story.append(Paragraph("WHOOP Integration", styles["SubSection"]))
story.append(bullet("OAuth 2.0 flow (requires 'offline' scope for refresh tokens)"))
story.append(bullet("Syncs: HRV, resting HR, sleep quality, strain, recovery score"))
story.append(bullet("Stored in health_data table, triggers snapshot + program refresh"))
story.append(bullet("Endpoints: /api/v1/integrations/whoop/authorize, /callback, /sync"))

story.append(Paragraph("Content CMS", styles["SubSection"]))
story.append(bullet("8 Supabase tables: sports, attributes, skills, positions, tests, ratings, norms, content_items"))
story.append(bullet("Public API: /api/v1/content/manifest, /bundle, /items"))
story.append(bullet("Frontend: ContentProvider with AsyncStorage cache and hardcoded fallback"))
story.append(bullet("CMS Reflection Rule: every app feature MUST have CMS management"))
story.append(PageBreak())

# ─── Section 19: Deployment ───
story.append(Paragraph("19. Deployment & DevOps", styles["SectionTitle"]))
story.append(make_table(
    ["Component", "Platform", "URL"],
    [
        ["Frontend (Web)", "Vercel (tomo-web)", "app.my-tomo.com"],
        ["Backend API", "Vercel (backend)", "api.my-tomo.com"],
        ["Database", "Supabase PostgreSQL", "Production instance"],
        ["Mobile (iOS/Android)", "Expo Go / EAS", "Dev builds"],
    ],
    [doc.width * 0.25, doc.width * 0.35, doc.width * 0.40]
))
story.append(Paragraph("Environment Variables", styles["SubSection"]))
story.append(bullet("Backend: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, CRON_SECRET"))
story.append(bullet("Mobile: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL"))
story.append(PageBreak())

# ─── Section 16: Performance ───
story.append(Paragraph("20. Performance Optimizations", styles["SectionTitle"]))
story.append(Paragraph("API Cost Reduction", styles["SubSection"]))
story.append(bullet("Capsule fast-paths: deterministic responses at $0 (vs $0.01-0.03 per AI call)"))
story.append(bullet("Claude Haiku for simple queries (10x cheaper than Sonnet)"))
story.append(bullet("Prompt caching for static content (RAG knowledge base)"))
story.append(bullet("Fire-and-forget async for background refreshes"))
story.append(bullet("Snapshot pre-computation eliminates 90% of per-request DB queries"))

story.append(Paragraph("Frontend Performance", styles["SubSection"]))
story.append(bullet("ContentCache (AsyncStorage) for offline-first content loading"))
story.append(bullet("useTriangleSnapshot() real-time subscription vs polling"))
story.append(bullet("Memoization on selector hooks to prevent unnecessary re-renders"))

story.append(Paragraph("Database Performance", styles["SubSection"]))
story.append(bullet("BRIN indexes on append-only tables (athlete_events created_at)"))
story.append(bullet("Row-level security on all tables (no post-query filtering needed)"))
story.append(bullet("Deterministic ledger IDs enable upsert without existence check"))
story.append(PageBreak())

# ─── Section 17: Golden Rules ───
story.append(Paragraph("21. Golden Rules & Risk Mitigations", styles["SectionTitle"]))
rules = [
    ("CMS Reflection Rule", "Any feature added to app MUST be reflected in CMS Admin Panel by default"),
    ("No CI Frontend Deploy", "Never add frontend deploy to CI (causes 404s); deploy manually via Vercel CLI"),
    ("No Alert.alert on Web", "Always wrap Alert.alert with Platform.OS check (silently fails on web)"),
    ("Per-Position Normative Data", "Every new test MUST have 8 normative data rows (ALL + 7 age bands)"),
    ("Test Pipeline 4-Layer Validation", "All test types MUST pass: PHONE_TEST_TO_METRIC, NORM_NAME_TO_METRIC_KEY, TEST_GROUP_MAP, RAW_TEST_GROUP_MAP"),
    ("Cross-App Data Freshness", "When data changes: (1) refreshBus, (2) deepRecRefresh, (3) deepProgramRefresh, (4) emitEventSafe"),
    ("API Cost Optimization", "Use capsule fast-paths ($0) over AI calls, Haiku over Sonnet, prompt caching"),
    ("Snapshot-First Reads", "Always read from athlete_snapshots via readSnapshot() - NEVER query raw tables"),
]
story.append(make_table(
    ["Rule", "Description"],
    [[r[0], r[1]] for r in rules],
    [doc.width * 0.30, doc.width * 0.70]
))

story.append(Spacer(1, 30))
story.append(hr())
story.append(Paragraph(f"Tomo Technical Architecture Reference | {date.today().strftime('%B %Y')} | Confidential", styles["FooterNote"]))

# Build PDF
doc.build(story)
print(f"PDF generated: {output_path}")
