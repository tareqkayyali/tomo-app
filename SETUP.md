# Tomo — New Machine Setup Guide

> Complete step-by-step guide to set up the Tomo development environment **from scratch** on a brand new Mac.
> Points to the **same production Supabase + Vercel instances**.

---

## Step 0: Fresh Mac — Install Prerequisites

Open Terminal and run each block. These are one-time installs.

### 0a. Homebrew (macOS package manager)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# After install, follow the "Next steps" printed in terminal to add brew to PATH:
# (Apple Silicon Macs)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 0b. Core Tools
```bash
# Git
brew install git

# Node.js (v24+ required)
brew install node

# Verify versions
node -v   # Should show v24.x
npm -v    # Should show 11.x
git -v    # Should show 2.x
```

### 0c. Development Tools
```bash
# Supabase CLI (local database)
brew install supabase/tap/supabase

# Vercel CLI (deployment)
npm install -g vercel

# Claude Code (AI coding assistant)
npm install -g @anthropic-ai/claude-code

# Docker Desktop (required by Supabase local)
# Download from: https://www.docker.com/products/docker-desktop/
# Install, open it, and make sure it's running before using `supabase start`
```

### 0d. Optional — Code Editor
```bash
# VS Code
brew install --cask visual-studio-code

# Or Cursor
brew install --cask cursor
```

---

## Step 1: Clone the Repository

```bash
# Create project directory
mkdir -p ~/Desktop/Tomo
cd ~/Desktop/Tomo

# Clone from GitHub
git clone https://github.com/tareqkayyali/tomo-app.git
cd tomo-app

# Verify structure
ls
# Should show: CLAUDE.md  SETUP.md  backend/  mobile/  .claude/  .gitignore
```

### 1a. Configure Git Identity (if not already set)
```bash
git config --global user.name "Tareq El Kayyali"
git config --global user.email "your-email@example.com"
```

### 1b. GitHub Authentication
```bash
# Option A: SSH key (recommended)
ssh-keygen -t ed25519 -C "your-email@example.com"
cat ~/.ssh/id_ed25519.pub
# Copy output → GitHub.com → Settings → SSH Keys → New SSH Key

# Option B: GitHub CLI
brew install gh
gh auth login
```

---

## Step 2: Backend Setup

```bash
cd ~/Desktop/Tomo/tomo-app/backend
npm install
```

### 2a. Environment Files

The repo includes `.env.local.local` (local Supabase) and `.env.local.production` (prod Supabase).

**Switch to production:**
```bash
./scripts/switch-env.sh prod
```

**Switch to local:**
```bash
./scripts/switch-env.sh local
```

**Add your AI keys** to both env files:
```bash
# In .env.local.local AND .env.local.production:
ANTHROPIC_API_KEY=sk-ant-api03-...   # Get from console.anthropic.com/settings/keys
GEMINI_API_KEY=...                    # Get from aistudio.google.com/apikey
```

### 2b. Local Supabase (Optional — for offline dev)

> **Requires Docker Desktop running.** Open Docker Desktop first.

```bash
# Start local Supabase (ports offset +100 to avoid conflicts)
npx supabase start
# First run downloads Docker images (~2-5 min)
# Subsequent starts are fast (~10s)

# Reset DB + run all 16 migrations + seed data
npx supabase db reset

# Generate TypeScript types from local schema
npx supabase gen types typescript --local > types/database.ts
```

**Local Supabase ports:**
| Service | Port | URL |
|---------|------|-----|
| API | 54421 | http://127.0.0.1:54421 |
| PostgreSQL | 54422 | postgres://localhost:54422 |
| Studio (DB UI) | 54423 | http://127.0.0.1:54423 |
| Email (Inbucket) | 54424 | http://127.0.0.1:54424 |

### 2c. Start Backend Dev Server

```bash
npm run dev
# → http://localhost:3000
```

### 2d. Verify

```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok"}
```

---

## 3. Frontend (Mobile) Setup

```bash
cd ../mobile
npm install
```

### 3a. Environment

The `.env` file is already configured for production:
```
EXPO_PUBLIC_SUPABASE_URL=https://ydtnhxqwvtnypjisaavm.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
EXPO_PUBLIC_API_URL=https://api.my-tomo.com
```

**For local development** (pointing to local backend), either:
- Remove `EXPO_PUBLIC_API_URL` from `.env` (auto-detects localhost:3000)
- Or set: `EXPO_PUBLIC_API_URL=http://localhost:3000`

### 3b. Start Frontend

```bash
# Web (primary dev mode)
npm run web
# → http://localhost:8081

# iOS Simulator
npm run ios

# Android Emulator
npm run android
```

### 3c. API URL Resolution (Auto)

The frontend auto-detects the backend URL:
1. `EXPO_PUBLIC_API_URL` env var (if set)
2. Production build → `https://api.my-tomo.com`
3. Dev mode → extracts host IP from Expo debugger → `http://<ip>:3000`
4. Android emulator → `http://10.0.2.2:3000`
5. iOS simulator / web → `http://localhost:3000`

---

## 4. Vercel Setup (Deployment)

### 4a. Login & Link

```bash
# Login to Vercel (opens browser for auth)
vercel login

# Link the backend project
cd ~/Desktop/Tomo/tomo-app/backend
vercel link
# When prompted:
#   → Set up? Yes
#   → Which scope? tareqkayyalis-projects
#   → Link to existing project? Yes
#   → Project name? backend

# You do NOT need to link mobile/ — the deploy script handles it via project.json
```

### 4b. Project IDs (Reference)

The Vercel project IDs are hardcoded in the deploy scripts:

| Project | Vercel ID | Domain |
|---------|-----------|--------|
| Backend | `prj_N6gEOSuVnwS5QypgzCH2bSxpI4De` | api.my-tomo.com |
| Frontend | `prj_q1uTcXazyBCVTQRkJNQxblofVkNQ` | app.my-tomo.com |
| Org | `team_O05XelWPyLJ2yHVFmmzjYqjc` | — |

### 4c. Vercel Environment Variables (Production)

These must be set in the **Vercel Dashboard** → backend project → Settings → Environment Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ydtnhxqwvtnypjisaavm.supabase.co` | Production Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Service role (server-only) |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Claude API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Model name |
| `GEMINI_API_KEY` | `...` | Gemini fallback |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Model name |

### 4d. Deploy Commands

```bash
# ═══ BACKEND DEPLOY ═══
cd backend
npx vercel --prod --yes --scope tareqkayyalis-projects
# Verify: "Aliased: https://api.my-tomo.com"

# ═══ FRONTEND DEPLOY ═══
cd ../mobile
npx expo export --platform web

# CRITICAL: expo export wipes dist/ — must recreate Vercel link
mkdir -p dist/.vercel && echo '{"projectId":"prj_q1uTcXazyBCVTQRkJNQxblofVkNQ","orgId":"team_O05XelWPyLJ2yHVFmmzjYqjc"}' > dist/.vercel/project.json

cd dist && npx vercel --prod --yes --scope tareqkayyalis-projects
# Verify: "Aliased: https://app.my-tomo.com"
```

---

## 5. Claude Code Setup

### 5a. Install & First Run

```bash
# Install (if not done in Step 0)
npm install -g @anthropic-ai/claude-code

# Navigate to project root and start Claude Code
cd ~/Desktop/Tomo/tomo-app
claude
# First run will prompt for Anthropic auth — follow the browser flow
```

### 5b. What Claude Code Reads Automatically

The repo includes all Claude Code config — no manual setup needed:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project overview, commands, architecture |
| `SETUP.md` | This setup guide |
| `.claude/launch.json` | Dev server launch configs (backend :3000, frontend :8081) |
| `.claude/projects/.../memory/MEMORY.md` | Persistent codebase memory (deployment, theme, patterns) |

### 5c. Launch Dev Servers via Claude Code

Claude Code can start both servers using the launch config:
```
# Inside a Claude Code session, it can run:
# Backend → npm run dev (port 3000)
# Frontend → npx expo start --web --port 8081
```

### 5d. Required Skills

Every Tomo session should activate these two skills:
1. **athlete-performance-director** — Sports science lens for training/readiness decisions
2. **genz-ux-designer** — Gen Z UX lens for all UI/product decisions

### 5e. Claude Code Memory

Memory files persist across conversations. The existing memory at `.claude/projects/.../memory/MEMORY.md` contains:
- Deployment architecture & exact deploy commands
- Content CMS migration details
- Supabase SQL safety policy
- App tab structure (3 tabs with canonical names)
- Chat AI 6-layer context pipeline architecture
- Schedule rule engine details
- UI theme & component system (colors, typography, spacing, patterns)
- Athlete Data Fabric (event sourcing) architecture

---

## 6. Production Infrastructure

### Supabase (Production)

| Property | Value |
|----------|-------|
| Project | ydtnhxqwvtnypjisaavm |
| URL | https://ydtnhxqwvtnypjisaavm.supabase.co |
| Region | (check dashboard) |
| PostgreSQL | v17 |
| Tables | 23+ |
| RLS | Enabled on all user tables |

**Dashboard**: https://supabase.com/dashboard/project/ydtnhxqwvtnypjisaavm

**Important**: NEVER run SQL against production programmatically. Always copy SQL into the Supabase SQL Editor manually.

### Vercel (Production)

| Property | Backend | Frontend |
|----------|---------|----------|
| Project | backend | tomo-web |
| Domain | api.my-tomo.com | app.my-tomo.com |
| Framework | Next.js 16 | Static (Expo web export) |
| Functions | Yes (60s max for AI) | No |

---

## 7. Database Migrations

16 migrations in `backend/supabase/migrations/`:

| # | File | Purpose |
|---|------|---------|
| 1 | `00000000000001_schema.sql` | Core schema (users, checkins, plans, points, chat, calendar) |
| 2 | `00000000000002_add_user_columns.sql` | User profile extensions |
| 3 | `00000000000003_add_football_sport.sql` | Football sport type |
| 4 | `00000000000004_content_tables.sql` | Content CMS (8 tables) |
| 5 | `00000000000005_football_test_results.sql` | Football test results |
| 6 | `00000000000006_padel_shot_results.sql` | Padel shot data |
| 7 | `00000000000007_multi_role.sql` | Multi-role (coach/parent/player) |
| 8 | `00000000000008_calendar_events_columns.sql` | Calendar enhancements |
| 9 | `00000000000009_training_drills.sql` | Drill catalog |
| 10 | `00000000000010_player_schedule_preferences.sql` | Schedule rules |
| 11 | `00000000000011_athlete_events.sql` | Event sourcing (Layer 1) |
| 12 | `00000000000012_athlete_snapshots.sql` | Snapshots (Layer 2) |
| 13 | `00000000000013_athlete_daily_load.sql` | Daily load tracking |
| 14 | `00000000000014_calendar_load.sql` | Calendar load metrics |
| 15 | `00000000000015_athlete_recommendations.sql` | AI recommendations |
| 16 | `00000000000016_rag_knowledge_chunks.sql` | RAG knowledge base |

**Run locally:**
```bash
cd backend
npx supabase db reset   # Wipes + re-runs all migrations + seed
```

**Push to production:**
```bash
npx supabase db push    # Apply new migrations to remote
```

---

## 8. Architecture Quick Reference

### Auth Flow
```
Mobile App → Bearer token (JWT) → proxy.ts validates → sets x-user-id header → API route
Web App   → Supabase cookies    → proxy.ts validates → sets x-user-id header → API route
```

### Athlete Data Fabric (Event Sourcing)
```
Action → POST /events/ingest → athlete_events (immutable log)
  → DB Webhook → POST /events/process → eventProcessor.ts
  → Handler updates athlete_snapshots (pre-computed metrics)
  → Supabase Realtime → subscribed clients
```

### AI Architecture
```
Chat tab: 3-agent orchestrator (Timeline, Output, Mastery — backend agents)
  → contextBuilder.ts (10 parallel data fetches → PlayerContext)
  → Agent-specific system prompt + tools
  → Claude API → structured response

Dashboard recommendations: deepRecRefresh.ts
  → Same PlayerContext pipeline
  → Claude generates 4-6 diversified recs
  → Stored in athlete_recommendations table
```

### App Tabs (3 tabs, default route: Chat)
1. **Plan** — `TrainingScreen.tsx` (calendar, daily flow, schedule, AI insights)
2. **Chat** — `HomeScreen.tsx` (AI Command Center, default tab)
3. **Dashboard** — `SignalDashboardScreen.tsx` (four sub-views: Dashboard overview / Programs / Metrics / Progress — absorbed the old Output, Mastery, and Own It tabs)

---

## 9. Common Commands Cheat Sheet

```bash
# ─── Backend ───
cd backend
npm run dev                              # Dev server :3000
npm run build                            # Production build
npx tsc --noEmit                         # Type check
./scripts/switch-env.sh local            # Use local Supabase
./scripts/switch-env.sh prod             # Use production Supabase

# ─── Supabase ───
npx supabase start                       # Start local Supabase
npx supabase stop                        # Stop local Supabase
npx supabase db reset                    # Reset + migrations + seed
npx supabase gen types typescript --local > types/database.ts
npx supabase migration new <name>        # Create new migration

# ─── Frontend ───
cd mobile
npm run web                              # Expo web :8081
npm run ios                              # iOS simulator
npm run android                          # Android emulator

# ─── Deploy ───
# Backend
cd backend && npx vercel --prod --yes --scope tareqkayyalis-projects

# Frontend
cd mobile && npx expo export --platform web
mkdir -p dist/.vercel && echo '{"projectId":"prj_q1uTcXazyBCVTQRkJNQxblofVkNQ","orgId":"team_O05XelWPyLJ2yHVFmmzjYqjc"}' > dist/.vercel/project.json
cd dist && npx vercel --prod --yes --scope tareqkayyalis-projects
```

---

## 10. Complete From-Scratch Checklist

Copy-paste this entire block into Terminal on your new Mac:

### Phase 1: Install Tools (~10 min)
```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Core tools
brew install git node
npm install -g vercel @anthropic-ai/claude-code
brew install supabase/tap/supabase

# Download & install Docker Desktop from https://docker.com/products/docker-desktop/
```

### Phase 2: Clone & Install (~5 min)
```bash
mkdir -p ~/Desktop/Tomo && cd ~/Desktop/Tomo
git clone https://github.com/tareqkayyali/tomo-app.git
cd tomo-app

# Install all dependencies
cd backend && npm install && cd ../mobile && npm install && cd ..
```

### Phase 3: Configure (~3 min)
```bash
cd backend

# Add your Anthropic API key to both env files
# Get key from: https://console.anthropic.com/settings/keys
# Edit these files and paste your key after ANTHROPIC_API_KEY=
nano .env.local.local        # Local env
nano .env.local.production   # Production env

# Switch to production Supabase (or 'local' if using local DB)
./scripts/switch-env.sh prod
cd ..
```

### Phase 4: Verify (~2 min)
```bash
# Start backend
cd backend && npm run dev &

# Wait for it to start, then test
sleep 5
curl http://localhost:3000/api/health
# Should return: {"status":"ok"}

# Start frontend (in a new terminal)
cd ~/Desktop/Tomo/tomo-app/mobile && npm run web
# Open http://localhost:8081 — app should load
```

### Phase 5: Connect Vercel (~2 min)
```bash
vercel login
cd ~/Desktop/Tomo/tomo-app/backend && vercel link
# Scope: tareqkayyalis-projects → Link existing → "backend"
```

### Phase 6: Start Claude Code
```bash
cd ~/Desktop/Tomo/tomo-app
claude
# Auth with Anthropic, then you're ready to develop!
```

### Verification Checklist
- [ ] `node -v` shows v24+
- [ ] `git clone` succeeded
- [ ] `npm install` succeeded for both backend/ and mobile/
- [ ] `ANTHROPIC_API_KEY` added to env files
- [ ] http://localhost:3000/api/health returns `{"status":"ok"}`
- [ ] http://localhost:8081 loads the Tomo app
- [ ] `vercel login` authenticated
- [ ] `claude` starts successfully in project root
- [ ] (Optional) Docker Desktop installed for local Supabase
