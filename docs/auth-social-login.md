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

- Real Apple / LINE production credentials.
- Supabase Auth or RLS policies.
- Account merge UI.
- Phone number login.
- Production push delivery after login.

Current Google setup for the local public Mac host:

- Google Cloud project name: `InCircle`.
- Google Cloud project ID: `incircle-500722`.
- OAuth app name: `圈內 InCircle`.
- OAuth audience: `External`, testing mode.
- Test user: `appsoft.1969@gmail.com`.
- Web OAuth client name: `InCircle Web`.
- Authorized JavaScript origin: `https://useincircle.app`.
- Authorized redirect URI: `https://useincircle.app/api/auth/google/callback`.
- The real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` live only in the ignored local file `.env.production.local` and the generated local LaunchAgent plist.

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

## Google Login Setup

Start with Google because it covers Android users and web login with the least platform-specific setup.

Use Google Cloud Console:

```text
https://console.cloud.google.com/apis/credentials
```

Recommended console setup:

- Create or select a Google Cloud project named `InCircle` or `useincircle`.
- Configure OAuth consent screen:
  - App name: `圈內 InCircle`
  - User support email: the project owner/support email.
  - Audience: start with External unless this will be restricted to a Google Workspace organization.
  - App domain: `useincircle.app`
  - Authorized domain: `useincircle.app`
  - Developer contact email: the project owner/support email.
  - Scopes: keep the default/basic OpenID scopes only; the app requests `openid email profile`.
- Create credentials:
  - Type: `OAuth client ID`
  - Application type: `Web application`
  - Name: `InCircle Web`
  - Authorized JavaScript origins:

```text
https://useincircle.app
```

  - Authorized redirect URI:

```text
https://useincircle.app/api/auth/google/callback
```

After Google shows the client values, store them only in a local ignored env file:

```bash
cd /Users/kevin_huang/Documents/Projects/circles
touch .env.production.local
chmod 600 .env.production.local
open -e .env.production.local
```

Then enter:

```bash
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
```

Do not commit `.env.production.local`.

Install the private local LaunchAgent plist and restart the public API:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
npm run launchd:api:reload
```

Verify provider state and login start:

```bash
curl -s https://useincircle.app/api/auth/providers
curl -I https://useincircle.app/api/auth/google/start
```

Expected provider state after installation: Google `configured: true`; Apple and LINE may remain `configured: false` until their credentials are added.

Avoid sharing full `launchctl print gui/$(id -u)/com.useincircle.api` output after OAuth credentials are installed because launchd prints environment variables, including provider secrets.

## Grant Existing Circle Access

For the current local public Mac / private beta phase, early demo circles may still belong to a seed profile such as `kevin@example.com`. After a real OAuth login creates a real profile, grant that profile access to the existing circles with:

```bash
cd /Users/kevin_huang/Documents/Projects/circles/website
npm run membership:grant -- --email appsoft.1969@gmail.com --dry-run
npm run membership:grant -- --email appsoft.1969@gmail.com
```

By default this clones active circle roles from `kevin@example.com` and transfers `circles.owner_profile_id` for circles where the source profile is owner. This is an operator tool for local/private-beta data continuity, not the final public self-service invite flow.

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
