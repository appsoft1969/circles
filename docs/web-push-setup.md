# Web Push Setup

This document tracks the browser push-notification foundation for `圈內 InCircle`.

Current status:

- The PWA service worker exists at `website/public/sw.js`.
- `GET /api/push/config` returns whether a Web Push public key is configured.
- `POST /api/devices` accepts both legacy `pushToken` values and full Web Push subscriptions.
- The notification center can register the current browser/device when Web Push is configured and supported.
- `npm run push:send` can deliver queued unread notification rows to registered Web Push devices.
- `GET /api/push/status` and `/ops/push` expose a station-admin delivery report for device counts, delivery counts, and recent failures.
- `POST /api/push/test` creates a user-triggered self test notification; the notification center shows a test button after the browser subscription is registered.
- `DELETE /api/devices` revokes the current user's browser subscription; the notification center shows a stop button after registration.
- In-app rows and foreground polling remain the primary MVP behavior; Web Push is an additional delivery channel after a user registers a supported browser.

## Generate VAPID Keys

Generate a local key pair:

```bash
cd website
npm run push:vapid
```

Add the generated values to the private local production env file:

```bash
WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PRIVATE_KEY=...
WEB_PUSH_SUBJECT=mailto:admin@useincircle.app
```

Do not commit private keys.

After changing the local production env, reload the public API:

```bash
cd website
npm run launchd:api:reload
```

Verify public config:

```bash
curl -s https://useincircle.app/api/push/config
```

## Send Pending Push Notifications

Preview pending deliveries without sending:

```bash
cd website
npm run push:send -- --dry-run
```

Send pending deliveries:

```bash
cd website
npm run push:send
```

Check delivery/device status:

```bash
cd website
npm run push:status
```

Check the same status inside the app with a station-admin session:

```text
https://useincircle.app/ops/push
```

Install or reload the local Mac scheduled delivery job:

```bash
cd website
npm run launchd:push:reload
```

The delivery script:

- Reads queued unread `notifications`.
- Fans out to active `devices` with `push_subscription`.
- Re-checks current profile/circle notification preferences, muted circles, important-only settings, and quiet hours before creating Web Push deliveries.
- Inserts one `notification_deliveries` row per notification/device/channel.
- Marks deliveries `sent` or `failed`.
- Retries failed deliveries up to `PUSH_MAX_ATTEMPTS` times, waiting `PUSH_RETRY_AFTER_MINUTES` between attempts.
- Revokes expired browser subscriptions when the push provider returns `404` or `410`.

## In-App Delivery Report

The station-admin report at `/ops/push` shows:

- whether Web Push keys are configured
- total, active, and revoked Web Push browser devices
- delivery counts by status
- the 10 most recent failed Web Push deliveries

`npm run ops:status` now checks that the local `com.useincircle.web-push` launchd job is loaded, exits cleanly, and has recent output.
