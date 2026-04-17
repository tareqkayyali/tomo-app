# Supabase Migrations — Team Policy

Last updated: 2026-04-17.

## TL;DR

| Kind of change | Tool | Notes |
|---|---|---|
| Schema DDL (tables, views, columns, indexes, RLS, triggers, functions) | `supabase db push` via **Supabase Migrate (manual)** GitHub Action | PostgREST schema cache reloads cleanly; no cache-bust required. |
| Data fixes (INSERT / UPDATE / DELETE in prod) | Supabase SQL Editor | One-off, reviewable in the UI, no schema drift. |
| Ad-hoc reads (SELECT, debug queries) | Supabase SQL Editor | Same as above. |

The CLAUDE.md policy ("NEVER run SQL against production Supabase programmatically — paste into the SQL Editor") was written with data writes in mind. Schema DDL is materially different: it's versioned, code-reviewed in git, and needs to stay in sync across environments. `supabase db push` is the tool for that specific case.

## Why this matters

Pasting schema DDL into the SQL Editor **changes the database but doesn't tell PostgREST to reload its schema cache**. Symptoms: new tables or views come back `Could not find the table 'public.xxx' in the schema cache` when hit via the Supabase client, even though `select` from psql works. We hit this twice during the Phase 5 quality engine deploy — cost us ~90 min of debugging. `supabase db push` avoids it because the CLI runs the proper post-migration hooks.

## Author flow — adding a new migration

1. Create the file in `backend/supabase/migrations/` with the `00000000000NNN_descriptive_name.sql` convention. Increment from the last number in the folder.
2. Commit + push the file to a feature branch + open a PR.
3. Merge to `main` after review.
4. **Manually trigger the apply** once the PR is merged (see below). Nothing auto-deploys schema — a human always gates it.

## Apply flow — running the migration

1. GitHub → **Actions** tab → left sidebar → **Supabase Migrate (manual)** → **Run workflow** (green button on the right).
2. First run: leave **Dry run** checked. Click **Run workflow**. The job prints the diff of what would be applied. Review it.
3. If the diff looks correct: re-run the workflow with **Dry run** *unchecked* AND type `apply` in the **confirm** field. The job applies the migration.
4. Watch the logs. On success, the table/view is queryable via the Supabase client within seconds — no cache-bust needed.

## Rollback

Supabase does not support auto-rollback. If you need to revert:

1. Write a **new** migration that reverses the previous one (e.g., `DROP TABLE …` if the prior was `CREATE TABLE …`).
2. Apply it via the same workflow.
3. Commit the rollback migration so history is honest.

Do NOT try to edit or delete a previously-applied migration file — the CLI tracks applied state, and removing a file out from under it will confuse future runs.

## Required GitHub repo secrets

Set at **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → create token |
| `SUPABASE_PROJECT_REF` | 20-char string from Project Settings → General (or the URL: `/project/<REF>`) |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → password (click reveal / reset if you don't know it) |

All three are required — the workflow fails fast if any are missing.

## What NOT to do

- ❌ Paste schema DDL into the SQL Editor against production. It works but silently breaks PostgREST cache for the new objects.
- ❌ Skip the dry-run step. First run of the Apply workflow should always be a dry run.
- ❌ Edit an existing migration file after it's been applied anywhere. Write a new migration instead.
- ❌ Mix schema DDL and data writes in the same migration file. Schema in migrations, data fixes in the SQL Editor.

## Local dev parity

Same file structure works locally:

```bash
cd backend
supabase start                    # spin up local stack
supabase db reset                 # apply all migrations + seed (DESTRUCTIVE locally)
# ... edit a migration file ...
supabase db push --local          # apply to local pg
```

Before opening a PR, confirm your migration applies cleanly locally.
