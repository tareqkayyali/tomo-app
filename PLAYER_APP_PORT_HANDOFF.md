# Player App Port — Handoff to Sonnet 4.6 (Extended Thinking)

**Context**: The previous session (Opus 4.7, 1M context) did a broad surgical sweep across 92 screens but didn't achieve pixel-perfect 1:1 ports of the 3 tab roots. User wants the exact design from Claude Design's `Player App.html` prototype reproduced.

## Read these FIRST before doing anything

1. **The design spec** — 18 files at `/tmp/kyrai-design/tomo/project/`:
   - `Player App.html` (entry point)
   - `shell.jsx` (tab-level shell — shows 3 tabs Timeline/Tomo/Signal, default=timeline)
   - `variant-arc.jsx` (Timeline tab content — DayDial + FocusCards + CheckinRow)
   - `pages.jsx` (Tomo Chat + Mastery + Own It + Output page content)
   - `signal-dashboard.jsx` (Signal tab — 4 sub-tabs, primary=Dashboard with AthleteModeHero + DailyRecCards + UpNext + coaching msg)
   - `primitives.jsx` (shared — TCard, TButton, ReadinessDot, EventGlyph, TomoHeader, WeekStrip, TabBar)
   - `data.jsx` (TOMO color tokens, EVENTS, READINESS, PLAYER, WEEK, COPY, DENSITY)
   - `signal-data.jsx`, `signal-subtabs.jsx` (Signal sub-tab data + content)
   - `sheets.jsx` (bottom sheets: EventSheet, CheckinSheet)

2. **The design README** — `/tmp/kyrai-design/tomo/README.md`
3. **The design chat transcript** — `/tmp/kyrai-design/tomo/chats/chat1.md` (1962 lines, back-and-forth that tells you what the user actually wants)

## Worktree location

**`/Users/tareqelkayyali/Desktop/Tomo/tomo-app-bond/`** (git worktree on branch `design/bond-phase-1`, node_modules symlinked to main tree).

**Do NOT work in `/Users/tareqelkayyali/Desktop/Tomo/tomo-app/`** — that's the main tree; the worktree isolates our changes.

## What's already done (don't redo)

### Phases 1–4 (Bond identity + icons + tokens)
- **Bond mark** replaces SignalArcs logo. Component: `mobile/src/components/tomo-ui/Bond.tsx`
- **108-icon Bond system** via hybrid `TomoIcon` resolver. Files: `mobile/src/components/tomo-ui/TomoIcon.tsx`, `mobile/src/components/tomo-ui/icons/tomoIconXml.ts` (198-entry XML manifest), `mobile/src/components/tomo-ui/icons/icons-manifest.ts`.
- **Theme tokens** in `mobile/src/theme/colors.ts` — has every Player App token: `sage08/12/15/30`, `cream03/06/08/10/15/20/50`, `body`, `muted`, `mutedDim`, `evTraining/Match/Recovery/Study/Exam/Other`, `tomoInk/Cream/Sage/SageDim/Clay/Steel`.
- **Zero Ionicons runtime imports** remain. All icons route through Bond → Arc → Phosphor fallback.

### Phase 5 (Player App shell sweep — 92 screens)
- **`PlayerScreen` shell** at `mobile/src/components/tomo-ui/playerDesign/PlayerScreen.tsx` — wraps screens with: ink bg, SafeArea, uppercase label + 20pt title, optional back chevron + right icon cluster, 20px gutter, 120px bottom pad.
- **89 pushed/stack screens** wrapped in `<PlayerScreen label=… title=… onBack=…>`. Profile / PlayerCV / Settings / Checkin / Notifications / Leaderboard / Favorites / History / Auth / Onboarding / Events / Tests / Dashboard sub-pages / Drills / Coach / Parent / Football / Padel / Diagnostics. Navigator `headerShown: true` flipped to `false` where needed (no double headers).
- **Tab bar** redesigned — 3 pills (Timeline / Tomo / Signal), sage15 active, scale 1.03, custom SVG glyphs, radial-gradient backdrop. File: `mobile/src/navigation/MainNavigator.tsx`.
- **Primitives library** at `mobile/src/components/tomo-ui/playerDesign/` (4 files + index):
  - `shared.tsx` — SectionLabel, SectionHeader, UnderlineTabs, ReadinessDot, PageTitle, TomoHeader, IconBtn, TCard, TButton
  - `chat.tsx` — ChatOrb, ChatBubble, QuickActionChip, ChatInputBar
  - `signal.tsx` — VitalCard, MiniSpark, LoadBar, ProgramRow, ArchetypeBadge, StatTile, DNARadar, JourneyRow, RecCard, MiniRec, DailyRecCard, UpNextRow, AthleteModeHero
  - `timeline.tsx` — WeekStrip, DayDial, FocusCard, CheckinRow
- **Animation hooks**: `mobile/src/hooks/useEnter.ts`, `mobile/src/hooks/usePulse.ts`.
- **App icons regenerated** as Bond: `mobile/assets/{icon,adaptive-icon,splash-icon,favicon}.png` (1024×1024 / 48×48).
- **Backend** — `lucide-react` replaced with BondIcon in `backend/app/admin/(app)/(planning)/enterprise/protocols/builder/page.tsx`; sprite at `backend/public/sprite.svg`; component at `backend/components/ui/bond-icon.tsx`.

### Cumulative stats
- **127 files changed**, tsc clean (0 new errors; 3 pre-existing baseline errors in `ProtocolBannerSection.tsx`).
- **No commits** — all changes uncommitted in the worktree.
- **Metro running** on port 8084 (`expo start --port 8084 --clear`). URL for Expo Go: `exp://192.168.1.35:8084`.

## What's NOT done — your job

**The 3 tab-root screens still render with old content inside.** They have Player App headers but the content below is the existing pre-design components (UnifiedDayView, WarmWelcomeCard, DashboardSectionRenderer). User wants these replaced with 1:1 ports of the design.

### Screen 1 — `mobile/src/screens/TrainingScreen.tsx` (Timeline tab)
**Current**: header + broken DayDial (ring too bright, labels clipping) + UnifiedDayView.

**Goal**: port `variant-arc.jsx` exactly. The tab should render, top→bottom:
1. TomoHeader with Bond mark + "Hey Tareq" + "Phoenix · 12-day streak" + bell + menu (or checkin + bell + avatar cluster)
2. WeekStrip (7 pills with readiness dots — already in primitives)
3. DayDial (24h radial clock — already in primitives but needs visual fix: ring bg is rendering way too prominent; see `mobile/src/components/tomo-ui/playerDesign/timeline.tsx` DayDial component; the stopColor/stopOpacity in the `ringBg` LinearGradient just got reset to explicit `#F5F3ED` + `stopOpacity=0.05/0.02` which should fix rendering; also radii were shrunk so labels don't clip)
4. FocusCard "Right now" (current event, sage accent) — already in primitives
5. FocusCard "Next up" (next event) — already in primitives
6. CheckinRow (Check in / Plan day buttons) — already in primitives

**Data wiring**: `selectedDay`, `dayEvents`, `isToday` already derived in TrainingScreen. Need to compute `nowEvent` and `nextEvent` from `dayEvents`. Readiness score + label should come from `useCheckinStatus` / `useCalendarData` / bootData (currently hardcoded to 82/"Recovered" — unwire the hardcode).

**Delete**: `<UnifiedDayView>` from this screen. Its event-complete/skip/edit handlers need to live on `FocusCard` onPress or on the dial-arc tap (route to `EventEdit`).

### Screen 2 — `mobile/src/screens/HomeScreen.tsx` (Tomo Chat tab)
**Current**: my Phase 5 surgical edits — orb + title + input pill. Empty state had WarmWelcomeCard + QuoteCard overlap (I removed), replaced with NextBlockLine + ChatActionPills. Message rendering still uses existing `ChatBubble` component in `mobile/src/components/chat/ChatBubble.tsx`.

**Goal**: port `pages.jsx PageChat` exactly:
1. TomoHeader (same as Timeline)
2. Large ChatOrb (96px, pulsing) ✓
3. "Tomo" title + "Your coach. Always on." ✓
4. Message list with asymmetric bubbles — **swap existing `ChatBubble` to new `ChatBubble` primitive from `playerDesign/chat.tsx`** (sage08 bg + sage30 border, 14px radius with 4px bottom-left corner for Tomo, cream06 bg + 4px bottom-right for user)
5. Quick action row — 4 chips horizontal scroll (use `QuickActionChip` primitive). Design copy: "Plan tomorrow", "I'm feeling off", "Match in 3 days — talk me through it", "What's my streak?"
6. Pill input bar ✓ (use `ChatInputBar` primitive, not the inline one)

**Data wiring**: `messages` state + `sendMessage` + session logic is in HomeScreen — wire those hooks into the new `ChatBubble` render loop. Pending confirmation actions (capsule flow) render inline as confirm cards — preserve that.

**Delete from empty state**: `WarmWelcomeCard`, `NextBlockLine`, `QuoteCard`, inline `ChatActionPills`. Replace with the design's exact layout.

### Screen 3 — `mobile/src/screens/SignalDashboardScreen.tsx` (Signal tab)
**Current**: uses `DashboardSectionRenderer` (CMS-driven), `AthleteModeHero` (existing), `DailyRecommendations`, `UpNext` sections. Has sub-tabs (Dashboard / Programs / Metrics / Progress) via `UnderlineTabSwitcher`.

**Goal for Dashboard sub-tab**: port `signal-dashboard.jsx DashboardSubTab` + `pages.jsx PageOutput` compositions:
1. Header: "SIGNAL / {displayName}" ✓
2. `UnderlineTabs` for sub-tabs ✓ (already in primitives)
3. `AthleteModeHero` from primitives (not the existing one) — wire to real current mode
4. Daily recommendations: 3 `DailyRecCard` components — wire to `bootData.dashboardRecs`
5. "Today's session" card with sage left-accent
6. "Up next" list of 2–3 `UpNextRow` — wire to real upcoming events
7. "Tomo's take" coaching message in sage-tinted TCard

**For Programs / Metrics / Progress sub-tabs**: port PageOutput vitals grid + LoadBar weekly + ProgramRow list, PageMastery DNARadar + archetype + journey, PageOwnIt RecCard stack + MiniRec weekly goals. Use the primitives — they're all built.

**Preserve**: the sub-tab switching logic, CMS gating, `useCheckinStatus`, `useBootData` hooks.

## Verification loop

1. User's phone on Expo Go at `exp://192.168.1.35:8084`. Metro is running — HMR should pick up edits.
2. After each tab port: user sends a screenshot. Compare to design spec visually.
3. The design prototype can be rendered via `open /tmp/kyrai-design/tomo/project/"Player App.html"` in a browser — use that as visual reference.
4. `cd /Users/tareqelkayyali/Desktop/Tomo/tomo-app-bond/mobile && ./node_modules/.bin/tsc --noEmit 2>&1 | grep -v ProtocolBannerSection` to typecheck. Must stay clean.

## Gotchas / things to preserve

- **Business logic is sacred**: AI chat session state, RIE pipeline, readiness calc, check-in daily-unique constraint, capsule flow, exam planner, RAG, event pipeline, Supabase writes. Don't break any of these.
- **Immersive states**: phone-test LIVE states (countdown/recording/result), camera screens — these bypass PlayerScreen entirely when active. Subagent batches already handled this correctly.
- **No emojis anywhere in code** (memory rule).
- **Don't commit without explicit user approval** (memory rule).
- **Don't push to main** (Railway auto-deploys).
- **`tomo-app-bond/mobile/node_modules` is a symlink** to main tree — don't `npm install` in the worktree.

## Current state of DayDial (already partially fixed)

The ring bg gradient was overpowering because React Native SVG didn't parse rgba stopColors. I just swapped to explicit `stopColor="#F5F3ED"` + `stopOpacity` props in `timeline.tsx`. Also shrunk radii (`R_OUTER = 0.40 * size`, previously `0.4625`) so hour labels ("12AM", "6AM", "12PM", "6PM") fit inside the SVG bounds without clipping.

User's screenshot showed the ring rendering as solid-white-like — should now render subtle after HMR.

## Open questions for the user (ask before you start)

1. Timeline: is it OK to fully delete `UnifiedDayView` from that tab? Its event CRUD logic needs to live somewhere — will move to the EventEdit screen (already supports it) + inline FocusCard press handlers.
2. Signal: keep the 4 sub-tabs (Dashboard/Programs/Metrics/Progress) or collapse to single scrollable page?
3. The 3 icon buttons top-left on Chat tab (Saved Chats / New Chat / My Rules) — design doesn't have these. Move to a menu kebab, or keep as circular buttons matching the top-right cluster's look?

## Suggested first move for the next model

1. Read this entire handoff.
2. Read `variant-arc.jsx` top-to-bottom.
3. Rewrite `TrainingScreen.tsx` as a 1:1 port. Keep only these imports from the old one: `useCalendarData`, `useCheckinStatus`, `useScheduleRules`, `useDayLock`, and the event CRUD handlers. Delete the UnifiedDayView render.
4. User sends screenshot. Iterate until it matches `Player App.html` Timeline tab visually.
5. Move to Chat tab.
6. Move to Signal tab.

Do NOT try to do all 3 tabs in one shot without user feedback in between. User specifically chose this iterative approach.
