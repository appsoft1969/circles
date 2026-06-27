# Domain And Production Deployment

## Purchased Domains

Current domains:

- `useincircle.app`
- `useincircle.com`
- `useincircle.info`

Recommended production role:

- Primary site: `https://useincircle.app`
- Redirects:
  - `https://www.useincircle.app`
  - `https://useincircle.com`
  - `https://www.useincircle.com`
  - `https://useincircle.info`
  - `https://www.useincircle.info`

`.app` domains require HTTPS in modern browsers. Treat HTTPS as mandatory for every public InCircle domain anyway because the product will handle signups, payment status, task comments, and notifications.

## SSL Recommendation

Use Caddy for automatic HTTPS.

Benefits:

- Automatic Let's Encrypt certificates.
- Automatic renewal.
- HTTP to HTTPS handling.
- Simple redirect rules for `.com` and `.info`.

The purchased `.app` certificate does not have to be installed if Caddy can issue and renew a certificate for `useincircle.app`. Keep the purchased certificate as backup unless there is a registrar or hosting requirement that specifically needs it.

You do not need to buy separate SSL certificates for `useincircle.com` or `useincircle.info` if the production server uses this Caddy setup.

## DNS Setup

After choosing a VPS or server IP, create these DNS records:

| Host | Type | Value |
|---|---|---|
| `useincircle.app` | `A` | production server IPv4 |
| `www.useincircle.app` | `A` or `CNAME` | production server IPv4 or `useincircle.app` |
| `useincircle.com` | `A` | production server IPv4 |
| `www.useincircle.com` | `A` or `CNAME` | production server IPv4 or `useincircle.com` |
| `useincircle.info` | `A` | production server IPv4 |
| `www.useincircle.info` | `A` or `CNAME` | production server IPv4 or `useincircle.info` |

If the server has IPv6, add matching `AAAA` records.

Do not proxy through another SSL provider until the first Caddy certificate issuance succeeds. Keep the initial path simple: DNS points directly to the server, and ports `80` and `443` are open.

## Production Compose Shape

Production uses:

- Caddy on public ports `80` and `443`.
- Static React build served by Caddy.
- Express API available only inside Docker as `api:8787`.
- Postgres available only inside Docker as `postgres:5432`.

Files:

- `docker-compose.production.yml`
- `deploy/Caddyfile`
- `website/Dockerfile.web`
- `website/Dockerfile.api`
- `.env.production.example`

## First Server Boot

On the production server:

```bash
cp .env.production.example .env.production
```

Edit `.env.production`:

- Set `CADDY_ACME_EMAIL`.
- Replace `POSTGRES_PASSWORD`.
- Keep `DATABASE_URL` in sync with the same password.

Start Postgres:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d postgres
```

Apply schema:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml --profile migrate run --rm db-migrate
```

Start API and Caddy:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build api caddy
```

Check health:

```bash
curl -I https://useincircle.app
curl https://useincircle.app/api/health
curl -I https://useincircle.com
curl -I https://useincircle.info
```

Expected behavior:

- `useincircle.app` serves the app.
- `/api/*` routes to the Express API.
- `.com`, `.info`, and `www` hosts redirect to `https://useincircle.app`.

## Next Production Gaps

This deployment skeleton is enough for a first HTTPS smoke test. Before real public users:

- Add authentication.
- Decide whether the first production database should stay Docker Postgres or move to managed Supabase/Postgres.
- Add backups for Postgres.
- Add observability and error logs.
- Add privacy policy and account deletion policy before App Store / Google Play submission.
