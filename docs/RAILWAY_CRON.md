# Railway Cron Schedules

Railway doesn't have a native in-repo cron format for this project (the
`backend/` service uses dashboard-configured cron). This doc is the
single source of truth for the cron jobs the backend expects, their
schedule, and how to configure them.

## Required env vars on the `tomo-app` Railway service

- `CRON_SECRET` — any long random string. Both the Railway cron job and
  the endpoint read it. Without it the endpoint fails safe (503).

## Cron jobs to schedule

All jobs are `POST` requests with header `x-cron-secret: $CRON_SECRET`
to `https://app.my-tomo.com` (or the internal Railway URL).

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 1 * * 1` (Mon 01:00 UTC) | `/api/v1/cron/compute-week-compliance` | Fills `athlete_week_plans.compliance_rate` + `outcome` for weeks that just ended. Flips status `active` → `completed`. Without this, compliance stays null and adaptive `/suggest` defaults never trigger. |
| `0 3 * * *` (Daily 03:00 UTC) | `/api/v1/cron/quality-drift-check` | Chat quality drift detection |
| `0 4 * * 0` (Sun 04:00 UTC) | `/api/v1/cron/auto-repair-scan` | AI quality auto-repair scan |
| `0 5 * * 1` (Mon 05:00 UTC) | `/api/v1/cron/golden-set-curate` | Golden set auto-curation |
| `0 2 * * *` (Daily 02:00 UTC) | `/api/v1/cron/shadow-evaluate` | Shadow model evaluation |

## How to set up in Railway

### Option A — Railway native cron (preferred)
1. Railway dashboard → `tomo-app` service → Settings → **Cron Schedule**
2. Add one job per row above.
3. Railway will invoke the endpoint on schedule; headers are configured
   in the cron UI (add `x-cron-secret: $CRON_SECRET`).

### Option B — GitHub Actions fallback
If native cron isn't available on your Railway plan, use
`.github/workflows/cron.yml` (not committed here — template below):

```yaml
name: Cron — Week Plan Compliance
on:
  schedule:
    - cron: '0 1 * * 1'
jobs:
  compute:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsSL -X POST https://app.my-tomo.com/api/v1/cron/compute-week-compliance \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

## Verification after setup

```bash
# Replace <your-secret> with the real value
curl -i -X POST https://app.my-tomo.com/api/v1/cron/compute-week-compliance \
  -H "x-cron-secret: <your-secret>"
# Expect: 200 {"ok":true,"considered":N,"eligible":M,"computed":K,"failed":0}
```

A `403` response means the secret is configured wrong on one side. A
`503` means the env var isn't set on the Railway service at all.

## Rollback

Disable a cron in the Railway dashboard or delete the GitHub Actions
workflow. The endpoint stays reachable; nothing fires it.
