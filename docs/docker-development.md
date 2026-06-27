# Docker Development Environment

This project can use Docker Desktop Personal on the Mac for early development, but Docker should be used selectively.

The goal is not to hide everything in containers. The goal is to make repeatable services easy to start, stop, reset, and later replace with production services.

## What Should Use Docker First

### 1. Website And API

Use Docker when you want a clean reproducible Node environment without depending on the host machine's `node_modules`.

Current services:

- Web: React / Vite.
- API: Express.
- Local DB: SQLite inside a Docker named volume.

Docker URLs:

- Website: `http://127.0.0.1:5175/`
- API: `http://127.0.0.1:8788/`

The non-Docker local URLs still remain:

- Website: `http://127.0.0.1:5174/`
- API: `http://127.0.0.1:8787/`

### 2. Postgres

Use Docker Postgres before migrating to Supabase/Postgres.

This is useful for:

- Designing the production schema.
- Testing migrations.
- Moving away from SQLite when the app needs auth, realtime, notification, and chat data.

Default local connection:

- Host: `127.0.0.1`
- Port: `5433`
- Database: `circles_dev`
- User: `circles`
- Password: `circles_dev_password`

### 3. Adminer

Adminer gives a quick database UI for local Postgres inspection.

URL:

- `http://127.0.0.1:8081/`

Use:

- System: PostgreSQL
- Server: `postgres`
- Username: `circles`
- Password: `circles_dev_password`
- Database: `circles_dev`

### 4. Mailpit

Use Mailpit when adding login, invitations, magic links, email verification, or payment-related notices.

URLs and ports:

- SMTP: `127.0.0.1:1025`
- Web UI: `http://127.0.0.1:8025/`

### 5. Redis

Use Redis later for:

- Notification queues.
- Rate limiting.
- Background jobs.
- Short-lived invite/session state.

Default local port:

- `127.0.0.1:6380`

### 6. MinIO

Use MinIO later to simulate object storage for:

- Avatars.
- Item photos.
- Payment proof uploads.
- Attachments in circle announcements or task discussions.

URLs:

- S3 API: `http://127.0.0.1:9000/`
- Console: `http://127.0.0.1:9001/`

Credentials:

- User: `circles`
- Password: `circles_minio_password`

## What Should Not Use Docker First

Do not spend time Dockerizing these at the beginning:

- iOS simulator or App Store builds. Use macOS/Xcode or EAS when the native app starts.
- Android emulator unless there is a specific need. Expo development is usually smoother outside Docker.
- Real push notification delivery. Docker can run the backend, but APNs/FCM still require platform credentials and real devices/emulators.
- Real payment gateway flows. Start with manual payment status and payment proof.
- Full Supabase local stack unless the project is actively migrating to Supabase migrations/auth/realtime.

## Commands

Copy environment defaults only when you need to customize ports or credentials:

```bash
cp .env.example .env
```

Run current website and API in Docker:

```bash
docker compose up -d api web
```

Check status:

```bash
docker compose ps
```

Stop website and API:

```bash
docker compose stop web api
```

Start optional Postgres and Adminer:

```bash
docker compose --profile postgres up -d postgres adminer
```

Apply the current Postgres schema:

```bash
docker compose exec -T postgres psql -U circles -d circles_dev -v ON_ERROR_STOP=1 < supabase/migrations/202606270001_initial_schema.sql
```

Apply Postgres demo seed data:

```bash
docker compose exec -T postgres psql -U circles -d circles_dev -v ON_ERROR_STOP=1 < supabase/seed.sql
```

Start optional tools:

```bash
docker compose --profile tools up -d redis mailpit
```

Start optional object storage:

```bash
docker compose --profile storage up -d minio
```

Start everything useful for backend work:

```bash
docker compose --profile postgres --profile tools --profile storage up -d
```

This starts:

- Web and API.
- Postgres and Adminer.
- Redis.
- Mailpit.
- MinIO.

Run the API against the partial Postgres store:

```bash
DATA_STORE=postgres docker compose --profile postgres up -d api web postgres adminer
```

This mode supports API health, seeded task reads, share-link reads, task creation, task detail/option edits, interest-check conversion, task announcements, task comments, participant responses, response status updates, task status updates, and CSV export. It is suitable for local Postgres parity testing, not production deployment.

Run SQLite and Postgres API smoke tests from `website/`:

```bash
npm run test:api
```

The default Postgres smoke path expects Homebrew Postgres on `127.0.0.1:5434`. To test Docker Postgres instead, run:

```bash
API_SMOKE_DATABASE_URL=postgres://circles:circles_dev_password@127.0.0.1:5433/circles_dev npm run test:api
```

The Postgres database must have the migration and `supabase/seed.sql` already applied. The smoke test creates a temporary task, announcement, comment, and response through the API and removes that task data afterward.

View logs:

```bash
docker compose logs -f api web
```

Reset Docker SQLite data:

```bash
docker compose down -v
```

This deletes Docker named volumes for this compose project. Do not use it if you want to keep local Docker data.

## Port Choices

Docker uses different host ports from the direct local Node setup so both can run at the same time:

| Service | Direct Local | Docker Host Port |
|---|---:|---:|
| Web | `5174` | `5175` |
| API | `8787` | `8788` |
| Postgres | none | `5433` |
| Adminer | none | `8081` |
| Redis | none | `6380` |
| Mailpit SMTP | none | `1025` |
| Mailpit Web | none | `8025` |
| MinIO API | none | `9000` |
| MinIO Console | none | `9001` |

Override ports with environment variables when needed:

```bash
WEB_HOST_PORT=5180 API_HOST_PORT=8790 docker compose up -d api web
```

## Recommended Early Path

Use Docker in this order:

1. Run Web/API in Docker to prove reproducible setup.
2. Add Postgres when the schema moves beyond SQLite.
3. Add Mailpit when account invite/login emails start.
4. Add MinIO when item photos, attachments, or payment proof uploads start.
5. Add Redis when notification queues and rate limits become real.
6. Move to Supabase/Postgres once real beta users need stable auth, realtime, storage, and backup behavior.

## Docker Desktop Personal Note

Docker Desktop Personal is suitable for this early local development setup. Before using it in a larger company or commercial organization, re-check Docker's current subscription terms because licensing rules can change.
