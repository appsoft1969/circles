# InCircle

Product name: 圈內 InCircle

Positioning: 熟人圈的生活辦事空間

InCircle is an early-stage product concept for helping known small groups coordinate practical tasks such as group buys, circle-only member sales, signups, payment tracking, and simple activity management.

The current product direction is:

> Turn scattered +1 messages into clear names, counts, payment status, and reusable records.

In Chinese:

> 把群裡的 +1，變成清楚的名單與統計。

Supporting copy:

> 訂飲料、揪吃飯、團購、票券、KTV，誰要、幾份、誰付了，圈內幫你整理清楚。

## Current MVP Direction

The first version should focus on casual group-buy management for known groups, then extend the same engine to nearby circle tasks:

- Organizer creates a circle.
- Organizer creates a group buy.
- App generates a shareable link for a chat group.
- Participants submit orders without installing an app.
- Organizer tracks quantities, payment status, pickup status, and exports results.
- A trusted member can also open a circle-only sale for self-grown produce, handmade items, or small-batch goods.

## Product Documents

- [MVP PRD](docs/prd-mvp.md)
- [Competitive Positioning](docs/competitive-positioning.md)
- [Chat Group Companion Strategy](docs/chat-group-companion-strategy.md)
- [MVP Wireframes](docs/wireframes-mvp.md)
- [Product Roadmap](docs/roadmap.md)
- [Cost Estimate And Recommendations](docs/cost-estimate.md)
- [Docker Development Environment](docs/docker-development.md)
- [Domain And Production Deployment](docs/domain-and-production-deployment.md)
- [Local Mac Public Hosting](docs/local-mac-public-hosting.md)
- [Postgres Schema Plan](docs/postgres-schema.md)

## Prototype

- [Clickable MVP Prototype](prototype/)
- [Design QA](design-qa.md)

The current prototype direction combines the group-buy management workbench with the chat-group participant order form. It is a low-fidelity, mobile-first React prototype for validating the core flow before committing to a full product architecture.

## Website And Database

- [Website App](website/)
- [Technical Architecture](docs/technical-architecture.md)

The first database-backed website is implemented as a React/Vite frontend with an Express API and a local SQLite database. It supports multiple chat-group companion templates: group buy, interest check, claim/registration, circle-only member sale, office meal order, drink order, activity/KTV signup, poll, and expense split.

Postgres/Supabase-oriented schema work lives in `supabase/`. The current Postgres path supports local schema validation, demo seed data, task reads, share-link reads, task creation, task detail/option edits, interest-check conversion, participant responses, task announcements, task comments, status updates, and CSV export. SQLite remains the default local runtime unless `DATA_STORE=postgres` is explicitly enabled.

Local development URLs:

- Website: `http://127.0.0.1:5174/`
- API: `http://127.0.0.1:8787/`

Docker development URLs:

- Website: `http://127.0.0.1:5175/`
- API: `http://127.0.0.1:8788/`

Core API smoke tests:

```bash
cd website
npm run test:api
```

This runs the same create-task, task edit, interest-check conversion, announcement, comment, share-response, status-update, and CSV flow against SQLite and local Postgres.

## Key Product Constraint

InCircle should not start as a social network, public marketplace, chat app, or full commerce backend. Circle-only member sales are allowed when they behave like a shared task inside a trusted group: list items, collect responses, track payment, and handle pickup.
