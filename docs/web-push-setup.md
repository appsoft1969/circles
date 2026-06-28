# Web Push Setup

This document tracks the browser push-notification foundation for `圈內 InCircle`.

Current status:

- The PWA service worker exists at `website/public/sw.js`.
- `GET /api/push/config` returns whether a Web Push public key is configured.
- `POST /api/devices` accepts both legacy `pushToken` values and full Web Push subscriptions.
- The notification center can register the current browser/device when Web Push is configured and supported.
- Actual server-side push delivery is not implemented yet. Notifications still rely on in-app rows and foreground polling.

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

## Next Delivery Step

The next implementation step is server-side delivery:

- Select a delivery library or direct Web Push implementation.
- Use `WEB_PUSH_PRIVATE_KEY` and `WEB_PUSH_SUBJECT`.
- Read queued `notifications`.
- Fan out to active `devices` with `push_subscription`.
- Write `notification_deliveries` rows for delivery status and errors.
