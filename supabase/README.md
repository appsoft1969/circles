# Supabase / Postgres

This folder contains Postgres assets intended to align Circles with the future Supabase backend.

Current state:

- `migrations/202606270001_initial_schema.sql` defines the first production-oriented schema.
- `seed.sql` adds re-runnable local demo circles, tasks, options, responses, and response items.
- The current website still runs on SQLite.
- The migration and seed have been tested against Docker Postgres.

## Apply Locally

Start Docker Postgres:

```bash
docker compose --profile postgres up -d postgres adminer
```

Apply the schema:

```bash
docker compose exec -T postgres psql -U circles -d circles_dev -v ON_ERROR_STOP=1 < supabase/migrations/202606270001_initial_schema.sql
```

Apply demo data:

```bash
docker compose exec -T postgres psql -U circles -d circles_dev -v ON_ERROR_STOP=1 < supabase/seed.sql
```

Inspect tables:

```bash
docker compose exec -T postgres psql -U circles -d circles_dev -c "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';"
```

Inspect task templates:

```bash
docker compose exec -T postgres psql -U circles -d circles_dev -c "select id, display_name from task_templates order by sort_order;"
```

Inspect seeded tasks:

```bash
docker compose exec -T postgres psql -U circles -d circles_dev -c "select title, template_id, share_token from tasks order by created_at desc;"
```

## Design Notes

- `profiles.id` is intentionally UUID-based so it can later align with Supabase Auth user IDs.
- Row Level Security policies are not included yet. Add them after the auth and membership model is implemented.
- `task_templates` is seeded by the initial migration because those IDs are part of the product contract.
- `seed.sql` is for local development and demos; do not treat it as production data.
- `tasks` is the central object. Templates such as group buy, member sale, meal order, drink order, activity, poll, and expense split share the same engine.
