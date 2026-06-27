# Local Mac Public Hosting

This document captures the current no-Docker public hosting path for the Mac Studio at `114.33.179.210`.

Use this only for early development, demos, and private beta checks. A formal VPS is still the recommended production target once real users and payment records are involved.

## Current Shape

- Domain: `useincircle.app`
- Public IPv4: `114.33.179.210`
- Mac LAN IP: `192.168.1.80`
- Public entrypoints: `80` and `443`
- Static website build: `website/dist`
- API: `127.0.0.1:8787`
- Data store for the public API in this phase: Homebrew PostgreSQL at `127.0.0.1:5434`, database `incircle_local`, user `incircle`
- SQLite fallback/source backup: `website/data/circles.sqlite`
- Reverse proxy / HTTPS: Homebrew Caddy
- Daily Postgres backup/restore check: LaunchAgent `com.useincircle.postgres-backup`, scheduled at `03:20`
- Offsite copy target: iCloud Drive folder `InCircle/backups/postgres`

## Router Requirement

The router must forward:

| Public port | Mac target |
|---|---|
| `80` | `192.168.1.80:80` |
| `443` | `192.168.1.80:443` |

`useincircle.app` and `www.useincircle.app` should both resolve to `114.33.179.210`.

## Build And Start

Build the static website:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
npm run build
```

Start the API:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
DATA_STORE=postgres \
DATABASE_URL=postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local \
npm run api
```

For a persistent local service, install the LaunchAgent instead:

```bash
mkdir -p ~/Library/LaunchAgents
ln -sf /Users/kevin_huang/Documents/Projects/circles/deploy/launchd/com.useincircle.api.plist ~/Library/LaunchAgents/com.useincircle.api.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.useincircle.api.plist
launchctl kickstart -k gui/$(id -u)/com.useincircle.api
```

API logs:

- `website/artifacts/incircle-api.out.log`
- `website/artifacts/incircle-api.err.log`

Caddy uses:

```bash
/Users/kevin_huang/Documents/Projects/circles/deploy/Caddyfile.local-mac
```

Validate the Caddy config:

```bash
caddy validate --config /Users/kevin_huang/Documents/Projects/circles/deploy/Caddyfile.local-mac
```

Start Caddy as a Homebrew service:

```bash
ln -sf /Users/kevin_huang/Documents/Projects/circles/deploy/Caddyfile.local-mac /opt/homebrew/etc/Caddyfile
brew services start caddy
```

## Verify

```bash
curl -I http://useincircle.app
curl -I https://useincircle.app
curl -s https://useincircle.app/api/health
curl -s https://useincircle.app/api/bootstrap
curl -I https://www.useincircle.app
```

Expected behavior:

- `http://useincircle.app` redirects to HTTPS.
- `https://useincircle.app` serves the InCircle website.
- `https://useincircle.app/api/health` returns API health JSON with `backend` set to `postgres`.
- `https://useincircle.app/api/bootstrap` returns the current public circles, tasks, templates, stats, options, and responses from Postgres.
- `https://www.useincircle.app` redirects to `https://useincircle.app`.

Service checks:

```bash
brew services list | rg caddy
launchctl print gui/$(id -u)/com.useincircle.api
lsof -nP -iTCP:80 -sTCP:LISTEN
lsof -nP -iTCP:443 -sTCP:LISTEN
lsof -nP -iTCP:8787 -sTCP:LISTEN
lsof -nP -iTCP:5434 -sTCP:LISTEN
```

## Notes

- Do not expose the Vite dev server directly to the internet.
- Keep the API bound to `127.0.0.1`; Caddy is the public entrypoint.
- Keep daily Postgres dumps once this path is used for real beta data.
- Keep `website/data/circles.sqlite` as a fallback/source backup after the public Postgres switch.
- Keep Homebrew PostgreSQL on `127.0.0.1:5434`; do not expose it to the internet.
- Stop or remove any other service using ports `80` or `443` before starting Caddy.
- Keep the Docker dev stack stopped while this Mac is acting as the public HTTPS host.
- See `docs/postgres-backup-restore.md` for backup, restore-check, and launchd operations.

## Daily Postgres Backup And Restore Check

The current Mac-hosted public database has a local daily backup and restore drill.

- Script: `website/scripts/postgres-backup-restore.mjs`
- Command: `npm run backup:postgres`
- Status command: `npm run backup:postgres:status`
- LaunchAgent: `deploy/launchd/com.useincircle.postgres-backup.plist`
- Installed symlink: `~/Library/LaunchAgents/com.useincircle.postgres-backup.plist`
- Schedule: daily at `03:20`
- Backup directory: `website/data/backups/postgres`
- iCloud copy: `/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres`
- Retention: 30 days
- Logs:
  - `website/artifacts/postgres-backup.out.log`
  - `website/artifacts/postgres-backup.err.log`
- Status report: `website/artifacts/postgres-backup-status.json`

Manual check:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
npm run backup:postgres
```

LaunchAgent check:

```bash
launchctl print gui/$(id -u)/com.useincircle.postgres-backup
tail -n 80 /Users/kevin_huang/Documents/Projects/circles/website/artifacts/postgres-backup.out.log
tail -n 80 /Users/kevin_huang/Documents/Projects/circles/website/artifacts/postgres-backup.err.log
```

Backup health check:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
OFFSITE_BACKUP_DIR="/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres" npm run backup:postgres:status
```

Expected result:

- `last exit code = 0` after a run.
- A `.dump`, `.json`, and `.restore-check.json` file are created.
- The same three files are copied to iCloud Drive.
- The restore check report has `mismatches: []`.
- No database matching `incircle_restore_%` remains after the run.
- The status check exits `0` and writes `ok: true` to `website/artifacts/postgres-backup-status.json`.

## SQLite To Postgres Switch

The public Mac API was switched to Postgres on 2026-06-27.

Before migrating, stop the API and checkpoint SQLite so the main database file includes WAL data:

```bash
launchctl bootout gui/$(id -u)/com.useincircle.api
sqlite3 /Users/kevin_huang/Documents/Projects/circles/website/data/circles.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
```

Create backups before replacing public data:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
backup_dir="website/data/backups/$(date +%Y%m%d%H%M%S)"
mkdir -p "$backup_dir"
cp website/data/circles.sqlite "$backup_dir/circles.sqlite"
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/pg_dump \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local -Fc \
  -f "$backup_dir/incircle_local.before-switch.dump"
```

Migrate SQLite data into Postgres:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
DATABASE_URL=postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local npm run migrate:sqlite-to-postgres
```

The migration truncates business data in Postgres, preserves `task_templates`, and migrates users, circles, memberships, tasks, task options, responses, response items, announcements, and task comments. Share tokens are preserved, so existing `/join/:token` links continue to work.

Current switch backup:

- `website/data/backups/20260627155509/circles.sqlite`
- `website/data/backups/20260627155509/incircle_local.before-switch.dump`

Native Postgres checks:

```bash
brew services list | rg postgresql@16
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local \
  -c "select current_database(), current_user;"
```

Stop the InCircle Docker dev stack without deleting volumes:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
docker compose --profile postgres --profile tools --profile storage stop
```

Start the Docker dev stack again only when needed for local parity work:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
docker compose --profile postgres --profile tools --profile storage up -d
```
