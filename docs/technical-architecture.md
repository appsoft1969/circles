# Technical Architecture

The first working website lives in `website/`.

It is intentionally simple:

- Frontend: React + Vite.
- Backend: Express.
- Data access: `website/server/data/storeFactory.js`, with SQLite and Postgres store implementations.
- Mobile web shell: PWA manifest, app icons, and a conservative service worker in `website/public/`.
- Current public Mac database: Homebrew Postgres at `127.0.0.1:5434`, database `incircle_local`.
- SQLite fallback: `website/data/circles.sqlite`.
- Runtime API: `http://127.0.0.1:8787`.
- Local website: `http://127.0.0.1:5174`.
- Current public HTTPS domain: `https://useincircle.app`, with `.com`, `.info`, and `www` variants redirected by Caddy.

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

## Mobile Web Shell

The web MVP is mobile-first and has a basic installable-app foundation:

- `website/index.html` defines theme color, mobile app title, Apple home-screen metadata, SVG favicon, and manifest link.
- `website/public/manifest.json` defines the app name, start URL, standalone display mode, language, theme colors, and required PNG icons.
- `website/public/sw.js` registers a conservative app-shell service worker: it may cache the web shell and icons, but it deliberately does not cache `/api/*` data.
- `website/public/icons/incircle.svg` is the source icon.
- `website/scripts/generate-pwa-icons.mjs` generates `icon-192.png`, `icon-512.png`, and `maskable-512.png`.

Regenerate icon PNGs with:

```bash
cd website
npm run icons:pwa
```

The service worker is intentionally conservative. Task counts, payment status, chat messages, and notifications still come from the network so the app does not show stale operational data as if it were current. The service worker also contains the browser-side `push` and `notificationclick` handlers for Web Push delivery. Native APNS/FCM app push remains future work.

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

Route handlers should not contain raw SQL. Database-specific behavior belongs in `website/server/data/sqliteStore.js` or `website/server/data/postgresStore.js`, selected by `website/server/data/storeFactory.js`.

The current auth layer supports Apple, Google, and LINE OAuth/OIDC scaffolding, Postgres-backed `auth_identities`, `auth_sessions`, `auth_oauth_states`, and an `HttpOnly` cookie session. Provider credentials are not configured yet on the public Mac host. Temporary `x-incircle-profile-id` / `x-incircle-profile-email` headers remain available for development smoke paths, but they are not a production login mechanism.

## Data Store Selection

The API uses `website/server/data/storeFactory.js`.

Supported `DATA_STORE` values:

- `sqlite`: default working MVP runtime.
- `postgres`: current public Mac runtime and local parity runtime for validating Postgres connectivity, migrated public data, seeded demo data, profile display-name settings, circle creation/settings, core task workflows, task edits, interest-check conversion, share-link submissions, status updates, announcements, comments, CSV export, membership/permission APIs, and Postgres-backed conversation/message/push-device scaffolding. The current Mac default is Homebrew PostgreSQL on `127.0.0.1:5434`.
- Task announcements and task comments are part of the core task object in both stores. Postgres also exposes the first conversation/message/read/notification/device APIs, still tied to circles and tasks.

SQLite environment variables:

- `SQLITE_DB_PATH`: optional path for isolated tests.

Postgres environment variables:

- `DATABASE_URL`: Postgres connection string.

Current Postgres store status:

- `GET /api/health`: implemented.
- `GET /api/bootstrap`: implemented for task templates plus member-scoped circles, tasks, options, responses, and stats. Anonymous Postgres calls return no circles or tasks.
- `GET /api/session`: implemented for cookie sessions plus temporary profile-header development scaffolding.
- `PATCH /api/profile`: implemented for authenticated profile display-name settings. Provider email and identity fields stay read-only in this MVP.
- `GET /api/auth/providers`: implemented for Apple, Google, and LINE provider state.
- `GET /api/auth/:provider/start`: implemented for configured OAuth/OIDC providers.
- `GET|POST /api/auth/:provider/callback`: implemented for provider callbacks and cookie session creation.
- `POST /api/auth/logout`: implemented.
- `POST /api/auth/dev-session`: implemented only when `AUTH_DEV_LOGIN_ENABLED=1`.
- `GET /api/circle-invites/:code`: implemented for public circle-invite preview.
- `POST /api/circle-invites/:code/join`: implemented for authenticated invite acceptance.
- `POST /api/circles`: implemented for authenticated circle creation and automatic owner membership.
- `PATCH /api/circles/:circleId`: implemented for owner-only circle name/description settings.
- `GET /api/circles/:circleId/members`: implemented with active membership requirement.
- `PATCH /api/circles/:circleId/members/:membershipId`: implemented for owner/admin member display name, contact hint, role, and status changes.
- `GET /api/circles/:circleId/invites`: implemented for owner/admin invite management.
- `POST /api/circles/:circleId/invites`: implemented for owner/admin invite creation.
- `PATCH /api/circles/:circleId/invites/:inviteId`: implemented for owner/admin invite revocation.
- `GET /api/tasks/:taskId`: implemented with active circle membership requirement. Public task reads must use `/api/share/:token`.
- `GET /api/tasks/:taskId/permissions`: implemented for read/respond/manage/announce/close/export flags.
- `POST /api/tasks`: implemented with authenticated owner/admin circle role requirement.
- `PATCH /api/tasks/:taskId`: implemented for editable task details and active options with task-manager authorization.
- `POST /api/tasks/:taskId/convert`: implemented for converting `interest_check` tasks into `activity`, `poll`, or `claim` tasks with task-manager authorization.
- `GET /api/share/:token`: implemented.
- `POST /api/share/:token/responses`: implemented.
- `PATCH /api/responses/:responseId`: implemented for organizer payment/fulfillment updates with task-manager authorization.
- `PATCH /api/tasks/:taskId/status`: implemented with task-manager authorization.
- `POST /api/tasks/:taskId/announcements`: implemented with task-manager authorization.
- `POST /api/announcements/:announcementId/confirm`: implemented in Postgres with active circle-membership requirement.
- `POST /api/tasks/:taskId/comments`: implemented.
- `GET /api/tasks/:taskId/export.csv`: implemented with task-manager authorization.
- `GET /api/circles/:circleId/conversations`: implemented in Postgres.
- `POST /api/circles/:circleId/conversations`: implemented in Postgres.
- `GET /api/conversations/:conversationId/messages`: implemented in Postgres.
- `POST /api/conversations/:conversationId/messages`: implemented in Postgres and queues in-app notification rows for other profile-linked members.
- `POST /api/messages/:messageId/read`: implemented in Postgres with membership check.
- `GET /api/push/config`: implemented for Web Push public-key discovery.
- `GET /api/push/status`: implemented in Postgres for station-admin Web Push delivery observability.
- `POST /api/push/test`: implemented in Postgres for user-triggered self test notifications.
- `POST /api/devices`: implemented in Postgres for push-token and Web Push subscription registration.
- `DELETE /api/devices`: implemented in Postgres for revoking the current user's registered push device.
- `GET /api/notifications`: implemented in Postgres.
- `GET /api/notifications/preferences`: implemented in Postgres.
- `PATCH /api/notifications/preferences`: implemented in Postgres.
- `GET /api/circles/:circleId/notification-preferences`: implemented in Postgres.
- `PATCH /api/circles/:circleId/notification-preferences`: implemented in Postgres.
- `PATCH /api/notifications/:notificationId/read`: implemented in Postgres.

Do not treat `DATA_STORE=postgres` as fully production-ready until auth, RLS/access policies, deployment hardening, backups, monitoring, and operational verification are implemented.

### `GET /api/session`

Returns the current cookie session or temporary development profile context and circle memberships. Anonymous calls return `authenticated: false`.

### `PATCH /api/profile`

Updates the authenticated profile display name only. This name is used as the default friendly name in member flows; OAuth provider email and provider identity IDs are not changed here.

### Auth Routes

The auth routes live in `website/server/index.js`; provider-specific OAuth/OIDC behavior lives in `website/server/auth/oauthProviders.js`.

Supported providers:

- `apple`
- `google`
- `line`

Provider credentials are configured through environment variables documented in [Social Login And Member Auth](auth-social-login.md).

### `GET /api/circles/:circleId/members`

Returns active members for a circle. Requires the temporary profile header to resolve to an active member.

### `POST /api/circles`

Creates a private circle for the authenticated profile and immediately creates an active `owner` membership for that profile. The MVP accepts a required `name` and optional `description`; inviting additional members remains separate through circle invite links.

### `PATCH /api/circles/:circleId`

Updates circle name and description. Requires the authenticated profile to be an active `owner` member of the circle; `admin` members can manage invites and members but cannot change the circle's identity settings.

### Circle Invite And Member Management Routes

Circle invite links are separate from task share links. `/invite/:code` is for joining a circle after login; `/join/:token` remains the no-login task response flow.

- `GET /api/circle-invites/:code`: returns public invite preview data if the invite is active, unexpired, and under its usage limit.
- `POST /api/circle-invites/:code/join`: requires an authenticated profile and creates or reactivates an active circle membership.
- `GET /api/circles/:circleId/invites`: requires owner/admin membership and returns active invite links.
- `POST /api/circles/:circleId/invites`: requires owner/admin membership and creates a member/guest invite.
- `PATCH /api/circles/:circleId/invites/:inviteId`: requires owner/admin membership and revokes an invite with `{ "revoked": true }`.
- `PATCH /api/circles/:circleId/members/:membershipId`: requires owner/admin membership and updates non-owner member display name, contact hint, role, or status.

### `GET /api/health`

Checks API and database path.

### `GET /api/bootstrap`

Returns task templates for every caller. In Postgres, authenticated members also receive only their active circles and those circles' tasks, stats, options, responses, announcements, and comments. Anonymous callers receive no circles or tasks.

### `GET /api/tasks/:taskId`

Returns one task with options, responses, and stats for an active member of the task circle. Public participant access must use `GET /api/share/:token`.

### `GET /api/tasks/:taskId/permissions`

Returns task-level capability flags for the authenticated profile context. In Postgres, the caller must be an active member of the task circle; anonymous callers and non-members are rejected.

### `POST /api/tasks`

Creates a task from a selected template. In Postgres, the current profile must be an active `owner` or `admin` member of the target circle.

### `PATCH /api/tasks/:taskId`

Updates task title, description, deadline, payment or fee instructions, pickup or gathering instructions, and active options. Existing options omitted from the payload are deactivated instead of deleted so historical responses remain readable. In Postgres, the current profile must be the task creator or an active circle `owner` / `admin`.

### `POST /api/tasks/:taskId/convert`

Converts an `interest_check` task into an `activity`, `poll`, or `claim` task while preserving the source response summary in metadata and a system comment. The organizer can override title, description, deadline, payment or fee instructions, pickup or gathering instructions, and follow-up options before creating the new task. In Postgres, the current profile must be the source task creator or an active circle `owner` / `admin`.

### `GET /api/share/:token`

Returns a task for a participant share link.

### `POST /api/share/:token/responses`

Creates a participant response from a share link.

### `PATCH /api/responses/:responseId`

Updates payment status, fulfillment status, or note.

### `PATCH /api/tasks/:taskId/status`

Opens or closes a task.

### `POST /api/tasks/:taskId/announcements`

Publishes a task-level announcement for organizer notices. In Postgres, this also creates announcement receipts, queues in-app notifications for other active circle members according to their profile-level and circle-level notification preferences, and mirrors the announcement into the task conversation so follow-up discussion has a clear context. Announcements can require member confirmation through `requiresConfirmation`; members confirm with `POST /api/announcements/:announcementId/confirm`, which updates the receipt and marks the matching notification read.

### `POST /api/tasks/:taskId/comments`

Creates a task-level comment from an organizer or participant.

### `GET /api/tasks/:taskId/export.csv`

Exports task responses as CSV.

### Conversation, Notification, And Device APIs

The Postgres store now supports:

- `GET /api/circles/:circleId/conversations`
- `POST /api/circles/:circleId/conversations`
- `GET /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/messages`
- `POST /api/messages/:messageId/read`
- `GET /api/push/config`
- `GET /api/push/status`
- `POST /api/push/test`
- `POST /api/devices`
- `DELETE /api/devices`
- `GET /api/notifications`
- `GET /api/notifications/preferences`
- `PATCH /api/notifications/preferences`
- `GET /api/circles/:circleId/notification-preferences`
- `PATCH /api/circles/:circleId/notification-preferences`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/:notificationId/read`

These are foundations for in-app coordination, not a standalone chat product. The current web UI exposes a notification center, unread summary, profile-level notification preferences, circle-level notification preferences, bulk read action, device-level Web Push subscription registration/revocation, a user-triggered test reminder, an admin-only `/ops/push` delivery report, and circle conversation screen on top of these APIs. Logged-in web sessions use lightweight 30-second foreground polling plus a visible/focus refresh so notification badges can update without a full page reload. Open circle conversation screens also refresh messages with conservative foreground polling while the page is visible. Notification preferences affect future in-app notification rows, and Web Push delivery also re-checks current profile/circle preferences plus quiet hours before creating a browser push delivery. SQLite returns `501` for these realtime/push routes.

## Local Commands

From `website/`:

```bash
npm install
npm run seed
npm run api
npm run dev -- --port 5174
npm run test:api
npm run backup:postgres
npm run backup:postgres:status
npm run ops:status
npm run launchd:push:reload
npm run push:vapid
npm run push:send -- --dry-run
npm run push:status
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
- session, circle-member, and task-permission scaffolding
- authenticated circle creation with owner membership
- Postgres-only conversation, message read, notification list, and device-registration scaffolding
- participant response submission
- payment and fulfillment status update
- task close/reopen
- CSV export

Set `SKIP_POSTGRES_SMOKE=1` only when local Postgres is intentionally unavailable. For Docker Postgres parity, set `API_SMOKE_DATABASE_URL` explicitly.

`npm run backup:postgres` creates a Postgres custom-format dump, restores it into a temporary database to verify core table counts, and copies verified artifacts to iCloud Drive when `OFFSITE_BACKUP_DIR` is set. The public Mac host also runs this check daily through `com.useincircle.postgres-backup`.

`npm run backup:postgres:status` checks backup freshness, local dump integrity, restore-check status, and iCloud copy presence/hash consistency. It writes `website/artifacts/postgres-backup-status.json` and exits non-zero when the backup state is unhealthy.

`npm run ops:status` checks the public site, `.app/.com/.info` redirects, API health, bootstrap data, a live share link, the current backup status, and the local Web Push delivery launchd/log state. It writes `website/artifacts/incircle-ops-status.json` and exits non-zero when the public hosting state is unhealthy. The launchd version enables macOS notifications on failure and stores cooldown state in `website/artifacts/incircle-ops-alert-state.json`.

`npm run push:vapid` generates a Web Push VAPID key pair for the private local production env. Do not commit the generated private key.

`npm run push:send` sends queued unread notification rows to registered Web Push browser subscriptions and records delivery status in `notification_deliveries`. The send step re-checks current profile/circle notification preferences, muted circles, important-only filters, and quiet hours before creating Web Push deliveries. Use `npm run push:send -- --dry-run` before scheduling or manual delivery checks.

`npm run push:status` writes `website/artifacts/web-push-status.json` with Web Push device counts, delivery counts, and recent failure details.

`npm run launchd:push:reload` installs/reloads the local Mac `com.useincircle.web-push` launch agent, which runs the Web Push delivery script on a short interval.

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

The backend can run on SQLite or Postgres. SQLite keeps isolated local validation simple, while the current public Mac-hosted site uses Homebrew Postgres so the product is closer to the future Supabase/Postgres direction.

The current Mac-hosted Postgres path is useful for early public testing, but it still needs real production hardening: auth, RLS/access policies, monitored provider-side backups, monitoring, and a formal deployment target. The current iCloud Drive copy is a useful early off-machine backup, not the final production backup architecture.

## Production Database Direction

The first Postgres/Supabase-oriented schema lives in:

- `supabase/migrations/202606270001_initial_schema.sql`

Supporting docs:

- [Postgres Schema Plan](postgres-schema.md)

This schema has been verified against Homebrew Postgres and Docker Postgres. It includes identity, circles, memberships, tasks, responses, payment records, announcements, comments, lightweight chat foundations, notifications, attachments, and audit events.

The current public Mac-hosted website has been switched to Postgres. Keep SQLite support available for isolated tests and fallback development, but do not let new database behavior bypass the store layer.
