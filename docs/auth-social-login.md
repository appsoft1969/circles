# Social Login And Member Auth

This document captures the current InCircle member-auth direction.

## Current Status

Implemented:

- Postgres tables:
  - `auth_identities`
  - `auth_sessions`
  - `auth_oauth_states`
- API routes:
  - `GET /api/auth/providers`
  - `GET /api/auth/:provider/start`
  - `GET|POST /api/auth/:provider/callback`
  - `POST /api/auth/logout`
  - `POST /api/auth/dev-session` when `AUTH_DEV_LOGIN_ENABLED=1`
- Cookie session:
  - Cookie name: `incircle_session`
  - `HttpOnly`
  - `SameSite=Lax`
  - `Secure` by default
  - 30-day session lifetime
- Frontend:
  - Mobile-first sign-in panel on the dashboard.
  - Apple, Google, and LINE provider rows.
  - Signed-in profile summary and logout.
- Smoke coverage:
  - Provider list.
  - Postgres dev session cookie.
  - Session-backed member and task permission checks.
  - Logout and revoked-session behavior.

Not implemented yet:

- Real Apple / Google / LINE production credentials.
- Supabase Auth or RLS policies.
- Account merge UI.
- Phone number login.
- Production push delivery after login.

## Provider Priority

Recommended launch order:

1. Apple login for iPhone and iPad.
2. Google login for Android and Web.
3. LINE login for Taiwan familiarity.

Email should be stored as account metadata, not treated as the only stable identity. Use the provider user id as the stable login identity. Apple users may choose Hide My Email; this is valid and should be accepted.

## Environment Variables

Common:

```bash
PUBLIC_BASE_URL=https://useincircle.app
AUTH_BASE_URL=https://useincircle.app
AUTH_SESSION_COOKIE=incircle_session
```

Apple:

```bash
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

Google:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

LINE:

```bash
LINE_CLIENT_ID=
LINE_CLIENT_SECRET=
```

`LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` are also accepted aliases.

## Redirect URLs

Configure these callback URLs in each provider console:

```text
https://useincircle.app/api/auth/apple/callback
https://useincircle.app/api/auth/google/callback
https://useincircle.app/api/auth/line/callback
```

Apple uses `form_post`; Google and LINE use normal query callback.

## Development Login

The development-only route is:

```bash
POST /api/auth/dev-session
```

It only works when:

```bash
AUTH_DEV_LOGIN_ENABLED=1
```

Do not enable this in production launchd.

## Product Rules

- Keep `/join/:token` usable without login for low-friction participant filling.
- Require session-backed membership for circle member lists, conversation APIs, device registration, and future private member operations.
- Keep provider identities separate from profiles so one person can later link Apple, Google, and LINE to the same InCircle profile.
