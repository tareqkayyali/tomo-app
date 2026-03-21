# Coach & Parent Portal Rebuild Plan

## Goals
1. **Coach portal restructured** — All views under player name (like parent), Settings/Profile stays in main view
2. **Gen Z design refresh** — Both portals match the player app's design system (glass cards, organic shapes, glow effects, Poppins typography)
3. **Fill gaps** — Player relationship management, suggestions workflow, dynamic test templates
4. **My Programs fix** — Ensure AI programs render properly with real content

---

## Architecture Change: Coach Portal

### Current Structure (3 bottom tabs)
```
CoachTabs:
  Players (grid) → CoachPlayerDetail (2 tabs: Timeline | Mastery)
  Programmes (DrillBuilder)
  Settings
```

### New Structure (player-centric, like parent)
```
CoachTabs:
  Players (list) → tap player → CoachPlayerDetail (4 tabs: Timeline | Mastery | Programmes | Tests)
  Settings/Profile (main tab)
```

**Key change**: Remove "Programmes" as a standalone bottom tab. Move drill builder INSIDE CoachPlayerDetailScreen as the "Programmes" inner tab. This means a coach always manages programmes in context of a specific player, not globally.

The bottom tab bar becomes just **2 tabs**: `Players` | `Profile`

---

## Step-by-Step Build Order

### Step 1: Fix My Programs (frontend only)
- Debug why AI programs don't render after refresh
- Ensure `ProgramsSection.tsx` properly maps `DeepProgramResult` data to UI
- Add loading skeleton, empty state, and AI badge rendering

### Step 2: Rebuild Coach Navigation Types
Update `navigation/types.ts`:
```typescript
CoachTabParamList = {
  Players: undefined;
  CoachProfile: undefined;   // replaces "Settings" — now Profile + Settings combined
};

CoachStackParamList = {
  CoachTabs: undefined;
  CoachPlayerDetail: { playerId: string; playerName: string };
  CoachTestInput: { playerId: string; playerName: string };
  CoachInvite: undefined;
  RecommendEvent: { playerId: string; playerName: string; allowedTypes: string[] };
};
```

### Step 3: Rebuild CoachPlayersScreen (Gen Z)
- Glass card list (not 2-column grid — mobile-first single column)
- Each card: avatar circle (initials), player name (semiBold), sport pill badge, readiness RAG dot, ACWR chip, streak flame, "last active" relative time
- GlassCard with organic border radius
- QuickAccessBar at top with: Invite Code (teal) + Notifications + Profile
- Standard header pattern (TOMO · WEEKDAY + "My Players" title)
- Pull-to-refresh with orange tint
- Empty state: glass card with illustration + "Share your invite code" CTA gradient button

### Step 4: Rebuild CoachPlayerDetailScreen (Gen Z, 4 tabs)
- Player header: GlassCard with avatar, name, sport badge, readiness score circle, ACWR badge, 14-day dots
- **4 inner tabs** (underline style matching PlanTabSwitcher): Timeline | Mastery | Programmes | Tests
- Timeline: existing UnifiedDayView (read-only for coach)
- Mastery: existing ProgressScreen with targetPlayerId
- Programmes: NEW — programme list + builder for THIS player
- Tests: NEW — recent results + inline test logger

### Step 5: Build ProgrammesTab (coach inner tab)
- List of programmes assigned to this player
- Each programme: GlassCard with title, date range badge, drill count, status (active/draft/completed)
- "Create Programme" gradient button at bottom
- Tap programme → inline expand with week/day drill grid (simplified DrillBuilder)
- Publish to player's calendar with confirmation

### Step 6: Build TestsTab (coach inner tab)
- Recent test results grouped by category (Speed, Power, Endurance, Strength, Agility)
- Each result: glass row with test name, value, unit, date, trend arrow (vs previous)
- "Log New Tests" section below with:
  - Search input (no border, glass bg) → searches `testTemplates` (frontend-side for now)
  - Category filter chips (All | Speed | Power | etc.)
  - Selected tests queue with value inputs
  - Date picker (defaults today)
  - "Save All" gradient button with haptic feedback

### Step 7: Rebuild CoachSettingsScreen → CoachProfileScreen
- Merge Settings + Profile into one screen
- Profile card at top (GlassCard: avatar, name, email, role badge)
- Stats row: players count, programmes count
- Settings sections: Invite Code, Notifications, Edit Profile
- Logout button (ghost variant, error color)

### Step 8: Rebuild CoachNavigator
- 2-tab bottom nav: Players | Profile
- Stack wraps: CoachTabs → CoachPlayerDetail → CoachTestInput → CoachInvite
- Standard header with NotificationBell + HeaderProfileButton

---

## Parent Portal Rebuild

### Step 9: Rebuild ParentChildPlanScreen (Gen Z)
- Child selector: horizontal scroll glass chips with avatar + name
- Day view with glass cards for events
- Readiness indicator chip at top
- Standard header pattern

### Step 10: Rebuild ParentExamScreen (Gen Z)
- Glass cards for exams with emoji, subject, type badge, countdown
- Urgent badge (≤3 days) with glow effect
- FAB with gradient for "Add Exam"

### Step 11: Rebuild ParentMasteryScreen (Gen Z)
- Child selector chips
- ProgressScreen wrapper with Gen Z header

### Step 12: Rebuild ParentSettingsScreen → ParentProfileScreen
- Same pattern as CoachProfileScreen
- Profile + settings merged
- Children count, invite code, notifications, logout

### Step 13: Update ParentNavigator
- Rename "Settings" tab to "Profile"
- Keep 4 tabs: Timeline | Exams | Mastery | Profile

---

## Gap Features

### Step 14: Player Relationship Management
- New screen in player app: `LinkAccountScreen.tsx` (already in nav types as `LinkAccount`)
- Accessible from player's Profile/Settings
- Shows: connected coaches (with revoke), connected parents (with revoke), pending requests (accept/decline)
- Generate invite codes for coach or parent
- Glass card list with role badges

### Step 15: Suggestions Workflow UI (deferred to next session)
- This is the most complex gap (requires cross-role approval cards, notification handling)
- Mark as future enhancement

### Step 16: Dynamic Test Templates (deferred to next session)
- Connect `sport_test_definitions` from DB instead of hardcoded
- Mark as future enhancement — current hardcoded templates work fine

---

## Files to Create/Modify

### New Files
- `mobile/src/components/coach/ProgrammesTab.tsx`
- `mobile/src/components/coach/TestsTab.tsx`
- `mobile/src/components/coach/TestLogger.tsx`
- `mobile/src/screens/coach/CoachProfileScreen.tsx` (replaces CoachSettingsScreen)
- `mobile/src/screens/parent/ParentProfileScreen.tsx` (replaces ParentSettingsScreen)

### Modified Files
- `mobile/src/navigation/types.ts` — Coach tab/stack types
- `mobile/src/navigation/CoachNavigator.tsx` — 2-tab layout
- `mobile/src/navigation/ParentNavigator.tsx` — Rename Settings → Profile
- `mobile/src/screens/coach/CoachPlayersScreen.tsx` — Full Gen Z redesign
- `mobile/src/screens/coach/CoachPlayerDetailScreen.tsx` — 4 tabs + Gen Z
- `mobile/src/screens/coach/index.ts` — Export new screens
- `mobile/src/screens/parent/ParentChildPlanScreen.tsx` — Gen Z polish
- `mobile/src/screens/parent/ParentExamScreen.tsx` — Gen Z polish
- `mobile/src/screens/parent/ParentMasteryScreen.tsx` — Gen Z polish
- `mobile/src/screens/parent/index.ts` — Export new screens
- `mobile/src/components/output/ProgramsSection.tsx` — Fix AI programs rendering

### Deleted Files
- `mobile/src/screens/coach/CoachSettingsScreen.tsx` (replaced by CoachProfileScreen)
- `mobile/src/screens/parent/ParentSettingsScreen.tsx` (replaced by ParentProfileScreen)

---

## Deploy Plan
1. Build all changes
2. Type check: `cd mobile && npx tsc --noEmit`
3. Expo export + Vercel deploy (standard flow from MEMORY.md)
4. Hard-refresh and test both portals
