# Deploying to Railway

Two services from one repo. They are separate because the worker needs Whisper,
which pulls PyTorch — bundling that into the web image would take it from about
200MB to several gigabytes for code the web service never runs.

| Service | Dockerfile | Role |
|---|---|---|
| `web` | `Dockerfile` | The dashboard. Reads Postgres. No media tooling. |
| `worker` | `Dockerfile.worker` | Sync, watch, enrich, synthesise. Has ffmpeg + Whisper. |

## 1. Use the transaction pooler, not the session pooler

This is the single most important setting. Supabase's **session** pooler caps the
whole project at 15 connections, and that ceiling already broke this app once in
development. Railway runs multiple instances and restarts containers freely, so
it will hit that limit.

In Supabase → **Connect**, take the **Transaction pooler** URI (port `6543`), not
the session one (`5432`):

```
postgresql://postgres.ylysouzdmcemnewqtguk:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

Two things to remember:
- The password contains `@`, so percent-encode it as `%40`.
- The transaction pooler does not support prepared statements. The client
  already sets `prepare: false`, so nothing to change.

## 2. Create the web service

```bash
npm i -g @railway/cli
railway login
railway init            # or: railway link   to attach an existing project
railway up
```

Set these variables on the service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the transaction-pooler URI from step 1 |
| `APP_PASSWORD` | the shared team password — **required** |
| `CLICKUP_TOKEN` | read-only ClickUp token |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
| `PG_POOL_MAX` | `3` |
| `NODE_ENV` | `production` |

`APP_PASSWORD` is not optional. Without it the app returns 503 in production
rather than serving competitive data on a public URL.

Then generate a domain under **Settings → Networking → Generate Domain**.

## 3. Create the worker service

Add a second service in the same project pointing at the same repo, and set
**Settings → Build → Dockerfile Path** to `Dockerfile.worker`.

It needs everything the web service has, plus:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | for the analysis passes |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the service-account JSON, on one line |

Run it on a schedule rather than continuously — **Settings → Cron Schedule**,
e.g. `0 */6 * * *` for every six hours. The default command syncs, watches,
enriches, synthesises and rebuilds the snapshot, skipping anything already done.

## 4. First run

The worker's first run populates everything. The web service works immediately
either way: with no snapshot file it projects the view straight from Postgres.

## What to check afterwards

- Visit the domain — you should get the password gate, not the dashboard.
- After logging in, the Overview counts should match what you see locally.
- Worker logs should show `already done` counts climbing on repeat runs; that
  is the skip logic working, not a failure.

## Known gaps

- **One shared password, not per-person accounts.** Nobody can tell who viewed
  what. Supabase Auth is the upgrade.
- **Watch and Enrich buttons only work where a worker can run them.** On the web
  service they will fail — it has no ffmpeg. Either run jobs on the worker's
  schedule, or give the web service the worker image if you want the buttons
  live for the team.
- **No ClickUp webhook yet.** New winners are picked up on the worker's next
  scheduled run, not the moment a status changes.
