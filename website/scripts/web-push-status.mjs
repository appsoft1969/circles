import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const websiteRoot = path.join(projectRoot, "website");
const localEnvPath = process.env.INCIRCLE_API_ENV_FILE || path.join(projectRoot, ".env.production.local");
const defaultConnectionString = "postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local";
const statusPath = process.env.WEB_PUSH_STATUS_PATH || path.join(websiteRoot, "artifacts", "web-push-status.json");

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

async function countRows(pool, query, params = []) {
  const result = await pool.query(query, params);
  return Number(result.rows[0]?.count || 0);
}

async function main() {
  loadLocalEnv();
  const connectionString = process.env.DATABASE_URL || defaultConnectionString;
  const pool = new Pool({ connectionString });

  try {
    const [devices, activeDevices, revokedDevices, deliveryCounts, recentFailures] = await Promise.all([
      countRows(pool, "SELECT count(*) FROM devices WHERE push_subscription IS NOT NULL"),
      countRows(pool, "SELECT count(*) FROM devices WHERE push_subscription IS NOT NULL AND revoked_at IS NULL"),
      countRows(pool, "SELECT count(*) FROM devices WHERE push_subscription IS NOT NULL AND revoked_at IS NOT NULL"),
      pool.query(`
        SELECT status::text, count(*)::int
        FROM notification_deliveries
        WHERE channel = 'push'
        GROUP BY status
        ORDER BY status
      `),
      pool.query(`
        SELECT
          id::text,
          notification_id::text,
          device_id::text,
          attempt_count,
          error_text,
          last_attempt_at,
          created_at
        FROM notification_deliveries
        WHERE channel = 'push'
          AND status = 'failed'
        ORDER BY COALESCE(last_attempt_at, created_at) DESC
        LIMIT 10
      `),
    ]);

    const status = {
      ok: true,
      generatedAt: new Date().toISOString(),
      configured: Boolean(process.env.WEB_PUSH_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY),
      devices: {
        total: devices,
        active: activeDevices,
        revoked: revokedDevices,
      },
      deliveries: Object.fromEntries(deliveryCounts.rows.map((row) => [row.status, Number(row.count || 0)])),
      recentFailures: recentFailures.rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id,
        deviceId: row.device_id,
        attemptCount: Number(row.attempt_count || 0),
        errorText: row.error_text,
        lastAttemptAt: row.last_attempt_at,
        createdAt: row.created_at,
      })),
    };

    await mkdir(dirname(statusPath), { recursive: true });
    await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);
    console.log(`[web-push-status] active devices ${activeDevices}, failed deliveries ${status.deliveries.failed || 0}`);
    console.log(`[web-push-status] status: ${statusPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[web-push-status] ${error.message}`);
  process.exitCode = 1;
});
