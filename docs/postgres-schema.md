# Postgres Schema Plan

This document describes the first production-oriented Postgres schema for `圈內 / InCircle`.

Current status:

- Migration file: `supabase/migrations/202606270001_initial_schema.sql`
- Verified against Homebrew Postgres: yes, at `127.0.0.1:5434`
- Verified against Docker Postgres: yes, as an optional parity path
- Current public Mac website runtime database: Homebrew Postgres at `127.0.0.1:5434`
- SQLite support: still available for isolated local development and fallback tests
- API data access layer: `website/server/data/storeFactory.js` selecting `sqliteStore.js` or `postgresStore.js`
- Postgres demo seed: `supabase/seed.sql`
- Postgres store: implemented in `website/server/data/postgresStore.js`
- API migration to Postgres: core MVP task reads/writes, task edits, interest-check conversion, share responses, status updates, CSV export, session/membership/permission scaffolding, and conversation/message/device/notification scaffolding are implemented
- Auth identity/session migration: `supabase/migrations/202606270002_auth_identity_sessions.sql`

The goal of this schema is to align the product with the future Expo / React Native + Supabase / Postgres architecture while keeping the current website able to run either on Postgres or SQLite through the store layer.

## Why Postgres Now

Postgres should be designed now because it affects:

- Mobile app API contracts.
- Supabase Auth mapping.
- Realtime notifications and chat.
- Payment and pickup records.
- Attachment and payment proof storage.
- Auditability.

The public Mac-hosted Express API now uses Postgres for early development and private beta checks. This is still a local-hosted public path, not the final production architecture.

`DATA_STORE=postgres` is currently useful for connectivity, migrated public data, seeded demo data, task reads, authenticated task creation, task detail/option edits, interest-check conversion, share-link reads, share responses, organizer status updates, task announcements, comments, CSV validation, cookie-session/profile-header session context, membership checks, task permissions, circle invites, member management, and Postgres-backed conversation/message/device/notification APIs. It should not be treated as fully production-ready until RLS/access policies, push delivery providers, monitoring, and deployment operations are implemented.

## Schema Groups

### Identity And Circle Access

Tables:

- `profiles`
- `auth_identities`
- `auth_sessions`
- `auth_oauth_states`
- `devices`
- `circles`
- `circle_memberships`
- `circle_invites`

Notes:

- `profiles.id` is a UUID. In Supabase, this can later map to `auth.users.id`.
- `auth_identities` stores Apple, Google, LINE, or future provider identities separately from `profiles`.
- `auth_sessions` stores only token hashes; the raw session token is kept in an `HttpOnly` cookie.
- `auth_oauth_states` stores short-lived state/nonce records for OAuth callbacks.
- The migration does not add Supabase Row Level Security policies yet. Those should be added after auth flow decisions are stable.
- `devices` is ready for Expo push tokens and notification delivery tracking.

### Task Engine

Tables:

- `task_templates`
- `tasks`
- `task_options`
- `responses`
- `response_items`

Supported templates:

- `group_buy`
- `interest_check`
- `claim`
- `member_sale`
- `meal_order`
- `drink_order`
- `activity`
- `poll`
- `expense_split`

Key rule:

`tasks` is the central object. Do not rebuild the product around only `group_buy`.

### Money And Fulfillment

Tables:

- `payment_records`
- payment-related fields on `responses`

Current direction:

- The MVP should keep manual payment tracking.
- `payment_records` supports later payment proof, transfer last-five-digits, confirmation, and refunds.
- Do not hold user money in InCircle until the legal/accounting/payment process is deliberately designed.

### Announcements, Comments, Chat, And Notifications

Tables:

- `announcements`
- `announcement_receipts`
- `task_comments`
- `conversations`
- `messages`
- `message_reads`
- `notifications`
- `notification_deliveries`

Phased product mapping:

- Phase 1: `announcements`, `announcement_receipts`, `task_comments`
- Phase 2: `notifications`, `notification_deliveries`, `devices`
- Phase 3: `conversations`, `messages`, `message_reads`

This keeps the product from becoming a chat app clone while still supporting in-app circle communication.

Current API support has started Phase 2 and Phase 3 at the data/API layer: device registration, notification rows, conversations, messages, and read receipts exist in Postgres. Real push delivery, unread badge rules, mute rules, and Supabase Realtime/mobile subscriptions are still future work.

### Attachments And Audit

Tables:

- `attachments`
- `audit_events`

Attachment use cases:

- Avatars.
- Item photos.
- Payment proofs.
- Chat or announcement attachments.

Audit use cases:

- Organizer changes status.
- Payment confirmation.
- Task closing/reopening.
- Invite or membership changes.

## Local Homebrew Postgres Commands

Start Postgres:

```bash
brew services start postgresql@16
```

Apply the migration:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local -v ON_ERROR_STOP=1 \
  < supabase/migrations/202606270001_initial_schema.sql
```

Apply demo seed data:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local -v ON_ERROR_STOP=1 \
  < supabase/seed.sql
```

Inspect template data:

```bash
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local \
  -c "select id, display_name, sort_order from task_templates order by sort_order;"
```

Current local connection:

- Host: `127.0.0.1`
- Port: `5434`
- Username: `incircle`
- Password: `incircle_local_password`
- Database: `incircle_local`
- URL: `postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local`

## Verified Result

The initial migration has been verified locally with:

- 21 base tables.
- 9 task templates.
- 4 seeded demo circles.
- 6 seeded demo tasks.
- 18 seeded responses and response items.
- 1 seeded task announcement.
- 1 seeded task comment.
- Re-runnable migration behavior.
- Re-runnable seed behavior.
- Postgres API task reads through `GET /api/bootstrap`, `GET /api/tasks/:taskId`, and `GET /api/share/:token`.
- Postgres API session/membership support through `GET /api/session`, `GET /api/circles/:circleId/members`, and `GET /api/tasks/:taskId/permissions`.
- Postgres API task creation through `POST /api/tasks`, requiring authenticated `owner` / `admin` circle membership.
- Postgres API task edits through `PATCH /api/tasks/:taskId`, requiring the task creator or active circle `owner` / `admin`.
- Postgres API interest-check conversion through `POST /api/tasks/:taskId/convert`, requiring the task creator or active circle `owner` / `admin`.
- Postgres API share responses through `POST /api/share/:token/responses`.
- Postgres API status updates through `PATCH /api/responses/:responseId` and `PATCH /api/tasks/:taskId/status`, requiring task-manager authorization.
- Postgres API task announcements through `POST /api/tasks/:taskId/announcements`, requiring task-manager authorization.
- Postgres API task comments through `POST /api/tasks/:taskId/comments`.
- Postgres API conversation/message scaffolding through circle conversations, conversation messages, and message read receipts.
- Postgres API push scaffolding through device registration, notification listing, and notification read state.
- Postgres CSV export through `GET /api/tasks/:taskId/export.csv`, requiring task-manager authorization.
- Automated API smoke coverage through `npm run test:api`, shared with SQLite for core task behavior and extended in Postgres for membership, permissions, anonymous authorization rejection, conversations, message reads, notifications, and devices.
- SQLite-to-Postgres migration through `website/scripts/migrate-sqlite-to-postgres.mjs`.
- Daily local backup and restore drill through `website/scripts/postgres-backup-restore.mjs`, with verified artifacts copied to iCloud Drive.
- Public Mac API health verified with `backend: "postgres"`.
- A transaction-only smoke test that creates and rolls back:
  - profile
  - circle
  - membership
  - task
  - option
  - response
  - response item
  - announcement
  - announcement receipt
  - task comment
  - conversation
  - message
  - message read
  - notification

## Next Database Steps

Recommended next steps:

1. Replace temporary profile headers with real auth tokens or Supabase Auth.
2. Add RLS/access-policy migration after auth decisions are made.
3. Add Supabase Realtime subscriptions for announcements, comments, messages, and notifications.
4. Add APNs/FCM push delivery workers and delivery-state handling.
5. Decide when to move from Mac-hosted Postgres to managed Supabase/Postgres or a VPS-hosted database.
6. Add CI wiring for `npm run test:api` when the repository is pushed to GitHub.
