# Tomo — AI Coaching Platform for Young Athletes

## Project Structure
```
tomo-app/
├── backend/          # Next.js 16 API (Vercel)
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

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only)
- `ANTHROPIC_API_KEY` — Claude API key (for AI features)
- `GEMINI_API_KEY` — Gemini fallback key
