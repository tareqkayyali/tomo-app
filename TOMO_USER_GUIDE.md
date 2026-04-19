# Tomo App — Complete User Guide & Feature Documentation

> AI Coaching Platform for Young Athletes
> Last updated: March 18, 2026

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Player Experience (5 Tabs)](#player-experience)
3. [Coach Experience](#coach-experience)
4. [Parent Experience](#parent-experience)
5. [Triangle: Coach-Player-Parent](#triangle-relationships)
6. [AI Chat System](#ai-chat-system)
7. [Wearable Integrations](#wearable-integrations)
8. [Gamification](#gamification)
9. [API Reference Summary](#api-reference)

---

## 1. Getting Started

### Authentication
- **Email/Password** — Traditional registration + login
- **Google Sign-In** — One-tap OAuth, auto-fills name from Google profile
- **Apple Sign-In** — Native Apple ID (pending Apple Developer setup)
- **Password Reset** — Email-based recovery flow

### Onboarding (Player)
9-step profiling wizard:
1. Welcome intro
2. Sport selection (Football / Padel)
3. Position selection (sport-specific)
4. Experience & competition level
5. Goals (improve fitness, get recruited, recover from injury, stay consistent, have fun)
6. Physical details (height, weight, gender, age)
7. Academic schedule (school hours, exam periods)
8. Summary & confirm

### Onboarding (Coach / Parent)
Simplified flows tailored to each role — set up team/family, link athletes.

---

## 2. Player Experience

The player interface has **3 main tabs** plus supporting screens. The default landing tab is **Chat**.

### Tab 1: Plan
*Daily calendar view with full schedule, readiness, and AI insights — `TrainingScreen.tsx`*

| Feature | Description |
|---------|-------------|
| Day Navigation | Swipe or arrow buttons between days, "Today" quick button |
| Readiness Card | GREEN / YELLOW / RED status from daily check-in |
| Daily Flow Grid | 24-hour timeline showing all events color-coded by type |
| Event Types | Training (orange), Match (purple), Recovery (green), Study (blue), Exam (yellow) |
| Ghost Suggestions | AI-proposed blocks shown in lighter color — confirm or dismiss |
| Auto-Fill Week | Repeats a successful week pattern across the calendar |
| Day Lock | Prevents editing past/completed days |
| Add Event | FAB button to create Training, Match, Study, Exam, Recovery, or Other events |
| AI Insights | Contextual advice card from the 3-agent orchestrator |

### Tab 2: Chat (AI Command Center)
*3-agent AI orchestrator for conversational coaching — `HomeScreen.tsx` (default tab)*

- **Timeline Agent** — Calendar CRUD, schedule adjustments, conflict detection
- **Output Agent** — Readiness analysis, drill recommendations, benchmarks
- **Mastery Agent** — Progress tracking, CV building, skill development
- Suggestion chips for quick actions
- Session history with context preservation
- All write actions require user confirmation
- Personalized motivational quotes

### Tab 3: Dashboard
*Mode-first daily command centre with readiness signals, recommendations, and four sub-views — `SignalDashboardScreen.tsx`*

The Dashboard tab contains four sub-views, toggled via an underline tab switcher: **Dashboard / Programs / Metrics / Progress**.

#### Dashboard (overview)
- Athlete Mode hero card with current mode + quick mode switcher + panel pills
- Today's Plan card
- Daily Recommendations — expandable RIE recommendation cards (readiness, load, recovery, focus, motivation)
- CMS-driven sections (status rings, sparkline rows, content items)
- Up Next — future timeline activities with contextual AI hints

#### Programs
- AI-generated training programs personalized to position, age, benchmarks, and gaps
- Coach-assigned programs shown separately
- Priority groups: Must Do / Recommended / Supplementary
- Each program card shows: name, frequency, duration, difficulty, impact statement, coaching cues, prescription details
- **Actions**: Mark as Done, Dismiss ("Not for me") — with inline confirmation
- AI refreshes programs excluding dismissed ones

#### Metrics
- 97+ tests across 11 categories (Speed, Power, Agility, Endurance, Strength, Flexibility, Reaction, Balance, Body Comp, Sport Skills, BlazePod)
- Radar/spider chart showing attribute profile
- Percentile rankings with color zones (below/developing/competent/advanced/elite)
- Trend indicators per metric
- Strengths and gaps identification
- Vitals surfaced via status rings + sparkline rows (Recovery & Readiness, Sleep, Cardio Load, Activity, Body & Growth, Respiratory, Mental Load)
- WHOOP Connected/Connect banner, data source badges (WHOOP, HealthKit)

#### Progress
- **DNA Card** — Player archetype (Phoenix, Titan, Blade, Surge) with personality traits
- **7 Mastery Pillars** — Dual-layer benchmarks with mini trend charts
- **Streak System** — Consecutive activity days with tier badges (New → Legend)
- **Freeze Tokens** — Protect streak during rest days
- **Milestone Badges** — Achievement unlocks grid

### Supporting Screens

| Screen | Purpose |
|--------|---------|
| Profile | Avatar, name, archetype, points, level, edit profile, logout |
| Check-in | 7-step emoji wizard: energy, soreness, sleep, mood, effort, pain flag |
| Settings | Wearable connections (WHOOP, Apple Watch), notification prefs, privacy |
| Add Event | Create calendar events with type, date, time, duration, notes |
| Drill Detail | Full workout timer with countdown, sets, rest periods, audio/haptic cues |
| Drill Camera | Video capture with AI pose estimation for form feedback |
| Session Complete | Post-drill data entry (reps, reaction time, RPE, notes) + points awarded |
| My Rules | Schedule rules engine — school hours, sleep target, gaps, training categories, 4 scenario modes |
| Study Plan Preview | Calendar view of AI-generated study blocks with exam timeline |
| Favorites | Bookmarked drills for quick access |
| Notifications | Activity feed with read/unread state, "Mark All Read" |

---

## 3. Coach Experience

Coaches have a **2-tab interface** plus detail screens.

### Tab 1: Players
- List of all linked players as glass cards
- Per player: avatar, name, readiness dot, ACWR badge, streak, last active
- Tap to view player detail

### Tab 2: Coach Profile
- Coach info, team, credentials
- Settings link

### Player Detail (4 inner tabs)
| Tab | What coaches see |
|-----|-----------------|
| Timeline | Player's daily calendar (read-only) |
| Mastery | Player's DNA, pillars, streaks (read-only) |
| Programs | Coach-assigned programs, publish/unpublish |
| Tests | Player's test results, submit tests on behalf of player |

### Coach Actions
| Action | Description |
|--------|-------------|
| Submit tests for player | Enter test results from the 97-test catalog |
| Create program | Build training program with exercises, schedule, progression |
| Publish program | Assign program to one or more players |
| Recommend event | Suggest a calendar event (training, recovery, study) to a player |
| Generate invite code | 6-character code (48hr expiry) to link new players |
| View player readiness | 14-day readiness dot history |
| View ACWR | Acute:Chronic Workload Ratio risk assessment |

---

## 4. Parent Experience

Parents have a **2-tab interface** plus detail screens.

### Tab 1: Children
- List of linked children as glass cards
- Per child: avatar, name, age, sport, readiness dot, wellness trend, last active
- Tap to view child detail

### Tab 2: Parent Profile
- Parent info, consent management, settings

### Child Detail (3 inner tabs)
| Tab | What parents see |
|-----|-----------------|
| Timeline | Child's full daily schedule (training + academics, read-only) |
| Exams | Exam schedule, study plans, study block suggestions |
| Mastery | Child's progress (DNA, pillars, streaks, read-only) |

### Parent Actions
| Action | Description |
|--------|-------------|
| Add exam | Create exam event with subject, date, time, duration |
| Suggest study block | Propose study session with subject, time, duration, priority |
| Request study info | Notify child to provide academic details |
| Recommend event | Suggest recovery, study, or other activities |
| Generate invite code | 6-character code (48hr expiry) to link child's account |
| View child's calendar | Full read-only view of training + academic schedule |
| Monitor wellness | See readiness trend and wellness indicators |

---

## 5. Triangle: Coach-Player-Parent

The triangle relationship model connects coaches, players, and parents.

### Linking Accounts
1. **Invite Code** — Coach or parent generates a 6-character code (valid 48 hours)
2. **Player enters code** — via Link Account screen in settings
3. **Email Link** — Coach/parent can also link by entering player's email
4. **Approval** — Both parties must accept the relationship

### Visibility Matrix
| Data | Player | Coach | Parent |
|------|--------|-------|--------|
| Calendar events | Full access | Read-only | Read-only |
| Check-in / Readiness | Full access | Read-only | Read-only (wellness trend) |
| Test results | Full access | Read + Write | Read-only |
| Programs | View + Done/Dismiss | Create + Publish | Read-only |
| Mastery / Progress | Full access | Read-only | Read-only |
| Chat history | Full access | No access | No access |
| Vitals / Health | Full access | No access | No access |
| Study / Exams | Full access | No access | Read + Write |
| Notifications | Own notifications | Own + player alerts | Own + child alerts |

### Triangle Alerts
- Coach and parent can flag concerns via the TRIANGLE_ALERT recommendation type
- These appear in the player's Dashboard recommendations feed as high-priority alerts
- Enable coordinated support for the athlete

### Communication Flow
```
Coach ─── assigns programs, submits tests, recommends events ──→ Player
Parent ── adds exams, suggests study blocks, monitors wellness ──→ Player
Coach ←── views via player detail ─── Player ──→ views via child detail ──── Parent
```

---

## 6. AI Chat System

### 3-Agent Orchestrator
| Agent | Scope | Example Actions |
|-------|-------|----------------|
| Timeline | Calendar management | Create training block, reschedule match, detect conflicts |
| Output | Performance & readiness | Recommend drills, analyze test trends, assess readiness |
| Mastery | Progress & development | Track milestones, build CV, analyze attribute growth |

### 6-Layer Context Pipeline
1. **Player Memory** — Full athlete profile, history, preferences
2. **Temporal Context** — Day of week, match proximity, exam proximity
3. **Schedule Rules** — Active scenario (Normal/League/Exam), intensity caps
4. **Session History** — Previous conversation context
5. **Conversation State Extractor** — Referenced dates, events, drills, topics
6. **Intent Router + Agent Lock** — Routes to correct agent, maintains focus

### Write Action Gate
All create/update/delete actions require explicit user confirmation via a confirmation card before execution.

---

## 7. Wearable Integrations

### WHOOP
- OAuth2 connection via Settings
- Auto-sync on app open (if last sync > 1 hour)
- Initial sync: 30 days of historical data
- Ongoing sync: last 24 hours
- Data: HRV, resting HR, SpO2, skin temp, recovery score, sleep stages, workout strain, HR zones

### Apple Watch (HealthKit)
- Native HealthKit permissions
- Data: heart rate, HRV, steps, active calories, workouts, sleep
- iOS only (gracefully degrades on web/Android)

### Data Flow
```
Wearable → HealthKit/WHOOP API → Event Ingestion → Athlete Snapshot → My Vitals UI
```

---

## 8. Gamification

| System | Description |
|--------|-------------|
| Points | Awarded for check-ins, test submissions, drill completions, streak bonuses |
| Streaks | Consecutive days with 1+ activity. Tiers: New → Started → Building → Consistent → Dedicated → Veteran → Legend |
| Freeze Tokens | Protect streak during rest days (limited supply) |
| Archetypes | Player personality: Phoenix, Titan, Blade, Surge — with unique descriptions |
| Milestones | Achievement badges (first check-in, 7-day streak, 100 tests, etc.) |
| Levels | 1-10 based on total points |
| Leaderboards | Global, team, archetype, streak-based rankings |

---

## 9. API Reference Summary

### Public Endpoints (no auth)
- `GET /api/v1/content/*` — Content CMS (drills, quotes, sport data)
- `GET /api/v1/training/drills` — Drill catalog (except /recommend)
- `GET /api/health` — Health check

### Player Endpoints
- `/api/v1/checkin` — Daily check-in
- `/api/v1/calendar/*` — Calendar CRUD, ghost suggestions, auto-fill, day lock
- `/api/v1/chat/*` — AI chat (agent, sessions, messages, briefing, suggestions)
- `/api/v1/tests/*` — Test catalog, results, submissions
- `/api/v1/benchmarks/*` — Benchmark profiles, norms, trajectories
- `/api/v1/programs/*` — Programs, refresh, interact (done/dismiss)
- `/api/v1/output/snapshot` — Unified vitals + metrics + programs response
- `/api/v1/mastery/snapshot` — Mastery pillars, DNA, streaks
- `/api/v1/recommendations/*` — Own It recs, deep refresh
- `/api/v1/for-you` — Personalized feed
- `/api/v1/schedule/*` — Schedule rules, validation
- `/api/v1/events/ingest` — Event ingestion (athlete data fabric)
- `/api/v1/health-data` — Manual vitals
- `/api/v1/sleep/*` — Sleep sync + history
- `/api/v1/integrations/*` — WHOOP OAuth, sync, status
- `/api/v1/notifications/*` — Notification feed, read, settings
- `/api/v1/relationships/*` — Link coach/parent, invite codes
- `/api/v1/leaderboards/*` — Rankings (global, team, archetype, streaks)
- `/api/v1/points` / `/api/v1/streak` — Gamification data

### Coach Endpoints
- `/api/v1/coach/players` — Player list + detail
- `/api/v1/coach/players/[id]/calendar` — Player calendar (read)
- `/api/v1/coach/players/[id]/readiness` — Player readiness (read)
- `/api/v1/coach/players/[id]/tests` — Player tests (read + write)
- `/api/v1/coach/programmes` — Programme CRUD + publish
- `/api/v1/coach/drills` — Coach's custom drills

### Parent Endpoints
- `/api/v1/parent/children` — Children list
- `/api/v1/parent/children/[id]/calendar` — Child calendar (read)
- `/api/v1/parent/children/[id]/exam` — Exam management
- `/api/v1/parent/children/[id]/study-block` — Study block suggestions
- `/api/v1/parent/children/[id]/study-profile` — Academic profile
- `/api/v1/parent/children/[id]/notify-study-info` — Request study info

---

## Sports Supported
- **Football** (full feature set: 97 tests, position matrix, rating system, skill drills)
- **Padel** (shot tracking, rating, shot sessions)
- **Basketball, Tennis** (basic support — sport selection, generic training)

## Platforms
- **Web** — `app.my-tomo.com` (Expo Web on Vercel)
- **iOS** — Expo/React Native (EAS Build)
- **Android** — Expo/React Native (EAS Build)
