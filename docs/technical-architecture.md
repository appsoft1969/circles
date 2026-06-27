# Technical Architecture

The first working website lives in `website/`.

It is intentionally simple:

- Frontend: React + Vite.
- Backend: Express.
- Data access: SQLite store module at `website/server/data/sqliteStore.js`.
- Database: SQLite file at `website/data/circles.sqlite`.
- Runtime API: `http://127.0.0.1:8787`.
- Local website: `http://127.0.0.1:5174`.

## Product Architecture

InCircle is built as a structured task layer that complements existing chat groups.

The core entity is `task`, not only `group_buy`.

Supported first templates:

- `group_buy`: group buys.
- `interest_check`: early interest checks for movie, meal, sports game, free ticket, freebie, or casual meetup ideas before they become real activities.
- `claim`: free-ticket, seat, quota, freebie, or perk claim/registration.
- `member_sale`: circle-only sales by known members.
- `meal_order`: office meals or bento orders.
- `drink_order`: office drink orders.
- `activity`: KTV, dinner, after-work activities.
- `poll`: time, place, or option voting.
- `expense_split`: shared expense settlement.

Every template shares the same core flow:

1. Organizer creates a task.
2. App creates a share token.
3. Organizer copies the `/join/:token` URL into a chat group.
4. Participants submit responses without installing an app.
5. Organizer manages counts, payment status, and completion status.

Template boundary:

- `interest_check` asks who is interested or wants to reserve a spot before the plan is confirmed.
- `claim` records actual claims for tickets, seats, quotas, freebies, or perks after the organizer decides to distribute them.
- `poll` chooses between options.
- `activity` manages confirmed attendance, deposits, AA, or final logistics.

## Database Tables

### users

Organizer accounts.

Key columns:

- `id`
- `display_name`
- `email`
- `created_at`

### circles

Known real-life groups.

Key columns:

- `id`
- `owner_user_id`
- `name`
- `description`
- `invite_code`
- `created_at`

### circle_members

Known members inside a circle.

Key columns:

- `id`
- `circle_id`
- `display_name`
- `contact_hint`
- `created_at`

### tasks

The main work item. A task can be a group buy, interest check, circle-only member sale, meal order, drink order, activity, poll, or expense split.

Key columns:

- `id`
- `circle_id`
- `template`
- `title`
- `description`
- `deadline_at`
- `status`
- `share_token`
- `payment_instructions`
- `pickup_instructions`
- `metadata_json`
- `created_at`
- `updated_at`

### task_options

Selectable options inside a task.

Examples:

- Coffee item.
- Member sale item.
- Bento item.
- Drink item.
- KTV RSVP option.
- Poll option.

Key columns:

- `id`
- `task_id`
- `title`
- `subtitle`
- `unit_price`
- `metadata_json`
- `sort_order`

### responses

Participant submissions.

Key columns:

- `id`
- `task_id`
- `participant_name`
- `participant_contact`
- `note`
- `total_amount`
- `payment_status`
- `fulfillment_status`
- `rsvp_status`
- `guest_count`
- `metadata_json`
- `created_at`
- `updated_at`

### response_items

Selected options and quantities inside a response.

Key columns:

- `id`
- `response_id`
- `option_id`
- `quantity`
- `unit_price`
- `metadata_json`

## API Endpoints

The HTTP routes live in `website/server/index.js`.

Route handlers should not contain raw SQL. Current SQLite access is isolated in `website/server/data/sqliteStore.js`; future Postgres work should add a separate store or repository implementation behind the same API-facing behavior.

## Data Store Selection

The API uses `website/server/data/storeFactory.js`.

Supported `DATA_STORE` values:

- `sqlite`: default working MVP runtime.
- `postgres`: local runtime for validating Postgres connectivity, seeded demo data, core task workflows, task edits, interest-check conversion, share-link submissions, status updates, and CSV export. The current Mac default is Homebrew PostgreSQL on `127.0.0.1:5434`.
- Task announcements and task comments are part of the core task object in both stores. They are the first step toward in-app communication without turning the product into a chat app clone.

SQLite environment variables:

- `SQLITE_DB_PATH`: optional path for isolated tests.

Postgres environment variables:

- `DATABASE_URL`: Postgres connection string.

Current Postgres store status:

- `GET /api/health`: implemented.
- `GET /api/bootstrap`: implemented for circles, task templates, tasks, options, responses, and stats.
- `GET /api/tasks/:taskId`: implemented.
- `POST /api/tasks`: implemented.
- `PATCH /api/tasks/:taskId`: implemented for editable task details and active options.
- `POST /api/tasks/:taskId/convert`: implemented for converting `interest_check` tasks into `activity`, `poll`, or `claim` tasks.
- `GET /api/share/:token`: implemented.
- `POST /api/share/:token/responses`: implemented.
- `PATCH /api/responses/:responseId`: implemented.
- `PATCH /api/tasks/:taskId/status`: implemented.
- `POST /api/tasks/:taskId/announcements`: implemented.
- `POST /api/tasks/:taskId/comments`: implemented.
- `GET /api/tasks/:taskId/export.csv`: implemented.

Do not treat `DATA_STORE=postgres` as production-ready until auth, RLS, deployment, backups, and operational verification are implemented.

### `GET /api/health`

Checks API and database path.

### `GET /api/bootstrap`

Returns circles, tasks, templates, stats, options, and responses.

### `GET /api/tasks/:taskId`

Returns one task with options, responses, and stats.

### `POST /api/tasks`

Creates a task from a selected template.

### `PATCH /api/tasks/:taskId`

Updates task title, description, deadline, payment or fee instructions, pickup or gathering instructions, and active options. Existing options omitted from the payload are deactivated instead of deleted so historical responses remain readable.

### `POST /api/tasks/:taskId/convert`

Converts an `interest_check` task into an `activity`, `poll`, or `claim` task while preserving the source response summary in metadata and a system comment. The organizer can override title, description, deadline, payment or fee instructions, pickup or gathering instructions, and follow-up options before creating the new task.

### `GET /api/share/:token`

Returns a task for a participant share link.

### `POST /api/share/:token/responses`

Creates a participant response from a share link.

### `PATCH /api/responses/:responseId`

Updates payment status, fulfillment status, or note.

### `PATCH /api/tasks/:taskId/status`

Opens or closes a task.

### `POST /api/tasks/:taskId/announcements`

Publishes a task-level announcement for organizer notices.

### `POST /api/tasks/:taskId/comments`

Creates a task-level comment from an organizer or participant.

### `GET /api/tasks/:taskId/export.csv`

Exports task responses as CSV.

## Local Commands

From `website/`:

```bash
npm install
npm run seed
npm run api
npm run dev -- --port 5174
npm run test:api
npm run build
```

`npm run test:api` starts temporary API servers on free ports and verifies the core task workflow against both SQLite and local Postgres:

- bootstrap data
- task creation
- task detail and option editing
- interest-check conversion into a follow-up task
- share-link task read
- task announcement creation
- task comment creation
- participant response submission
- payment and fulfillment status update
- task close/reopen
- CSV export

Set `SKIP_POSTGRES_SMOKE=1` only when local Postgres is intentionally unavailable. For Docker Postgres parity, set `API_SMOKE_DATABASE_URL` explicitly.

Current local URLs:

- Website: `http://127.0.0.1:5174/`
- API: `http://127.0.0.1:8787/`

For isolated API tests, set `SQLITE_DB_PATH` to a temporary file before starting the API. If omitted, the API uses `website/data/circles.sqlite`.

## Docker Development

The repository includes `docker-compose.yml` for a repeatable local development setup.

Default Docker URLs:

- Website: `http://127.0.0.1:5175/`
- API: `http://127.0.0.1:8788/`

Default command:

```bash
docker compose up -d api web
```

Optional Docker profiles are available for services that should not run until needed:

- `postgres`: Postgres and Adminer for production-schema work.
- `tools`: Redis and Mailpit for notifications, queues, rate limits, and email testing.
- `storage`: MinIO for attachment and payment-proof upload testing.

See [Docker Development Environment](docker-development.md).

## Current Technical Tradeoff

The backend uses Node's built-in SQLite support through `node:sqlite`. This keeps the MVP dependency-light and easy to run locally. It is acceptable for local product validation, but a production build should later move to a stable database layer such as Postgres/Supabase, Turso/libSQL, or a managed SQLite-compatible service.

## Production Database Direction

The first Postgres/Supabase-oriented schema lives in:

- `supabase/migrations/202606270001_initial_schema.sql`

Supporting docs:

- [Postgres Schema Plan](postgres-schema.md)

This schema has been verified against Homebrew Postgres and Docker Postgres. It includes identity, circles, memberships, tasks, responses, payment records, announcements, comments, lightweight chat foundations, notifications, attachments, and audit events.

The current website has not been switched to Postgres yet. Keep SQLite for the working local MVP until the editable task workflow and auth decisions are stable enough to introduce a Postgres data access layer.
