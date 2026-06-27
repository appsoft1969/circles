# Local Mac Public Hosting

This document captures the current no-Docker public hosting path for the Mac Studio at `114.33.179.210`.

Use this only for early development, demos, and private beta checks. A formal VPS is still the recommended production target once real users and payment records are involved.

## Current Shape

- Domain: `useincircle.app`
- Public IPv4: `114.33.179.210`
- Mac LAN IP: `192.168.1.80`
- Public entrypoints: `80` and `443`
- Static website build: `website/dist`
- API: `127.0.0.1:8787`
- Data store for the public API in this phase: local SQLite at `website/data/circles.sqlite`
- Local Postgres validation database: Homebrew PostgreSQL at `127.0.0.1:5434`, database `incircle_local`, user `incircle`
- Reverse proxy / HTTPS: Homebrew Caddy

## Router Requirement

The router must forward:

| Public port | Mac target |
|---|---|
| `80` | `192.168.1.80:80` |
| `443` | `192.168.1.80:443` |

`useincircle.app` and `www.useincircle.app` should both resolve to `114.33.179.210`.

## Build And Start

Build the static website:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
npm run build
```

Start the API:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
npm run api
```

For a persistent local service, install the LaunchAgent instead:

```bash
mkdir -p ~/Library/LaunchAgents
ln -sf /Users/kevin_huang/Documents/Projects/circles/deploy/launchd/com.useincircle.api.plist ~/Library/LaunchAgents/com.useincircle.api.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.useincircle.api.plist
launchctl kickstart -k gui/$(id -u)/com.useincircle.api
```

API logs:

- `website/artifacts/incircle-api.out.log`
- `website/artifacts/incircle-api.err.log`

Caddy uses:

```bash
/Users/kevin_huang/Documents/Projects/circles/deploy/Caddyfile.local-mac
```

Validate the Caddy config:

```bash
caddy validate --config /Users/kevin_huang/Documents/Projects/circles/deploy/Caddyfile.local-mac
```

Start Caddy as a Homebrew service:

```bash
ln -sf /Users/kevin_huang/Documents/Projects/circles/deploy/Caddyfile.local-mac /opt/homebrew/etc/Caddyfile
brew services start caddy
```

## Verify

```bash
curl -I http://useincircle.app
curl -I https://useincircle.app
curl https://useincircle.app/api/health
curl -I https://www.useincircle.app
```

Expected behavior:

- `http://useincircle.app` redirects to HTTPS.
- `https://useincircle.app` serves the InCircle website.
- `https://useincircle.app/api/health` returns API health JSON.
- `https://www.useincircle.app` redirects to `https://useincircle.app`.

Service checks:

```bash
brew services list | rg caddy
launchctl print gui/$(id -u)/com.useincircle.api
lsof -nP -iTCP:80 -sTCP:LISTEN
lsof -nP -iTCP:443 -sTCP:LISTEN
lsof -nP -iTCP:8787 -sTCP:LISTEN
lsof -nP -iTCP:5434 -sTCP:LISTEN
```

## Notes

- Do not expose the Vite dev server directly to the internet.
- Keep the API bound to `127.0.0.1`; Caddy is the public entrypoint.
- Keep daily copies of `website/data/circles.sqlite` if this path is used for real beta data.
- Keep Homebrew PostgreSQL on `127.0.0.1:5434`; do not expose it to the internet.
- Stop or remove any other service using ports `80` or `443` before starting Caddy.
- Keep the Docker dev stack stopped while this Mac is acting as the public HTTPS host.

Native Postgres checks:

```bash
brew services list | rg postgresql@16
PGPASSWORD=incircle_local_password /opt/homebrew/opt/postgresql@16/bin/psql \
  -h 127.0.0.1 -p 5434 -U incircle -d incircle_local \
  -c "select current_database(), current_user;"
```

Stop the InCircle Docker dev stack without deleting volumes:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
docker compose --profile postgres --profile tools --profile storage stop
```

Start the Docker dev stack again only when needed for local parity work:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
docker compose --profile postgres --profile tools --profile storage up -d
```
