import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteDir = dirname(__dirname);
const defaultDatabaseUrl = "postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local";
const defaultMaintenanceUrl = `postgres://${encodeURIComponent(process.env.USER || "kevin_huang")}@127.0.0.1:5434/postgres`;

const databaseUrl = process.env.DATABASE_URL || defaultDatabaseUrl;
const maintenanceDatabaseUrl = process.env.MAINTENANCE_DATABASE_URL || defaultMaintenanceUrl;
const backupDir = process.env.BACKUP_DIR || join(websiteDir, "data", "backups", "postgres");
const offsiteBackupDir = process.env.OFFSITE_BACKUP_DIR || "";
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const timestamp = formatTimestamp(new Date());
const dumpPath = join(backupDir, `incircle_local-${timestamp}.dump`);
const manifestPath = join(backupDir, `incircle_local-${timestamp}.json`);
const restoreReportPath = join(backupDir, `incircle_local-${timestamp}.restore-check.json`);
const restoreDbName = `incircle_restore_${timestamp}`;

const tablesToVerify = [
  "profiles",
  "notification_preferences",
  "circles",
  "circle_memberships",
  "task_templates",
  "tasks",
  "task_options",
  "responses",
  "response_items",
  "announcements",
  "task_comments",
];

function log(message) {
  console.log(`[postgres-backup] ${message}`);
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function parseConnectionString(connectionString) {
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!database) {
    throw new Error(`Connection string is missing database name: ${redactConnectionString(connectionString)}`);
  }

  return {
    host: url.hostname || "127.0.0.1",
    port: url.port || "5432",
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database,
  };
}

function connectionStringWithDatabase(connectionString, databaseName) {
  const url = new URL(connectionString);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.toString();
}

function redactConnectionString(connectionString) {
  const url = new URL(connectionString);
  if (url.password) url.password = "****";
  return url.toString();
}

function passwordEnv(parts) {
  return parts.password ? { PGPASSWORD: parts.password } : {};
}

function run(command, args, { env = {}, label = command } = {}) {
  return new Promise((resolve, reject) => {
    log(`running ${label}`);
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const output = stderr || stdout || `${command} exited with code ${code}`;
      reject(new Error(`${label} failed: ${output.trim()}`));
    });
  });
}

async function getCounts(connectionString) {
  const pool = new Pool({ connectionString, max: 1 });

  try {
    const counts = {};
    for (const table of tablesToVerify) {
      const result = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
      counts[table] = result.rows[0].count;
    }
    return counts;
  } finally {
    await pool.end();
  }
}

function compareCounts(sourceCounts, restoredCounts) {
  const mismatches = [];

  for (const table of tablesToVerify) {
    if (sourceCounts[table] !== restoredCounts[table]) {
      mismatches.push({
        table,
        source: sourceCounts[table],
        restored: restoredCounts[table],
      });
    }
  }

  return mismatches;
}

async function sha256File(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

async function cleanupOldBackups(targetDir, label) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    log(`${label} retention cleanup skipped`);
    return [];
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const removed = [];
  const entries = await readdir(targetDir).catch(() => []);

  for (const entry of entries) {
    if (!entry.startsWith("incircle_local-")) continue;
    if (!entry.endsWith(".dump") && !entry.endsWith(".json")) continue;

    const path = join(targetDir, entry);
    const info = await stat(path);
    if (info.mtimeMs >= cutoff) continue;

    await rm(path, { force: true });
    removed.push(entry);
  }

  log(`${label} retention cleanup removed ${removed.length} files`);
  return removed;
}

async function copyBackupArtifacts(targetDir, paths) {
  if (!targetDir) {
    log("offsite copy skipped");
    return { enabled: false, directory: null, files: [] };
  }

  await mkdir(targetDir, { recursive: true });
  const files = [];

  for (const path of paths) {
    const fileName = basename(path);
    const destination = join(targetDir, fileName);
    await copyFile(path, destination);
    files.push(destination);
  }

  log(`offsite copy complete: ${targetDir}`);
  return { enabled: true, directory: targetDir, files };
}

async function main() {
  await mkdir(backupDir, { recursive: true });

  const sourceParts = parseConnectionString(databaseUrl);
  const maintenanceParts = parseConnectionString(maintenanceDatabaseUrl);
  const restoreConnectionString = connectionStringWithDatabase(maintenanceDatabaseUrl, restoreDbName);
  const restoreParts = parseConnectionString(restoreConnectionString);
  let restoreDbCreated = false;

  log(`backup directory: ${backupDir}`);
  if (offsiteBackupDir) log(`offsite backup directory: ${offsiteBackupDir}`);
  log(`source: ${redactConnectionString(databaseUrl)}`);
  log(`maintenance: ${redactConnectionString(maintenanceDatabaseUrl)}`);

  const sourceCounts = await getCounts(databaseUrl);

  await run(
    "pg_dump",
    [
      "--host",
      sourceParts.host,
      "--port",
      sourceParts.port,
      "--username",
      sourceParts.user,
      "--dbname",
      sourceParts.database,
      "--format",
      "custom",
      "--no-owner",
      "--no-acl",
      "--file",
      dumpPath,
    ],
    { env: passwordEnv(sourceParts), label: "pg_dump source database" },
  );

  try {
    await run(
      "createdb",
      [
        "--host",
        maintenanceParts.host,
        "--port",
        maintenanceParts.port,
        "--username",
        maintenanceParts.user,
        "--maintenance-db",
        maintenanceParts.database,
        restoreDbName,
      ],
      { env: passwordEnv(maintenanceParts), label: `createdb ${restoreDbName}` },
    );
    restoreDbCreated = true;

    await run(
      "pg_restore",
      [
        "--host",
        restoreParts.host,
        "--port",
        restoreParts.port,
        "--username",
        restoreParts.user,
        "--dbname",
        restoreParts.database,
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        dumpPath,
      ],
      { env: passwordEnv(restoreParts), label: `pg_restore ${restoreDbName}` },
    );

    const restoredCounts = await getCounts(restoreConnectionString);
    const mismatches = compareCounts(sourceCounts, restoredCounts);
    const dumpInfo = await stat(dumpPath);
    const checksum = await sha256File(dumpPath);
    const generatedAt = new Date().toISOString();
    const report = {
      ok: mismatches.length === 0,
      generatedAt,
      source: {
        database: sourceParts.database,
        connection: redactConnectionString(databaseUrl),
        counts: sourceCounts,
      },
      backup: {
        path: dumpPath,
        sizeBytes: dumpInfo.size,
        sha256: checksum,
        format: "pg_dump custom",
        retentionDays,
        offsite: offsiteBackupDir
          ? {
              directory: offsiteBackupDir,
              files: [dumpPath, manifestPath, restoreReportPath].map((path) => basename(path)),
            }
          : null,
      },
      restoreCheck: {
        database: restoreDbName,
        connection: redactConnectionString(restoreConnectionString),
        counts: restoredCounts,
        mismatches,
      },
    };

    await writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(restoreReportPath, `${JSON.stringify(report.restoreCheck, null, 2)}\n`);

    if (mismatches.length > 0) {
      throw new Error(`restore count mismatch: ${JSON.stringify(mismatches)}`);
    }

    const offsiteCopy = await copyBackupArtifacts(offsiteBackupDir, [dumpPath, manifestPath, restoreReportPath]);
    const removed = await cleanupOldBackups(backupDir, "local");
    const offsiteRemoved = offsiteCopy.enabled ? await cleanupOldBackups(offsiteBackupDir, "offsite") : [];
    await run(
      process.execPath,
      ["--no-warnings", join(__dirname, "postgres-backup-status.mjs")],
      {
        env: {
          BACKUP_DIR: backupDir,
          OFFSITE_BACKUP_DIR: offsiteBackupDir,
        },
        label: "backup status check",
      },
    );
    log(`backup complete: ${dumpPath}`);
    log(`manifest: ${manifestPath}`);
    if (offsiteCopy.enabled) log(`offsite files copied: ${offsiteCopy.files.length}`);
    log(`status check complete`);
    log(`restore check: ok; removed old files: ${removed.length}; removed offsite files: ${offsiteRemoved.length}`);
  } finally {
    if (restoreDbCreated) {
      await run(
        "dropdb",
        [
          "--if-exists",
          "--force",
          "--host",
          maintenanceParts.host,
          "--port",
          maintenanceParts.port,
          "--username",
          maintenanceParts.user,
          "--maintenance-db",
          maintenanceParts.database,
          restoreDbName,
        ],
        { env: passwordEnv(maintenanceParts), label: `dropdb ${restoreDbName}` },
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
