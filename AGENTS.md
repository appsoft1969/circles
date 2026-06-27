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

## Mobile And App Direction

- Primary usage is mobile-first: iPhone, Android, and iPad.
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

## Current Local Implementation

- Current working website: `website/`.
- Current frontend: React + Vite.
- Current backend: Express.
- Current local database: SQLite via Node `node:sqlite`, stored at `website/data/circles.sqlite`.
- Current local website URL: `http://127.0.0.1:5174/`.
- Current local API URL: `http://127.0.0.1:8787/`.
- Current prototype: `prototype/`, usually served at `http://127.0.0.1:5173/`.
- The SQLite implementation is for local validation. For production, move to a stable managed database layer, preferably Postgres/Supabase unless a later decision changes this.

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
  - API stays bound to `127.0.0.1`; do not expose the Express server directly to the internet.
- Data store for this local public phase remains SQLite at `website/data/circles.sqlite` unless explicitly changed.
- Homebrew PostgreSQL 16 is installed for local Postgres validation at `127.0.0.1:5434`.
- Local Postgres database: `incircle_local`; local app user: `incircle`.
- Local Postgres connection string: `postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local`.
- Do not expose the Vite dev server (`5174`) publicly. Public traffic should enter through Caddy only.
- Do not expose local Postgres publicly. Keep it bound to `127.0.0.1`.
- When deploying a public website update on this Mac, run `npm run build` in `website/` so Caddy serves the refreshed `website/dist` build.
- Check current public hosting with:

```bash
curl -I https://useincircle.app
curl -s https://useincircle.app/api/health
launchctl print gui/$(id -u)/com.useincircle.api
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
  - `複製分享連結` for external sharing.

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
- Do not switch the runtime API from SQLite to Postgres by sprinkling database calls through route handlers. Introduce a clear data access layer first.
- `DATA_STORE=postgres` currently supports health, seeded demo reads, share-link reads, task creation, task detail/option edits, interest-check conversion, share responses, response status updates, task status updates, announcements, comments, and CSV export. Do not present it as production-ready until auth, RLS, deployment, backups, and operational verification are implemented.
- Task announcements and task comments are the current communication layer. Keep them tied to a circle/task workflow; do not turn them into a standalone chat/feed surface.
- Do not remove or overwrite user-created work.
- Do not commit, stage, push, or create PRs unless explicitly requested.
- When the user has already asked to continue autonomously, keep moving to the next concrete artifact instead of repeatedly asking for confirmation.

## Verification Rules

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
```

- `npm run test:api` expects local Homebrew Postgres at `127.0.0.1:5434` unless `API_SMOKE_DATABASE_URL` overrides it or `SKIP_POSTGRES_SMOKE=1` is explicitly set.
- Since the InCircle Docker dev stack should normally stay stopped during local public hosting, prefer the Homebrew Postgres path for parity tests. Use Docker Postgres only when explicitly testing the Docker stack.

- If local services are stale, restart the API and Vite dev server rather than leaving the user on an old build.
- When UI behavior changes, verify in the browser when feasible, especially mobile-width layouts and `/join/:token` flows.
- Report what was verified and what was not verified in the final response.
