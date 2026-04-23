# Tomo — AI Coaching Platform for Young Athletes

## Project Structure
```
tomo-app/
├── backend/          # Next.js 16 API (Railway)
│   ├── app/api/      # API routes (versioned under /v1/)
│   ├── services/     # Business logic (TypeScript)
│   ├── templates/    # Sport workout templates
│   ├── lib/          # Supabase clients, auth helpers, validation
│   ├── types/        # Shared TypeScript types
│   ├── proxy.ts      # Auth proxy (Bearer token + cookie)
│   └── supabase/     # Migrations, config, seed
└── mobile/           # Expo/React Native app
    └── src/services/ # Updated auth (Supabase) + API config
```

## Commands
```bash
# Mobile (Expo) — one Metro, default port 8081
cd mobile
npm run start:fresh          # kill anything on 8081, then Expo Go + clear bundler cache
# or:    npm start            # if nothing else is using 8081
# Do not run two clones (e.g. two copies of tomo-app) with Metro in parallel on the same port.
# Remove duplicate checkouts of this repo to avoid “old version” in Expo Go.

# Backend
cd backend
./scripts/switch-env.sh local     # Switch to local Supabase
./scripts/switch-env.sh prod      # Switch to production Supabase
npm run dev                       # Start dev server (port 3000)
npm run build                     # Production build
npx tsc --noEmit                  # Type check

# Supabase (from backend/)
npx supabase start                # Start local Supabase
npx supabase db reset             # Reset DB + run migrations + seed
npx supabase gen types typescript --local > types/database.ts  # Generate DB types
```

## Architecture
- **Auth**: proxy.ts checks Bearer token first (mobile), falls back to cookies (web)
- **API versioning**: All routes under `/api/v1/`. `/api/health` is public.
- **Validation**: Zod schemas in `lib/validation.ts`
- **DB**: Supabase PostgreSQL with RLS (user_id = auth.uid())
- **Business logic**: Pure functions in services/ (readinessCalculator, planGenerator, complianceService)
- **Admin client**: `lib/supabase/admin.ts` bypasses RLS for API route handlers

## Key Patterns
- proxy.ts skips auth for non-`/api/v1` paths (Next.js 16 proxy runs on all routes; config.matcher is ignored)
- Supabase ports offset by +100 (54421, 54422, 54423, etc.) to coexist with AllSport
- Deterministic ledger IDs: `{uid}_{YYYY-MM-DD}`
- One check-in per user per day (unique constraint)
- Green/Yellow/Red readiness system with REST/LIGHT/MODERATE/HARD intensity
- Points + streak + freeze token gamification

## Database
23 tables total: 16 for existing features, 7 forward roadmap (empty, schema-ready).
See `supabase/migrations/00000000000001_schema.sql` for full schema.

## Sports
football, soccer, basketball, tennis, padel (templates in templates/)

## Required Skills for All Tomo Sessions
Always activate these two skills at the start of every Tomo session:
1. **athlete-performance-director** — Elite performance director lens for all training, readiness, periodization, and sports science decisions
2. **genz-ux-designer** — Senior UI/UX designer lens for all product design, screen flows, and user experience decisions targeting Gen Z athletes (13–25)

## Deployment (Railway)
- **Host**: Railway auto-deploys from GitHub on `git push origin main`
- **Root directory**: `backend` (set in Railway service settings)
- **Port**: 8080 (Railway's `$PORT` — custom domain must route to 8080)
- **Production URL**: `https://app.my-tomo.com`
- **Railway URL**: `https://5qakhaec.up.railway.app`
- **DNS**: `app` CNAME → `5qakhaec.up.railway.app` (managed via onlydomains.com)
- **Frontend**: Expo web export in `backend/public/webapp/`, rebuild with `./scripts/deploy-frontend.sh`
- **Deploy**: Just `git push origin main` — no manual steps needed

## Environment Variables (set in Railway dashboard)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only)
- `ANTHROPIC_API_KEY` — Claude API key (for AI features)
- `VOYAGE_API_KEY` — Voyage AI key (for RAG embeddings)
- `GEMINI_API_KEY` — Gemini fallback key

## Core Guidelines

1. **Plan Mode Default**:

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes wrong, STOP and re-plan immediately don’t keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

2. **Subagent Strategy**:

- Use subagents frequently to keep the main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute via subagents
- Assign one task per subagent for focused execution

3. **Self-Improvement Loop**:

- After any correction from the user, update tasks/lessons.md with the pattern
- Write rules for yourself to prevent repeating the same mistake
- Ruthlessly iterate on these lessons until the mistake rate drops
- Review lessons at the start of each session

4. **Verification Before Done**:

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: “Would a staff engineer approve this?”
- Run tests, check logs, and demonstrate correctness

5. **Demand Elegance (Balanced)**:

- For non-trivial changes, ask: “Is there a more elegant solution?”
- If a fix feels hacky, ask:
“Knowing everything I know now, implement the elegant solution.”
- Skip this for simple fixes, don’t over-engineer.
- Challenge your own work before presenting it

6. **Autonomous Bug Fixing**:

- When given a bug report: just fix it
- Use logs, errors, and failing tests to diagnose
- Require zero context switching from the user
- Fix failing CI tests automatically.

7. **Task Management**:

1. Plan First: Write the plan in tasks/todo.md with checkable items
2. Verify Plan: Confirm the plan before implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: Provide a high-level summary at each step
5. Document Results: Add a review section to tasks/todo.md
6. Capture Lessons: Update tasks/lessons.md after corrections


8. **Core Principles**:

- Simplicity First
- Make every change as simple as possible and minimize code impact.
- No Laziness
Find root causes. Avoid temporary fixes. Maintain senior-level engineering standards.

9. **Zero Guessing — Mandatory Deep Troubleshooting Protocol**:

NEVER guess, assume, or hypothesize about what might be wrong. Before writing a single line of fix code, you MUST complete this protocol:

**Step 1: Verify infrastructure is running**
- Check every service in the chain is actually running (`lsof -i :<port>`, `ps aux`)
- Verify each service is reachable from the next (`curl` health endpoints)
- Check env vars are loaded correctly in each service (read the actual config, not what you think it should be)

**Step 2: Trace the exact code path — file by file**
- Read EVERY file in the request chain from user action to final execution
- Document the exact function calls, line numbers, and data shapes at each hop
- Do NOT skip any layer. If the chain is: Mobile -> TS Backend -> Python -> TS Backend -> DB, read all 4 layers

**Step 3: Identify every error-swallowing location**
- Find every `try/catch` or `except` block in the chain
- Document what each catch block returns to the caller (generic message? original error? nothing?)
- Map which user-visible error messages correspond to which catch blocks

**Step 4: Test with real data**
- Use real user IDs from the database, not fake UUIDs
- Send the exact payload shape the client sends (read the client code to get it)
- Test at the lowest layer first (e.g., Python directly), then work upward
- Capture the ACTUAL error response, not just "it failed"

**Step 5: Only then diagnose**
- State the root cause with evidence (file, line number, actual error message)
- If the root cause is "service not running" or "env var not set," say that — don't patch code

**What this protocol prevents:**
- Patching code when the service is just down
- Adding debug logging to production as a diagnostic step
- Changing env vars on Railway when the user is hitting localhost
- Making assumptions about which layer is failing
- Multiple rounds of "try this fix" → "still broken" → "try another fix"

**When to use this protocol:**
- Any time something "doesn't work" and the error message is generic
- Any time a feature works in one path (e.g., direct API call) but not another (e.g., mobile)
- Any time the user reports the same issue after a "fix"
- Any cross-service integration issue (mobile <-> backend <-> ai-service <-> database)

## Service Chain Reference (for troubleshooting)

The full request chain for AI Chat features:
```
Mobile (Expo)
  -> EXPO_PUBLIC_API_URL (check mobile/.env)
    -> TS Backend (port 3000 local, 8080 Railway)
      -> proxy.ts (auth: Bearer token -> x-user-id header)
        -> /api/v1/chat/agent/route.ts
          -> aiServiceProxy.ts -> getAIServiceUrl()
            -> Python ai-service (port 8000 local, tomoai.railway.internal:8000 Railway)
              -> supervisor.py -> graph nodes
                -> bridge.py -> TS Backend /api/v1/* (write operations)
                  -> Supabase DB
```

Key env vars per layer:
- **Mobile**: `EXPO_PUBLIC_API_URL` (must match machine IP for local dev)
- **TS Backend**: `AI_SERVICE_URL` (unset locally = localhost:8000), `RAILWAY_ENVIRONMENT` (set only on Railway)
- **Python ai-service**: `TS_BACKEND_URL` (localhost:3000 local), `SCHEDULING_CAPSULE_ENABLED`, `SUPABASE_DB_URL`
- **Pydantic Settings**: New env vars MUST be declared as fields in `ai-service/app/config.py` or `extra_forbidden` rejects them

