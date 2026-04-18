# Cron Jobs — GitHub Actions

This project schedules all cron-triggered backend endpoints via GitHub
Actions workflows in `.github/workflows/`, not Railway native cron.
Each workflow is a thin HTTP caller that POSTs to the matching
`/api/v1/cron/*` endpoint with the `X-Cron-Secret` header.

## Workflows in this repo

| Workflow file | Schedule (UTC) | Endpoint |
|---|---|---|
| `chat-quality-auto-repair.yml` | `15 */6 * * *` (every 6h) | `/api/v1/cron/auto-repair-scan` |
| `chat-quality-drift-check.yml` | (see file) | `/api/v1/cron/quality-drift-check` |
| `chat-quality-golden-set-curate.yml` | (see file) | `/api/v1/cron/golden-set-curate` |
| `chat-quality-shadow-evaluate.yml` | (see file) | `/api/v1/cron/shadow-evaluate` |
| `week-plan-compute-compliance.yml` | `0 1 * * 1` (Mon 01:00) | `/api/v1/cron/compute-week-compliance` |

All workflows share two secrets:

- `CHAT_QUALITY_BASE_URL` — `https://app.my-tomo.com`
- `CHAT_QUALITY_CRON_SECRET` — same value as Railway's `CRON_SECRET` env var

## Required Railway env var

On the `tomo-app` Railway service, set:

- `CRON_SECRET` — any long random string. Must match the
  `CHAT_QUALITY_CRON_SECRET` GitHub secret.

Without it the endpoint fails safe (503). Mismatch → 403.

## One-time setup

1. Generate a secret: `openssl rand -hex 32`
2. Railway dashboard → `tomo-app` → Variables → add `CRON_SECRET=<value>`
3. GitHub repo → Settings → Secrets and variables → Actions → add:
   - `CHAT_QUALITY_BASE_URL=https://app.my-tomo.com`
   - `CHAT_QUALITY_CRON_SECRET=<same-value>`

After that every workflow fires on its schedule without further
action. Use `workflow_dispatch` from the Actions tab to test manually.

## Verification

```bash
# Replace <secret> with the real value
curl -i -X POST https://app.my-tomo.com/api/v1/cron/compute-week-compliance \
  -H "X-Cron-Secret: <secret>"
# Expect: 200 {"ok":true,"considered":N,"eligible":M,"computed":K,"failed":0}
```

- `200` — worked
- `403` — secret wrong on one side
- `503` — `CRON_SECRET` env var not set on Railway

## Rollback

Disable a workflow via GitHub Actions UI (Actions → workflow → "⋯" →
Disable workflow). The endpoint stays reachable; nothing fires it.

## Adding a new cron

1. Create `.github/workflows/<name>.yml` matching the template of
   `week-plan-compute-compliance.yml`.
2. Set the `cron:` schedule and the endpoint path in the `curl` call.
3. Push. First run is on the next scheduled tick (or trigger manually
   via `workflow_dispatch`).
