# InCircle Project Instructions

These rules apply to the whole repository unless a nested `AGENTS.md` adds more specific instructions.

## Product Identity

- Chinese product name: `圈內`.
- English product name: `InCircle`.
- The product was renamed from `小圈子 / Circles` to `圈內 / InCircle` by explicit user direction on 2026-06-27.
- User-facing writing should default to Traditional Chinese for Taiwan users.
- The core product sentence is:
  - `圈內 InCircle 是熟人圈的生活辦事空間：可以揪團、填單、統計、付款，也能在圈內即時通知與討論。`
- Public-facing copy should not name a specific chat platform. Use implicit language such as `群組`, `聊天群`, `群裡`, `+1`, `誰要`, `幾份`, and `誰付了`.
- The product is for people who already know each other or already share a real-life circle. It is not for public stranger discovery.

## Product Positioning

- Treat InCircle as a chat-group companion, not a chat app replacement.
- Stable principle:
  - `把群裡的 +1，變成清楚的名單與統計。`
- Supporting copy:
  - `訂飲料、揪吃飯、團購、票券、KTV，誰要、幾份、誰付了，圈內幫你整理清楚。`
- InCircle owns structured task workflows:
  - Signup.
  - Order or item selection.
  - Quantity counting.
  - Deadline control.
  - Payment status.
  - Pickup, attendance, or completion status.
  - Exportable records.
  - Reusing or duplicating previous tasks.
- External chat groups can remain a distribution and conversation channel, but InCircle must also support in-app task announcements, task discussion, and later lightweight real-time circle chat because members may not be connected on the same chat platform.

## Product Boundaries

- Do not turn InCircle into a public social network.
- Do not add a public feed, follower graph, friend graph, public group discovery, or creator/community platform features unless explicitly requested.
- Do not turn InCircle into a public marketplace or professional seller backend.
- Circle-only member sales are allowed when they behave like a private task inside a trusted circle.
- Do not start with full e-commerce complexity:
  - Seller storefronts.
  - Public listings.
  - Ratings/reviews.
  - Coupons.
  - Logistics integrations.
  - Complex tax/shipping rules.
  - Marketplace search/discovery.
- Do not start with native payment processing unless the user explicitly asks for it. Manual payment tracking is currently part of the MVP.

## Supported Task Templates

Use `task` as the generic product object. Do not hard-code the whole system around only `group_buy`.

Current and intended templates:

- `group_buy`: group buys, shared purchases, recurring casual buys.
- `interest_check`: early interest checks for movie, meal, sports game, free ticket, freebie, or casual meetup ideas before they become a real activity or claim flow.
- `claim`: confirmed free-ticket, seat, quota, freebie, or perk claim/registration after interest is known.
- `member_sale`: circle-only member sales such as self-grown vegetables, fruit, handmade goods, small-batch food, crafts, or extra inventory.
- `meal_order`: office lunch, dinner, bento, or shared food orders.
- `drink_order`: office drinks, cafe orders, sweetness, ice, toppings.
- `activity`: KTV, dinner, hiking, camping, sports, or casual gatherings.
- `poll`: time, location, restaurant, product option, or activity plan voting.
- `expense_split`: shared expense settlement after a purchase or activity.

Every template should share the same core flow:

1. Organizer creates a task inside a circle.
2. App creates a share token and `/join/:token` link.
3. Organizer shares the link to a chat group or inside InCircle.
4. Participants submit without app installation when possible.
5. Organizer manages counts, payment status, and completion status.
6. The task remains reusable as a record.

`interest_check` is distinct from `poll` and `activity`:

- Use `interest_check` to ask who is interested, who wants to reserve a spot/ticket, or who might join before anything is finalized.
- Use `claim` after free tickets, seats, quotas, freebies, or perks need an actual registration/claim list.
- Use `poll` when the group is choosing among options such as time, location, restaurant, or plan.
- Use `activity` after the organizer is ready to manage confirmed attendance, deposits, AA costs, or final logistics.

## Member Sale Rules

- Member sales must stay circle-only by default.
- Required concepts:
  - Seller name.
  - Item name.
  - Variant or pack size.
  - Unit price.
  - Optional available quantity.
  - Deadline.
  - Payment instructions.
  - Pickup instructions.
  - Payment status.
  - Pickup status.
- Good examples:
  - Self-grown vegetables or fruit.
  - Handmade goods.
  - Small-batch food or crafts.
  - Extra inventory shared only with known members.
- Bad early examples:
  - Public storefront.
  - Open marketplace.
  - Seller ranking.
  - Public item search.
  - Professional merchant dashboard.

## Chat And Notification Direction

- MVP should not clone chat apps.
- Preferred phased direction:
  - Phase 1: circle announcements and task-level comments.
  - Phase 2: real-time notifications, read/confirmation state, and push notifications.
  - Phase 3: lightweight circle chat where it supports task coordination.
- Chat features must remain tied to circle/task operations. Avoid a standalone social chat product.
- Important notifications should not require members to leave InCircle for an external chat app.
- Notification preferences should affect future reminder creation, not delete or hide historical notification records retroactively.
- Profile-level notification preferences control the user's overall reminder defaults. Circle-level notification preferences control only that user's reminders for one circle and must not change membership status or permissions.
- Current web notification preferences cover in-app notification rows. Quiet hours are recorded now so later APNs/FCM push delivery can respect them; do not claim current web quiet hours silence OS-level push because real push delivery is not implemented yet.

## Mobile And App Direction

- Primary usage is mobile-first: iPhone, Android, and iPad.
- Current web MVP has a basic installable-app foundation through `website/public/manifest.json`, generated PNG icons under `website/public/icons/`, and mobile meta tags in `website/index.html`.
- The current web MVP does not use a service worker yet. Do not add offline caching casually; stale task/notification data would be more harmful than helpful during early validation.
- The production app should be designed so it can eventually ship through Apple App Store and Google Play.
- Recommended production direction:
  - Expo / React Native.
  - TypeScript.
  - Expo Router.
  - TanStack Query.
  - Zustand when lightweight client state is needed.
  - React Hook Form + Zod for forms and validation.
  - Expo Notifications for push.
- Recommended backend direction:
  - Supabase / Postgres.
  - Supabase Auth.
  - Supabase Realtime.
  - Supabase Storage.
  - Supabase Edge Functions for notifications, payment webhooks, and server-side jobs.
- Suggested future repo layout:

```text
apps/
  mobile/        Expo React Native app for iPhone, Android, and iPad
  web/           Web admin, desktop view, or landing/waitlist
packages/
  ui/            Shared UI components
  shared/        Types, validation rules, utilities
supabase/
  migrations/    Postgres schema
  functions/     Edge functions
```

- Before public app-store launch, plan for privacy policy, account deletion, notification permissions, content/reporting policy, and payment compliance.
- For physical goods, meals, drinks, KTV, events, and member sales, normal external payment flows may be acceptable. If selling digital content inside the app, revisit Apple/Google in-app purchase rules.
- When changing the PWA icon source, update `website/public/icons/incircle.svg`, then run `cd website && npm run icons:pwa` to regenerate the PNG icons.

## Current Local Implementation

- Current working website: `website/`.
- Current frontend: React + Vite.
- Current backend: Express.
- Current API data access is selected by `DATA_STORE` through `website/server/data/storeFactory.js`.
- Current public Mac API database: Homebrew Postgres at `127.0.0.1:5434`, database `incircle_local`, user `incircle`.
- SQLite via Node `node:sqlite` is still supported for isolated local development and test fallback, stored at `website/data/circles.sqlite`.
- Current local website URL: `http://127.0.0.1:5174/`.
- Current local API URL: `http://127.0.0.1:8787/`.
- Current prototype: `prototype/`, usually served at `http://127.0.0.1:5173/`.
- The current public Postgres-on-Mac setup is for early development and private beta validation. Before real production scale, move to a hardened VPS or managed platform with backups, monitoring, auth, and access policies.

## Local Mac Public Hosting

- As of 2026-06-27, `https://useincircle.app` is served directly from this Mac Studio for early development and private beta checks.
- The current public hosting shape is documented in `docs/local-mac-public-hosting.md`.
- Public HTTPS entrypoint:
  - Homebrew Caddy listens on `80` and `443`.
  - Caddy config: `deploy/Caddyfile.local-mac`.
  - Static app root: `website/dist`.
  - API proxy: `/api/*` -> `127.0.0.1:8787`.
- API runtime:
  - macOS LaunchAgent label: `com.useincircle.api`.
  - LaunchAgent config: `deploy/launchd/com.useincircle.api.plist`.
  - Local private OAuth/API env file: `.env.production.local` at the repository root.
  - Local private LaunchAgent install command: `cd website && npm run launchd:api:reload`.
  - Do not commit Apple / Google / LINE OAuth secrets. Keep real provider credentials out of `deploy/launchd/com.useincircle.api.plist`; use the local ignored env file and generated `~/Library/LaunchAgents/com.useincircle.api.plist` for this Mac.
  - Local private-beta membership grant command: `cd website && npm run membership:grant -- --email <oauth-profile-email> --dry-run`, then rerun without `--dry-run` after verifying the planned circle roles.
  - API stays bound to `127.0.0.1`; do not expose the Express server directly to the internet.
- Data store for this local public phase is Homebrew PostgreSQL 16 at `127.0.0.1:5434`.
- Local Postgres database: `incircle_local`; local app user: `incircle`.
- Local Postgres connection string: `postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local`.
- The LaunchAgent should run with `DATA_STORE=postgres` and the Postgres `DATABASE_URL`.
- The previous SQLite public data file is kept at `website/data/circles.sqlite` as a fallback/source backup. Current switch backup files live under `website/data/backups/`.
- Current Postgres backup/restore runbook: `docs/postgres-backup-restore.md`.
- Daily Postgres backup LaunchAgent:
  - Label: `com.useincircle.postgres-backup`.
  - Config: `deploy/launchd/com.useincircle.postgres-backup.plist`.
  - Schedule: daily at `03:20`.
  - Backup directory: `website/data/backups/postgres`.
  - iCloud Drive copy: `/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres`.
  - Logs: `website/artifacts/postgres-backup.out.log` and `website/artifacts/postgres-backup.err.log`.
  - Status report: `website/artifacts/postgres-backup-status.json`.
- Public ops health check:
  - Script: `website/scripts/ops-health-check.mjs`.
  - Command: `npm run ops:status`.
  - LaunchAgent label: `com.useincircle.ops-health-check`.
  - Config: `deploy/launchd/com.useincircle.ops-health-check.plist`.
  - Schedule: every 15 minutes.
  - Logs: `website/artifacts/ops-health.out.log` and `website/artifacts/ops-health.err.log`.
  - Status report: `website/artifacts/incircle-ops-status.json`.
  - macOS alert state: `website/artifacts/incircle-ops-alert-state.json`.
  - macOS failure alerts are enabled in launchd with a 60-minute cooldown for repeated identical failures.
- SQLite-to-Postgres migration command:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
DATABASE_URL=postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local npm run migrate:sqlite-to-postgres
```

- Do not expose the Vite dev server (`5174`) publicly. Public traffic should enter through Caddy only.
- Do not expose local Postgres publicly. Keep it bound to `127.0.0.1`.
- When deploying a public website update on this Mac, run `npm run build` in `website/` so Caddy serves the refreshed `website/dist` build.
- Check current public hosting with:

```bash
curl -I https://useincircle.app
curl -s https://useincircle.app/api/health
launchctl print gui/$(id -u)/com.useincircle.api | rg 'state =|path =|pid ='
brew services list | rg caddy
brew services list | rg postgresql@16
```

## Domain And HTTPS Direction

- Purchased domains:
  - `useincircle.app`
  - `useincircle.com`
  - `useincircle.info`
- Preferred primary public domain: `https://useincircle.app`.
- Redirect `useincircle.com`, `www.useincircle.com`, `useincircle.info`, `www.useincircle.info`, and `www.useincircle.app` to `https://useincircle.app`.
- The current Mac Caddy config `deploy/Caddyfile.local-mac` must include the same `.com`, `.info`, and `www` redirects while this Mac is the public host.
- Public production must use HTTPS. `.app` requires HTTPS, and InCircle should use HTTPS everywhere for task links, signups, comments, payment status, and future notifications.
- Prefer Caddy automatic HTTPS for production. Do not require paid SSL certificates for `.com` or `.info` unless a hosting provider specifically requires manual certificates.
- Keep local development on HTTP at `127.0.0.1` unless explicitly testing production HTTPS behavior.

## Docker Usage Rules

- Docker Desktop is no longer required for the current public `useincircle.app` runtime on this Mac.
- Keep the InCircle Docker dev stack stopped while this Mac is acting as the public HTTPS host, unless actively doing Docker/Postgres parity work.
- Do not delete Docker volumes by default. Use `stop`, not `down -v`, unless the user explicitly requests cleanup.
- Stop the InCircle Docker dev stack without deleting data:

```bash
docker compose --profile postgres --profile tools --profile storage stop
```

- Start it only when needed for local parity work:

```bash
docker compose --profile postgres --profile tools --profile storage up -d
```

- The InCircle Docker dev stack exposes ports such as `5175`, `8788`, `5433`, `8081`, `6380`, `8025`, `9000`, and `9001`; avoid leaving these running on a machine with a public IP.
- `postgres-restaurant` on Docker port `5432` belongs to a separate local database context. Do not stop, remove, or modify it as part of InCircle work unless the user explicitly asks.

## Data Model Rules

- Preserve structured records. Do not bury important operational state in free-form chat text.
- Keep these concepts explicit:
  - Users/profiles.
  - Devices for push notifications.
  - Circle records.
  - Circle memberships.
  - Circle invites / invite codes.
  - Tasks.
  - Task templates.
  - Task options/items.
  - Responses.
  - Response items.
  - Payment records or payment status.
  - Pickup/fulfillment status.
  - Announcements.
  - Conversations/messages/message reads when chat is added.
  - Notifications and notification deliveries.
  - Attachments.
  - Audit events for important organizer actions.
- For early MVP work, simple task metadata can live in `metadata_json`, but promote repeated fields into real columns/tables when they become core behavior.

## UX And Design Rules

- Design mobile-first and iPad-aware.
- Build the actual usable workflow first. Do not make marketing-first landing pages unless requested.
- The interface should feel like a quiet operations tool for small real-life circles:
  - Clear counts.
  - Clear next actions.
  - Clear status labels.
  - Fast participant submission.
  - Organizer management table/list.
- Use progressive disclosure for forms and task setup. Show only required or immediately clarifying fields first; hide advanced options, optional details, and later-stage controls until the user reaches the right step or explicitly chooses to expand them.
- Prefer guided input over dense all-at-once forms. Reduce perceived complexity by asking for the next practical decision instead of showing every possible field, status, and option on one screen.
- Do not crowd mobile screens with fields just because the backend supports them. If a value is not needed to understand or complete the current step, defer it.
- Field hints, helper copy, and placeholders should be visually subordinate to real user input. Placeholder text must be smaller than entered text and use a lighter gray so users can clearly distinguish hints from filled values.
- Keep mobile typography friendly to older users without making the UI feel heavy. Primary actions and entered form values should stay clearly readable, normal body copy should generally avoid tiny sizes, and secondary helper text should remain legible while visually lighter than the main content.
- In guided flows, completed steps must switch from question wording to confirmation wording. If the user has already selected `訂飲料`, the step should say that it is selected and offer a clear way to reselect, not keep asking as if no choice was made.
- Guided copy should sound like a helpful person, not a system prompt. Prefer short, friendly, everyday phrasing such as `你已選好：訂飲料`, `想換的話，點這裡重選`, and `好了，儲存設定` over formal wording such as `需要更改時`.
- Avoid social-app patterns:
  - Infinite feed.
  - Public profile browsing.
  - Follower metrics.
  - Likes/reactions as primary interaction.
- Avoid heavy e-commerce UI:
  - Product catalog browsing.
  - Public storefronts.
  - Promotional banners.
  - Seller analytics dashboards.
- Use generic language where appropriate:
  - `建立事項` for template selection.
  - `成員填單` for participant submission.
  - `管理統計` for organizer operations.
  - `分享連結` / `分享填單連結` / `分享邀請連結` for external sharing. Link sharing should copy the URL as a fallback, then open the native share sheet when supported.

## Engineering Workflow

- Before making product changes, read the relevant files in `README.md`, `docs/`, `website/`, and nested `AGENTS.md` files.
- Use `rg` or `rg --files` first when searching.
- Keep changes scoped to the requested feature or product decision.
- If a new template or workflow is added, update all relevant layers:
  - Product docs.
  - Frontend template metadata.
  - Backend template labels/defaults.
  - Seed data when useful.
  - Technical architecture docs if the data model changes.
- If the production data model changes, update `supabase/migrations/` and `docs/postgres-schema.md`.
- Do not add database calls directly inside route handlers. Keep runtime database differences behind the store/data-access layer.
- `DATA_STORE=postgres` currently supports health, seeded/demo reads, migrated public data reads, share-link reads, authenticated profile display-name settings, authenticated circle creation/settings, authenticated task creation, task detail/option edits, interest-check conversion, share responses, organizer response/status updates, task announcements, announcement confirmation receipts, comments, CSV export, Apple/Google/LINE auth scaffolding, cookie sessions, circle invite/member-management APIs, membership/permission APIs, and Postgres-backed conversation/message/device/notification scaffolding with per-notification and bulk read state. Organizer task operations must require the task creator or active circle `owner` / `admin`. It is suitable for the current public Mac private-beta path, but do not present it as fully production-ready until real provider credentials, RLS/access policy, automated backups, monitoring, push delivery, and operational verification are implemented.
- Current session APIs support cookie sessions. Temporary `x-incircle-profile-id` / `x-incircle-profile-email` headers remain only as a development scaffold. Do not treat these headers as a production login mechanism.
- Do not enable `AUTH_DEV_LOGIN_ENABLED=1` in production launchd.
- Task announcements, task comments, and Postgres conversations are the current communication layer. Keep them tied to a circle/task workflow; do not turn them into a standalone chat/feed surface.
- The web client currently uses lightweight foreground notification polling. Do not describe this as production push or true realtime; APNs/FCM and Supabase Realtime are still future work.
- Do not enforce auth on public share-link response submission yet; the participant no-install `/join/:token` flow is still a core MVP constraint.
- Do not remove or overwrite user-created work.
- Commit rule: when a coherent, verified unit of work is complete and committing would reduce risk or preserve a stable checkpoint, Codex may proactively stage and commit that unit without waiting for another explicit user prompt.
- Push rule: as of 2026-06-28, the user explicitly authorized Codex to decide when to push verified, coherent commits while working autonomously. Codex may push without asking each time when the change is low-risk, verified, and worth syncing.
- Stop-and-ask rule: pause for user involvement before external-account actions, credentials/secrets, paid services, DNS/SSL changes, destructive data operations, high-risk production infra changes, or anything that requires the user's login/2FA/real-world confirmation.
- Do not create PRs unless explicitly requested.
- When the user has already asked to continue autonomously, keep moving to the next concrete artifact instead of repeatedly asking for confirmation.
- Completion update rule: after completing a task, include the recommended next progress step so the user understands what Codex plans to work on next.

## Verification Rules

- For a standard verified checkpoint after low-risk website/API work, run from `website/`:

```bash
npm run verify
```

This runs the production frontend build, SQLite/Postgres API smoke tests, Web Push delivery dry-run, and public ops status check.

- For website changes, run from `website/`:

```bash
npm run build
```

- If seed data, schema, or API behavior changes, also run:

```bash
npm run seed
npm run test:api
curl -s http://127.0.0.1:8787/api/health
curl -s http://127.0.0.1:8787/api/bootstrap
curl -s -H "x-incircle-profile-email: kevin@example.com" http://127.0.0.1:8787/api/bootstrap
```

- `npm run test:api` expects local Homebrew Postgres at `127.0.0.1:5434` unless `API_SMOKE_DATABASE_URL` overrides it or `SKIP_POSTGRES_SMOKE=1` is explicitly set.
- Since the InCircle Docker dev stack should normally stay stopped during local public hosting, prefer the Homebrew Postgres path for parity tests. Use Docker Postgres only when explicitly testing the Docker stack.
- For public hosting checks, verify `https://useincircle.app/api/health` returns `backend: "postgres"` before telling the user the public site is on Postgres.
- For public Postgres backup checks, run `npm run backup:postgres` from `website/`, then run `OFFSITE_BACKUP_DIR="/Users/kevin_huang/Library/Mobile Documents/com~apple~CloudDocs/InCircle/backups/postgres" npm run backup:postgres:status`. Confirm the status report has `ok: true`, no restore count mismatches, and matching local/iCloud dump SHA-256 values.
- For public ops checks, run `npm run ops:status` from `website/` and confirm `website/artifacts/incircle-ops-status.json` has `ok: true`.
- When testing failure paths for ops checks, set `OPS_ALERTS_ENABLED=0` and write to temporary `OPS_STATUS_PATH` / `OPS_ALERT_STATE_PATH` files to avoid sending false macOS notifications.

- If local services are stale, restart the API and Vite dev server rather than leaving the user on an old build.
- When UI behavior changes, verify in the browser when feasible, especially mobile-width layouts and `/join/:token` flows.
- Report what was verified and what was not verified in the final response.
