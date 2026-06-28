import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import webpush from "web-push";

const { Pool } = pg;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const localEnvPath = process.env.INCIRCLE_API_ENV_FILE || path.join(projectRoot, ".env.production.local");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Math.min(500, Number(limitArg?.split("=")[1] || process.env.PUSH_DELIVERY_LIMIT || 100)));
const defaultConnectionString = "postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local";

function log(message) {
  console.log(`[web-push] ${message}`);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1);
    values[key] = value.replace(/\\n/g, "\n");
  }
  return values;
}

function loadLocalEnv() {
  const localEnv = parseEnvFile(localEnvPath);
  for (const [key, value] of Object.entries(localEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function notificationUrl(row) {
  const data = row.data && typeof row.data === "object" ? row.data : {};
  if (typeof data.url === "string" && data.url.startsWith("/")) return data.url;
  if (row.task_id) return `/tasks/${row.task_id}`;
  if (row.circle_id) return `/circles/${row.circle_id}/chat`;
  return "/notifications";
}

function notificationPayload(row) {
  return JSON.stringify({
    notificationId: row.notification_id,
    title: row.title || "圈內提醒",
    body: row.body || "有新的圈內消息需要你看一下。",
    url: notificationUrl(row),
    tag: `incircle-${row.notification_id}`,
  });
}

async function ensureDeliverySchema(pool) {
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_deliveries_push_device
      ON notification_deliveries (notification_id, device_id, channel)
      WHERE device_id IS NOT NULL;
  `);
}

async function pendingDeliveries(pool) {
  const result = await pool.query(
    `
      SELECT
        n.id::text AS notification_id,
        n.circle_id::text,
        n.task_id::text,
        n.type,
        n.title,
        n.body,
        n.data,
        d.id::text AS device_id,
        d.push_subscription
      FROM notifications n
      JOIN devices d
        ON d.profile_id = n.recipient_profile_id
       AND d.revoked_at IS NULL
       AND d.push_subscription IS NOT NULL
      WHERE n.cancelled_at IS NULL
        AND n.read_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM notification_deliveries nd
          WHERE nd.notification_id = n.id
            AND nd.device_id = d.id
            AND nd.channel = 'push'
        )
      ORDER BY n.created_at ASC
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

async function createDelivery(pool, row) {
  const result = await pool.query(
    `
      INSERT INTO notification_deliveries (
        notification_id,
        device_id,
        channel,
        provider,
        status
      )
      VALUES ($1, $2, 'push', 'web-push', 'queued')
      ON CONFLICT DO NOTHING
      RETURNING id::text
    `,
    [row.notification_id, row.device_id],
  );
  return result.rows[0]?.id ?? null;
}

async function markDelivery(pool, deliveryId, status, fields = {}) {
  await pool.query(
    `
      UPDATE notification_deliveries
      SET
        status = $2::notification_status,
        provider_message_id = COALESCE($3, provider_message_id),
        error_text = $4,
        sent_at = CASE WHEN $2::notification_status = 'sent' THEN now() ELSE sent_at END
      WHERE id::text = $1
    `,
    [deliveryId, status, fields.providerMessageId || null, fields.errorText || null],
  );
}

async function revokeDevice(pool, deviceId) {
  await pool.query("UPDATE devices SET revoked_at = now() WHERE id::text = $1", [deviceId]);
}

async function main() {
  loadLocalEnv();
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT || "mailto:admin@useincircle.app";
  const connectionString = process.env.DATABASE_URL || defaultConnectionString;
  if (!publicKey || !privateKey) {
    throw new Error("WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY are required");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const pool = new Pool({ connectionString });

  try {
    await ensureDeliverySchema(pool);
    const candidates = await pendingDeliveries(pool);
    if (dryRun) {
      log(`dry-run: ${candidates.length} pending push deliveries`);
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const row of candidates) {
      const deliveryId = await createDelivery(pool, row);
      if (!deliveryId) continue;
      try {
        const response = await webpush.sendNotification(row.push_subscription, notificationPayload(row));
        await markDelivery(pool, deliveryId, "sent", {
          providerMessageId: response.headers?.location || String(response.statusCode || ""),
        });
        sent += 1;
      } catch (error) {
        const errorText = [error.statusCode, error.message].filter(Boolean).join(" ");
        await markDelivery(pool, deliveryId, "failed", { errorText: errorText.slice(0, 500) });
        if (error.statusCode === 404 || error.statusCode === 410) {
          await revokeDevice(pool, row.device_id);
        }
        failed += 1;
      }
    }
    log(`sent ${sent}, failed ${failed}, scanned ${candidates.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[web-push] ${error.message}`);
  process.exitCode = 1;
});
