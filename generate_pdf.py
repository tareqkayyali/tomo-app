#!/usr/bin/env python3
"""Generate TOMO_USER_GUIDE.pdf from the markdown content."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)

# Colors matching Tomo theme
ORANGE = HexColor("#FF6B35")
TEAL = HexColor("#00D9FF")
DARK_BG = HexColor("#1B191E")
LIGHT_TEXT = HexColor("#F8F5F0")
MUTED = HexColor("#6B6B6B")
GREEN = HexColor("#30D158")
RED = HexColor("#E74C3C")
YELLOW = HexColor("#F39C12")

def build_pdf():
    doc = SimpleDocTemplate(
        "/Users/tareqelkayyali/Desktop/Tomo/tomo-app/TOMO_USER_GUIDE.pdf",
        pagesize=A4,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    styles.add(ParagraphStyle(
        'DocTitle', parent=styles['Title'],
        fontSize=28, textColor=ORANGE, spaceAfter=6,
        fontName='Helvetica-Bold',
    ))
    styles.add(ParagraphStyle(
        'DocSubtitle', parent=styles['Normal'],
        fontSize=12, textColor=MUTED, spaceAfter=20,
        fontName='Helvetica-Oblique', alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        'H1', parent=styles['Heading1'],
        fontSize=22, textColor=ORANGE, spaceBefore=24, spaceAfter=10,
        fontName='Helvetica-Bold',
    ))
    styles.add(ParagraphStyle(
        'H2', parent=styles['Heading2'],
        fontSize=16, textColor=TEAL, spaceBefore=18, spaceAfter=8,
        fontName='Helvetica-Bold',
    ))
    styles.add(ParagraphStyle(
        'H3', parent=styles['Heading3'],
        fontSize=13, textColor=HexColor("#B0B0B0"), spaceBefore=12, spaceAfter=6,
        fontName='Helvetica-Bold',
    ))
    styles.add(ParagraphStyle(
        'Body', parent=styles['Normal'],
        fontSize=10, leading=14, spaceAfter=6,
        fontName='Helvetica',
    ))
    styles.add(ParagraphStyle(
        'BulletItem', parent=styles['Normal'],
        fontSize=10, leading=14, spaceAfter=3,
        leftIndent=18, bulletIndent=6,
        fontName='Helvetica',
    ))
    styles.add(ParagraphStyle(
        'CodeBlock', parent=styles['Normal'],
        fontSize=9, leading=12, spaceAfter=6,
        fontName='Courier', textColor=TEAL,
        leftIndent=12,
    ))
    styles.add(ParagraphStyle(
        'TableCell', parent=styles['Normal'],
        fontSize=9, leading=12,
        fontName='Helvetica',
    ))
    styles.add(ParagraphStyle(
        'TableHeader', parent=styles['Normal'],
        fontSize=9, leading=12,
        fontName='Helvetica-Bold', textColor=white,
    ))
    styles.add(ParagraphStyle(
        'TOCItem', parent=styles['Normal'],
        fontSize=11, leading=18, spaceAfter=2,
        fontName='Helvetica', textColor=TEAL,
    ))

    story = []

    # ── Title Page ──
    story.append(Spacer(1, 1.5*inch))
    story.append(Paragraph("TOMO", styles['DocTitle']))
    story.append(Paragraph("Complete User Guide & Feature Documentation", styles['DocSubtitle']))
    story.append(Spacer(1, 12))
    story.append(Paragraph("AI Coaching Platform for Young Athletes", styles['Body']))
    story.append(Paragraph("Last updated: March 18, 2026", styles['Body']))
    story.append(Spacer(1, 0.5*inch))
    story.append(HRFlowable(width="100%", thickness=2, color=ORANGE))
    story.append(Spacer(1, 0.3*inch))

    # ── Table of Contents ──
    story.append(Paragraph("Table of Contents", styles['H2']))
    toc_items = [
        "1. Getting Started",
        "2. Player Experience (5 Tabs)",
        "3. Coach Experience",
        "4. Parent Experience",
        "5. Triangle: Coach-Player-Parent",
        "6. AI Chat System",
        "7. Wearable Integrations",
        "8. Gamification",
        "9. API Reference Summary",
    ]
    for item in toc_items:
        story.append(Paragraph(item, styles['TOCItem']))
    story.append(PageBreak())

    # ── Helper functions ──
    def h1(text):
        story.append(Paragraph(text, styles['H1']))

    def h2(text):
        story.append(Paragraph(text, styles['H2']))

    def h3(text):
        story.append(Paragraph(text, styles['H3']))

    def body(text):
        story.append(Paragraph(text, styles['Body']))

    def bullet(text):
        story.append(Paragraph(f"\u2022 {text}", styles['BulletItem']))

    def code(text):
        story.append(Paragraph(text, styles['CodeBlock']))

    def spacer(h=6):
        story.append(Spacer(1, h))

    def hr():
        story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#2E2B31")))
        spacer(8)

    def make_table(headers, rows, col_widths=None):
        data = [headers] + rows
        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), ORANGE),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('LEADING', (0, 0), (-1, -1), 12),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor("#2E2B31")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor("#F8F5F0"), white]),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
        spacer(8)

    # ══════════════════════════════════════════════════════
    # SECTION 1: Getting Started
    # ══════════════════════════════════════════════════════
    h1("1. Getting Started")

    h2("Authentication")
    bullet("<b>Email/Password</b> - Traditional registration + login")
    bullet("<b>Google Sign-In</b> - One-tap OAuth, auto-fills name from Google profile")
    bullet("<b>Apple Sign-In</b> - Native Apple ID (pending Apple Developer setup)")
    bullet("<b>Password Reset</b> - Email-based recovery flow")

    h2("Onboarding (Player)")
    body("9-step profiling wizard:")
    bullet("1. Welcome intro")
    bullet("2. Sport selection (Football / Padel)")
    bullet("3. Position selection (sport-specific)")
    bullet("4. Experience &amp; competition level")
    bullet("5. Goals (improve fitness, get recruited, recover, stay consistent, have fun)")
    bullet("6. Physical details (height, weight, gender, age)")
    bullet("7. Academic schedule (school hours, exam periods)")
    bullet("8. Summary &amp; confirm")

    h2("Onboarding (Coach / Parent)")
    body("Simplified flows tailored to each role - set up team/family, link athletes.")
    hr()
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════
    # SECTION 2: Player Experience
    # ══════════════════════════════════════════════════════
    h1("2. Player Experience")
    body("The player interface has <b>5 main tabs</b> plus supporting screens.")

    h2("Tab 1: Timeline")
    body("<i>Daily calendar view with full schedule, readiness, and AI insights</i>")
    make_table(
        ["Feature", "Description"],
        [
            ["Day Navigation", "Swipe or arrow buttons between days, 'Today' quick button"],
            ["Readiness Card", "GREEN / YELLOW / RED status from daily check-in"],
            ["Daily Flow Grid", "24-hour timeline showing all events color-coded by type"],
            ["Event Types", "Training (orange), Match (purple), Recovery (green), Study (blue), Exam (yellow)"],
            ["Ghost Suggestions", "AI-proposed blocks shown in lighter color - confirm or dismiss"],
            ["Auto-Fill Week", "Repeats a successful week pattern across the calendar"],
            ["Day Lock", "Prevents editing past/completed days"],
            ["Add Event", "FAB button to create Training, Match, Study, Exam, Recovery, or Other events"],
            ["AI Insights", "Contextual advice card from the 3-agent orchestrator"],
        ],
        col_widths=[1.5*inch, 4.5*inch]
    )

    h2("Tab 2: Output")
    body("<i>Three sub-tabs for vitals, performance metrics, and training programs</i>")

    h3("My Vitals")
    bullet("Readiness hero card (score 0-100, GREEN/YELLOW/RED)")
    bullet("Mini stats: Energy, Mood, Sleep Hours, Soreness")
    bullet("7 vital group cards: Recovery, Sleep, Cardio, Activity, Body, Respiratory, Mental")
    bullet("WHOOP Connected/Connect banner")
    bullet("Data source badges (WHOOP, HealthKit)")

    h3("My Metrics")
    bullet("97+ tests across 11 categories")
    bullet("Radar/spider chart showing attribute profile")
    bullet("Percentile rankings with color zones (below/developing/competent/advanced/elite)")
    bullet("Trend indicators per metric, strengths and gaps identification")

    h3("My Programs")
    bullet("AI-generated training programs personalized to position, age, benchmarks, and gaps")
    bullet("Coach-assigned programs shown separately")
    bullet("Priority groups: Must Do / Recommended / Supplementary")
    bullet("<b>Actions</b>: Mark as Done, Dismiss ('Not for me') - with inline confirmation")
    bullet("AI refreshes programs excluding dismissed ones")

    h2("Tab 3: Tomo Chat (AI Command Center)")
    body("<i>3-agent AI orchestrator for conversational coaching</i>")
    bullet("<b>Timeline Agent</b> - Calendar CRUD, schedule adjustments, conflict detection")
    bullet("<b>Output Agent</b> - Readiness analysis, drill recommendations, benchmarks")
    bullet("<b>Mastery Agent</b> - Progress tracking, CV building, skill development")
    bullet("Suggestion chips for quick actions")
    bullet("Session history with context preservation")
    bullet("All write actions require user confirmation")

    h2("Tab 4: Mastery")
    body("<i>Holistic progress tracking</i>")
    bullet("<b>DNA Card</b> - Player archetype (Phoenix, Titan, Blade, Surge)")
    bullet("<b>7 Mastery Pillars</b> - Dual-layer benchmarks with mini trend charts")
    bullet("<b>Streak System</b> - Consecutive activity days with tier badges (New to Legend)")
    bullet("<b>Freeze Tokens</b> - Protect streak during rest days")
    bullet("<b>Milestone Badges</b> - Achievement unlocks grid")

    h2("Tab 5: Own It")
    body("<i>AI-powered personalized recommendations</i>")
    bullet("<b>Sports</b>: Readiness advisories, load warnings, recovery, development, motivation")
    bullet("<b>Academic</b>: Study block suggestions, exam prep tips")
    bullet("<b>Updates</b>: CV/recruiting opportunities, coach/parent alerts")
    bullet("Each rec shows title, summary, confidence score, evidence basis")
    bullet("Deep refresh triggers full Claude analysis (10-30 seconds)")

    story.append(PageBreak())

    h2("Supporting Screens")
    make_table(
        ["Screen", "Purpose"],
        [
            ["Profile", "Avatar, name, archetype, points, level, edit profile, logout"],
            ["Check-in", "7-step emoji wizard: energy, soreness, sleep, mood, effort, pain flag"],
            ["Settings", "Wearable connections (WHOOP, Apple Watch), notification prefs, privacy"],
            ["Add Event", "Create calendar events with type, date, time, duration, notes"],
            ["Drill Detail", "Full workout timer with countdown, sets, rest periods, audio/haptic cues"],
            ["Drill Camera", "Video capture with AI pose estimation for form feedback"],
            ["Session Complete", "Post-drill data entry (reps, reaction time, RPE) + points awarded"],
            ["My Rules", "Schedule rules engine - school hours, sleep, gaps, 4 scenario modes"],
            ["Study Plan", "Calendar view of AI-generated study blocks with exam timeline"],
            ["Favorites", "Bookmarked drills for quick access"],
            ["Notifications", "Activity feed with read/unread state, Mark All Read"],
        ],
        col_widths=[1.3*inch, 4.7*inch]
    )
    hr()

    # ══════════════════════════════════════════════════════
    # SECTION 3: Coach Experience
    # ══════════════════════════════════════════════════════
    h1("3. Coach Experience")
    body("Coaches have a <b>2-tab interface</b> plus detail screens.")

    h2("Tab 1: Players")
    bullet("List of all linked players as glass cards")
    bullet("Per player: avatar, name, readiness dot, ACWR badge, streak, last active")

    h2("Tab 2: Coach Profile")
    bullet("Coach info, team, credentials, settings")

    h2("Player Detail (4 inner tabs)")
    make_table(
        ["Tab", "What coaches see"],
        [
            ["Timeline", "Player's daily calendar (read-only)"],
            ["Mastery", "Player's DNA, pillars, streaks (read-only)"],
            ["Programs", "Coach-assigned programs, publish/unpublish"],
            ["Tests", "Player's test results, submit tests on behalf of player"],
        ],
        col_widths=[1.2*inch, 4.8*inch]
    )

    h2("Coach Actions")
    make_table(
        ["Action", "Description"],
        [
            ["Submit tests", "Enter test results from the 97-test catalog for a player"],
            ["Create program", "Build training program with exercises, schedule, progression"],
            ["Publish program", "Assign program to one or more players"],
            ["Recommend event", "Suggest a calendar event (training, recovery, study) to a player"],
            ["Generate invite", "6-character code (48hr expiry) to link new players"],
            ["View readiness", "14-day readiness dot history for any linked player"],
            ["View ACWR", "Acute:Chronic Workload Ratio risk assessment"],
        ],
        col_widths=[1.5*inch, 4.5*inch]
    )
    hr()

    # ══════════════════════════════════════════════════════
    # SECTION 4: Parent Experience
    # ══════════════════════════════════════════════════════
    h1("4. Parent Experience")
    body("Parents have a <b>2-tab interface</b> plus detail screens.")

    h2("Tab 1: Children")
    bullet("List of linked children as glass cards")
    bullet("Per child: avatar, name, age, sport, readiness dot, wellness trend")

    h2("Child Detail (3 inner tabs)")
    make_table(
        ["Tab", "What parents see"],
        [
            ["Timeline", "Child's full daily schedule (training + academics, read-only)"],
            ["Exams", "Exam schedule, study plans, study block suggestions"],
            ["Mastery", "Child's progress (DNA, pillars, streaks, read-only)"],
        ],
        col_widths=[1.2*inch, 4.8*inch]
    )

    h2("Parent Actions")
    make_table(
        ["Action", "Description"],
        [
            ["Add exam", "Create exam event with subject, date, time, duration"],
            ["Suggest study block", "Propose study session with subject, time, duration, priority"],
            ["Request study info", "Notify child to provide academic details"],
            ["Recommend event", "Suggest recovery, study, or other activities"],
            ["Generate invite", "6-character code (48hr expiry) to link child's account"],
            ["Monitor wellness", "See readiness trend and wellness indicators"],
        ],
        col_widths=[1.5*inch, 4.5*inch]
    )
    hr()
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════
    # SECTION 5: Triangle
    # ══════════════════════════════════════════════════════
    h1("5. Triangle: Coach-Player-Parent")
    body("The triangle relationship model connects coaches, players, and parents.")

    h2("Linking Accounts")
    bullet("1. <b>Invite Code</b> - Coach or parent generates a 6-character code (valid 48 hours)")
    bullet("2. <b>Player enters code</b> - via Link Account screen in settings")
    bullet("3. <b>Email Link</b> - Coach/parent can also link by entering player's email")
    bullet("4. <b>Approval</b> - Both parties must accept the relationship")

    h2("Visibility Matrix")
    make_table(
        ["Data", "Player", "Coach", "Parent"],
        [
            ["Calendar events", "Full access", "Read-only", "Read-only"],
            ["Check-in / Readiness", "Full access", "Read-only", "Wellness trend"],
            ["Test results", "Full access", "Read + Write", "Read-only"],
            ["Programs", "View + Done/Dismiss", "Create + Publish", "Read-only"],
            ["Mastery / Progress", "Full access", "Read-only", "Read-only"],
            ["Chat history", "Full access", "No access", "No access"],
            ["Vitals / Health", "Full access", "No access", "No access"],
            ["Study / Exams", "Full access", "No access", "Read + Write"],
            ["Notifications", "Own", "Own + player alerts", "Own + child alerts"],
        ],
        col_widths=[1.5*inch, 1.3*inch, 1.4*inch, 1.3*inch]
    )

    h2("Communication Flow")
    code("Coach --- assigns programs, submits tests, recommends events ---> Player")
    code("Parent -- adds exams, suggests study blocks, monitors wellness --> Player")
    code("Coach <-- views via player detail --- Player --> views via child detail -- Parent")
    hr()

    # ══════════════════════════════════════════════════════
    # SECTION 6: AI Chat System
    # ══════════════════════════════════════════════════════
    h1("6. AI Chat System")

    h2("3-Agent Orchestrator")
    make_table(
        ["Agent", "Scope", "Example Actions"],
        [
            ["Timeline", "Calendar management", "Create training block, reschedule, detect conflicts"],
            ["Output", "Performance & readiness", "Recommend drills, analyze trends, assess readiness"],
            ["Mastery", "Progress & development", "Track milestones, build CV, analyze growth"],
        ],
        col_widths=[1*inch, 1.5*inch, 3.5*inch]
    )

    h2("6-Layer Context Pipeline")
    bullet("1. <b>Player Memory</b> - Full athlete profile, history, preferences")
    bullet("2. <b>Temporal Context</b> - Day of week, match proximity, exam proximity")
    bullet("3. <b>Schedule Rules</b> - Active scenario (Normal/League/Exam), intensity caps")
    bullet("4. <b>Session History</b> - Previous conversation context")
    bullet("5. <b>Conversation State</b> - Referenced dates, events, drills, topics")
    bullet("6. <b>Intent Router</b> - Routes to correct agent, maintains focus")

    h2("Write Action Gate")
    body("All create/update/delete actions require explicit user confirmation via a confirmation card before execution.")
    hr()

    # ══════════════════════════════════════════════════════
    # SECTION 7: Wearable Integrations
    # ══════════════════════════════════════════════════════
    h1("7. Wearable Integrations")

    h2("WHOOP")
    bullet("OAuth2 connection via Settings")
    bullet("Auto-sync on app open (if last sync > 1 hour)")
    bullet("Initial sync: 30 days of historical data")
    bullet("Ongoing sync: last 24 hours")
    bullet("Data: HRV, resting HR, SpO2, skin temp, recovery score, sleep stages, workout strain, HR zones")

    h2("Apple Watch (HealthKit)")
    bullet("Native HealthKit permissions")
    bullet("Data: heart rate, HRV, steps, active calories, workouts, sleep")
    bullet("iOS only (gracefully degrades on web/Android)")

    h2("Data Flow")
    code("Wearable -> HealthKit/WHOOP API -> Event Ingestion -> Athlete Snapshot -> My Vitals UI")
    hr()

    # ══════════════════════════════════════════════════════
    # SECTION 8: Gamification
    # ══════════════════════════════════════════════════════
    h1("8. Gamification")
    make_table(
        ["System", "Description"],
        [
            ["Points", "Awarded for check-ins, test submissions, drill completions, streak bonuses"],
            ["Streaks", "Consecutive days with 1+ activity. Tiers: New to Legend"],
            ["Freeze Tokens", "Protect streak during rest days (limited supply)"],
            ["Archetypes", "Player personality: Phoenix, Titan, Blade, Surge"],
            ["Milestones", "Achievement badges (first check-in, 7-day streak, 100 tests, etc.)"],
            ["Levels", "1-10 based on total points"],
            ["Leaderboards", "Global, team, archetype, streak-based rankings"],
        ],
        col_widths=[1.3*inch, 4.7*inch]
    )
    hr()
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════
    # SECTION 9: API Reference
    # ══════════════════════════════════════════════════════
    h1("9. API Reference Summary")

    h2("Player Endpoints")
    bullet("<b>/api/v1/checkin</b> - Daily check-in")
    bullet("<b>/api/v1/calendar/*</b> - Calendar CRUD, ghost suggestions, auto-fill, day lock")
    bullet("<b>/api/v1/chat/*</b> - AI chat (agent, sessions, messages, briefing)")
    bullet("<b>/api/v1/tests/*</b> - Test catalog, results, submissions")
    bullet("<b>/api/v1/benchmarks/*</b> - Benchmark profiles, norms, trajectories")
    bullet("<b>/api/v1/programs/*</b> - Programs, refresh, interact (done/dismiss)")
    bullet("<b>/api/v1/output/snapshot</b> - Unified vitals + metrics + programs")
    bullet("<b>/api/v1/mastery/snapshot</b> - Mastery pillars, DNA, streaks")
    bullet("<b>/api/v1/recommendations/*</b> - Own It recs, deep refresh")
    bullet("<b>/api/v1/schedule/*</b> - Schedule rules, validation")
    bullet("<b>/api/v1/integrations/*</b> - WHOOP OAuth, sync, status")
    bullet("<b>/api/v1/notifications/*</b> - Notification feed, read, settings")

    h2("Coach Endpoints")
    bullet("<b>/api/v1/coach/players</b> - Player list + detail")
    bullet("<b>/api/v1/coach/players/[id]/tests</b> - Player tests (read + write)")
    bullet("<b>/api/v1/coach/programmes</b> - Programme CRUD + publish")
    bullet("<b>/api/v1/coach/drills</b> - Coach's custom drills")

    h2("Parent Endpoints")
    bullet("<b>/api/v1/parent/children</b> - Children list")
    bullet("<b>/api/v1/parent/children/[id]/calendar</b> - Child calendar (read)")
    bullet("<b>/api/v1/parent/children/[id]/exam</b> - Exam management")
    bullet("<b>/api/v1/parent/children/[id]/study-block</b> - Study block suggestions")
    spacer(20)

    hr()
    h2("Sports Supported")
    bullet("<b>Football</b> - Full feature set: 97 tests, position matrix, rating system, skill drills")
    bullet("<b>Padel</b> - Shot tracking, rating, shot sessions")
    bullet("<b>Basketball, Tennis</b> - Basic support (sport selection, generic training)")

    h2("Platforms")
    bullet("<b>Web</b> - app.my-tomo.com (Expo Web on Vercel)")
    bullet("<b>iOS</b> - Expo/React Native (EAS Build)")
    bullet("<b>Android</b> - Expo/React Native (EAS Build)")

    # Build
    doc.build(story)
    print("PDF generated: TOMO_USER_GUIDE.pdf")

if __name__ == "__main__":
    build_pdf()
