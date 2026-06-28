# Web Push Setup

This document tracks the browser push-notification foundation for `圈內 InCircle`.

Current status:

- The PWA service worker exists at `website/public/sw.js`.
- `GET /api/push/config` returns whether a Web Push public key is configured.
- `POST /api/devices` accepts both legacy `pushToken` values and full Web Push subscriptions.
- The notification center can register the current browser/device when Web Push is configured and supported.
- `npm run push:send` can deliver queued unread notification rows to registered Web Push devices.
- Notifications still rely on in-app rows and foreground polling as the primary MVP behavior until push delivery is scheduled and monitored.

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

Install or reload the local Mac scheduled delivery job:

```bash
cd website
npm run launchd:push:reload
```

The delivery script:

- Reads queued unread `notifications`.
- Fans out to active `devices` with `push_subscription`.
- Inserts one `notification_deliveries` row per notification/device/channel.
- Marks deliveries `sent` or `failed`.
- Revokes expired browser subscriptions when the push provider returns `404` or `410`.

## Next Delivery Step

The next implementation step is scheduling and monitoring:

- Decide retry policy for transient failed deliveries.

`npm run ops:status` now checks that the local `com.useincircle.web-push` launchd job is loaded, exits cleanly, and has recent output.
