# Tomo Rive Animations

Place `.riv` files here. Metro is configured to bundle them as assets.

## Expected Files

### 1. readiness-pulse.riv
**Purpose:** Loading/transition state for the CoachNote readiness indicator.
**When it plays:** While readiness data is loading on the Mastery screen.

| Property | Value |
|---|---|
| Artboard size | 60 x 60 px |
| Background | Transparent |
| Visual | Concentric circles pulsing outward from center |
| Default color | Green (#30D158) |

**State Machine: `readinessStateMachine`**

| Input | Type | Description |
|---|---|---|
| `isLoading` | Boolean | `true` = loop pulse animation, `false` = stop |
| `colorMode` | Number | `0` = green, `1` = yellow, `2` = red |

**States:**
- `loading` — Circles pulse outward continuously (loop)
- `idle` — Static, no animation
- Transition: `isLoading` false triggers `loading` → `idle`

---

### 2. score-reveal.riv
**Purpose:** Animated number count-up when pillar scores appear.
**When it plays:** On PillarCard mount, score counts from 0 to target.

| Property | Value |
|---|---|
| Artboard size | 48 x 32 px |
| Background | Transparent |
| Visual | Digits rolling/scrolling upward like an odometer |
| Font | Match Kalam Bold style (or closest Rive equivalent) |
| Color | White (#FFFFFF) — tinted via code at runtime |

**State Machine: `scoreStateMachine`**

| Input | Type | Description |
|---|---|---|
| `targetScore` | Number | 0–100, the final score to count up to |
| `trigger` | Trigger | Fire to start the count-up animation |

**States:**
- `idle` — Shows "0" or last value
- `counting` — Digits animate upward to `targetScore` over ~800ms
- `complete` — Holds final number

---

### 3. pr-celebration.riv
**Purpose:** One-shot celebration burst when athlete hits a personal record.
**When it plays:** After a test result is saved that exceeds the previous best.

| Property | Value |
|---|---|
| Artboard size | 200 x 200 px |
| Background | Transparent |
| Visual | Subtle confetti/spark particles + brief flash, dark-bg compatible |
| Particle colors | Orange (#FF6B35), Teal (#00D9FF), Gold (#FFD700), White |

**State Machine: `celebrationStateMachine`**

| Input | Type | Description |
|---|---|---|
| `celebrate` | Trigger | Fire once to play the celebration |

**States:**
- `idle` — Nothing visible (transparent)
- `celebrating` — Particles burst outward + flash (plays once, ~1.2s)
- Auto-transitions back to `idle` after completion

---

## How to Create These

### Option A: Build from scratch in Rive Editor
1. Go to [rive.app](https://rive.app) and sign in
2. Create a new file for each animation
3. Follow the artboard sizes and state machine specs above
4. Export as `.riv` and place in this folder

### Option B: Fork from Rive Community
1. Search [rive.app/community](https://rive.app/community/) for:
   - "pulse" or "loading" → fork and recolor for readiness-pulse
   - "counter" or "number" → fork for score-reveal
   - "confetti" or "celebration" → fork for pr-celebration
2. Adjust colors to Tomo palette (orange #FF6B35, teal #00D9FF, green #30D158)
3. Rename state machines to match the specs above
4. Export as `.riv`

## Usage in Code

```tsx
import Rive from 'rive-react-native';

// Load from assets
<Rive
  resourceName="readiness-pulse"  // filename without .riv
  stateMachineName="readinessStateMachine"
  style={{ width: 60, height: 60 }}
/>
```

The `useRiveAnimation` hook (to be created in `/src/hooks/`) will wrap this with a cleaner API.
