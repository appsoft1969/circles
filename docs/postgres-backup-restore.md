# Postgres Backup And Restore Runbook

This runbook covers the current Mac-hosted public Postgres database for InCircle.

Use this path for early development and private beta validation. Before real production users, add offsite backup storage, restore monitoring, alerting, and a formal production database target.

## Current Setup

- Source database: `incircle_local`
- Source connection: `postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local`
- Maintenance connection: `postgres://kevin_huang@127.0.0.1:5434/postgres`
- Backup script: `website/scripts/postgres-backup-restore.mjs`
- Backup status script: `website/scripts/postgres-backup-status.mjs`
- Package command: `npm run backup:postgres`
- Status command: `npm run backup:postgres:status`
- LaunchAgent label: `com.useincircle.postgres-backup`
- LaunchAgent config: `deploy/launchd/com.useincircle.postgres-backup.plist`
- Schedule: daily at `03:20`
- Local backup directory: `website/data/backups/postgres`
- iCloud Drive backup directory: `/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres`
- Retention: 30 days
- Logs:
  - `website/artifacts/postgres-backup.out.log`
  - `website/artifacts/postgres-backup.err.log`
- Status report: `website/artifacts/postgres-backup-status.json`

## What The Script Does

Each run performs a backup and restore check:

1. Reads core table counts from the source database.
2. Creates a custom-format `pg_dump` file.
3. Creates a temporary restore database named `incircle_restore_<timestamp>`.
4. Restores the dump into that temporary database with `pg_restore`.
5. Compares source and restored counts for core tables.
6. Writes a JSON manifest and restore-check report.
7. Drops the temporary restore database.
8. Copies the verified backup artifacts to iCloud Drive when `OFFSITE_BACKUP_DIR` is set.
9. Removes backup files older than the retention window from both local and iCloud backup directories.
10. Runs the status checker and refreshes `website/artifacts/postgres-backup-status.json`.

The restore check verifies these tables:

- `profiles`
- `circles`
- `circle_memberships`
- `task_templates`
- `tasks`
- `task_options`
- `responses`
- `response_items`
- `announcements`
- `task_comments`

The app user `incircle` does not have `CREATEDB`, which is intentional. The restore drill uses the local maintenance role `kevin_huang` to create and drop only the temporary restore database.

## Manual Backup And Restore Check

Run:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
npm run backup:postgres
```

Expected result:

- Command exits with code `0`.
- A `.dump` file is created under `website/data/backups/postgres`.
- A `.json` manifest is created beside the dump.
- A `.restore-check.json` file shows `mismatches: []`.
- The same three files are copied to iCloud Drive when `OFFSITE_BACKUP_DIR` is set.
- No database matching `incircle_restore_%` remains afterward.

Run with the current iCloud target:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
OFFSITE_BACKUP_DIR="/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres" npm run backup:postgres
```

Check latest report:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
latest="$(ls -t website/data/backups/postgres/incircle_local-*.json | rg -v 'restore-check' | head -n 1)"
sed -n '1,220p' "$latest"
```

Confirm temporary restore databases were cleaned:

```bash
psql -h 127.0.0.1 -p 5434 -d postgres -At \
  -c "select datname from pg_database where datname like 'incircle_restore_%' order by 1;"
```

## Backup Health Check

Run:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
OFFSITE_BACKUP_DIR="/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres" npm run backup:postgres:status
```

The status command exits with code `0` when:

- The latest manifest exists.
- The latest manifest reports `ok: true`.
- The latest backup is not older than `MAX_BACKUP_AGE_HOURS`, default `36`.
- The local dump file exists.
- The local dump SHA-256 matches the manifest.
- The restore check has no mismatches.
- The iCloud `.dump`, `.json`, and `.restore-check.json` files exist when `OFFSITE_BACKUP_DIR` is set.
- The iCloud dump SHA-256 matches the local dump.

It writes:

```bash
/Users/kevin_huang/Documents/Projects/circles/website/artifacts/postgres-backup-status.json
```

Example JSON shape:

```json
{
  "ok": true,
  "maxBackupAgeHours": 36,
  "backup": {
    "ageHours": 0.102,
    "restoreMismatches": []
  },
  "offsite": {
    "enabled": true
  },
  "failures": []
}
```

If this command exits non-zero, inspect `failures` in the status JSON first.

The daily backup LaunchAgent also runs this status check automatically after a successful backup/restore/iCloud-copy cycle.

## LaunchAgent Install

Install or refresh the daily schedule:

```bash
mkdir -p ~/Library/LaunchAgents
ln -sf /Users/kevin_huang/Documents/Projects/circles/deploy/launchd/com.useincircle.postgres-backup.plist \
  ~/Library/LaunchAgents/com.useincircle.postgres-backup.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.useincircle.postgres-backup.plist
```

If the service is already loaded and the plist changed, unload and load it again:

```bash
launchctl bootout gui/$(id -u)/com.useincircle.postgres-backup
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.useincircle.postgres-backup.plist
```

Run it immediately without waiting for `03:20`:

```bash
launchctl kickstart -k gui/$(id -u)/com.useincircle.postgres-backup
```

Check status:

```bash
launchctl print gui/$(id -u)/com.useincircle.postgres-backup
tail -n 80 /Users/kevin_huang/Documents/Projects/circles/website/artifacts/postgres-backup.out.log
tail -n 80 /Users/kevin_huang/Documents/Projects/circles/website/artifacts/postgres-backup.err.log
```

Expected status after a successful run:

- `state = not running`
- `last exit code = 0`
- calendar trigger shows `Hour = 3`, `Minute = 20`
- launchd environment includes `OFFSITE_BACKUP_DIR`
- log includes `offsite files copied: 3`

After any scheduled or manual run, use `npm run backup:postgres:status` to verify health without manually inspecting each file.

## iCloud Drive Copy

Current iCloud Drive target:

```bash
/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres
```

List offsite backups:

```bash
find "/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres" \
  -maxdepth 1 -type f -name 'incircle_local-*' -print | sort
```

Compare a local dump with the iCloud copy:

```bash
local_dump="$(ls -t /Users/kevin_huang/Documents/Projects/circles/website/data/backups/postgres/incircle_local-*.dump | head -n 1)"
cloud_dump="/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres/$(basename "$local_dump")"
shasum -a 256 "$local_dump" "$cloud_dump"
```

The two hashes should match. iCloud Drive syncing is handled by macOS; this script verifies the file was copied into the iCloud Drive folder, not that Apple's servers have finished uploading it.

## Manual Restore To A Separate Database

Do not restore directly into `incircle_local` during normal checks. Restore into a separate database first.

Example:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
dump_file="$(ls -t website/data/backups/postgres/incircle_local-*.dump | head -n 1)"
restore_db="incircle_manual_restore_$(date +%Y%m%d%H%M%S)"

createdb -h 127.0.0.1 -p 5434 -U kevin_huang --maintenance-db postgres "$restore_db"
pg_restore -h 127.0.0.1 -p 5434 -U kevin_huang \
  --dbname "$restore_db" --exit-on-error --no-owner --no-acl "$dump_file"
psql -h 127.0.0.1 -p 5434 -U kevin_huang -d "$restore_db" \
  -c "select count(*) from tasks;"
dropdb --if-exists --force -h 127.0.0.1 -p 5434 -U kevin_huang \
  --maintenance-db postgres "$restore_db"
```

## Important Limits

- These backups now exist locally and in the Mac's iCloud Drive folder.
- iCloud Drive is an acceptable early off-machine copy, but it is not the same as a monitored production backup service.
- Before real public users depend on the system, add alerting and a provider-side backup target such as S3, Backblaze B2, Supabase backups, or VPS snapshots.
- Keep Postgres bound to `127.0.0.1`; do not expose it publicly.
- Keep the `incircle` app role limited. Use the local maintenance role for backup restore drills.
