# Supabase / Postgres

This folder contains Postgres assets intended to align InCircle with the future Supabase backend.

Current state:

- `migrations/202606270001_initial_schema.sql` defines the first production-oriented schema.
- `migrations/202606270002_auth_identity_sessions.sql` adds auth identities, session tokens, and OAuth state records for Apple, Google, and LINE login.
- `seed.sql` adds re-runnable local demo profiles, circles, memberships, tasks, options, responses, announcements, and comments.
- The current public Mac-hosted website runs on Homebrew Postgres through `DATA_STORE=postgres`.
- SQLite remains available as a local fallback/test data store.
- The migration and seed have been tested against Homebrew Postgres at `127.0.0.1:5434` and Docker Postgres.
- Daily local backup and restore checks are handled by `website/scripts/postgres-backup-restore.mjs`, with a verified copy written to iCloud Drive. Health checks are handled by `website/scripts/postgres-backup-status.mjs`; see `docs/postgres-backup-restore.md`.

## Apply Locally

Homebrew Postgres is the current local default on this Mac:

```bash
brew services start postgresql@16
```

Apply the schema:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local -v ON_ERROR_STOP=1 \
  < supabase/migrations/202606270001_initial_schema.sql
```

Apply demo data:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local -v ON_ERROR_STOP=1 \
  < supabase/seed.sql
```

Inspect tables:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local \
  -c "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';"
```

Inspect task templates:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local \
  -c "select id, display_name from task_templates order by sort_order;"
```

Inspect seeded tasks:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local \
  -c "select title, template_id, share_token from tasks order by created_at desc;"
```

## Design Notes

- `profiles.id` is intentionally UUID-based so it can later align with Supabase Auth user IDs.
- Row Level Security policies are not included yet. The current Express API has cookie session and Apple/Google/LINE auth scaffolding, but public provider credentials are not configured yet. Add real auth provider credentials and RLS before broad beta.
- `task_templates` is seeded by the initial migration because those IDs are part of the product contract.
- `seed.sql` is for local development and demos; do not treat it as production data.
- `tasks` is the central object. Templates such as group buy, member sale, meal order, drink order, activity, poll, and expense split share the same engine.
- `conversations`, `messages`, `message_reads`, `devices`, and `notifications` now have API scaffolding in the Postgres store. Supabase Realtime subscriptions and APNs/FCM delivery are still future work.
