import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteDir = dirname(__dirname);

const backupDir = process.env.BACKUP_DIR || join(websiteDir, "data", "backups", "postgres");
const offsiteBackupDir = process.env.OFFSITE_BACKUP_DIR || "";
const maxBackupAgeHours = Number(process.env.MAX_BACKUP_AGE_HOURS || 36);
const statusPath = process.env.BACKUP_STATUS_PATH || join(websiteDir, "artifacts", "postgres-backup-status.json");

function log(message) {
  console.log(`[postgres-backup-status] ${message}`);
}

function isManifestFile(name) {
  return name.startsWith("incircle_local-") && name.endsWith(".json") && !name.endsWith(".restore-check.json");
}

async function sha256File(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

async function findLatestManifest() {
  const entries = await readdir(backupDir);
  const candidates = [];

  for (const entry of entries) {
    if (!isManifestFile(entry)) continue;
    const path = join(backupDir, entry);
    const info = await stat(path);
    candidates.push({ entry, path, mtimeMs: info.mtimeMs });
  }

  candidates.sort((a, b) => b.entry.localeCompare(a.entry));
  return candidates[0] || null;
}

function statusFailure(message, details = {}) {
  return {
    ok: false,
    checkedAt: new Date().toISOString(),
    message,
    ...details,
  };
}

async function writeStatus(status) {
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);
}

async function main() {
  if (!Number.isFinite(maxBackupAgeHours) || maxBackupAgeHours <= 0) {
    throw new Error(`MAX_BACKUP_AGE_HOURS must be a positive number, got ${process.env.MAX_BACKUP_AGE_HOURS}`);
  }

  const latest = await findLatestManifest().catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });

  if (!latest) {
    const status = statusFailure("No backup manifest found", { backupDir });
    await writeStatus(status);
    throw new Error(status.message);
  }

  const manifest = JSON.parse(await readFile(latest.path, "utf8"));
  const generatedAt = new Date(manifest.generatedAt);
  const ageHours = (Date.now() - generatedAt.getTime()) / (60 * 60 * 1000);
  const dumpPath = manifest.backup?.path;
  const restoreReportPath = dumpPath?.replace(/\.dump$/, ".restore-check.json");
  const failures = [];

  if (!manifest.ok) failures.push("latest manifest is not ok");
  if (!Number.isFinite(generatedAt.getTime())) failures.push("manifest generatedAt is invalid");
  if (ageHours > maxBackupAgeHours) failures.push(`latest backup is too old: ${ageHours.toFixed(2)} hours`);
  if (!dumpPath || !existsSync(dumpPath)) failures.push("local dump file is missing");
  if (!restoreReportPath || !existsSync(restoreReportPath)) failures.push("local restore-check file is missing");
  if (manifest.restoreCheck?.mismatches?.length) failures.push("restore-check has count mismatches");

  let localDumpSha256 = null;
  if (dumpPath && existsSync(dumpPath)) {
    localDumpSha256 = await sha256File(dumpPath);
    if (manifest.backup?.sha256 && localDumpSha256 !== manifest.backup.sha256) {
      failures.push("local dump sha256 does not match manifest");
    }
  }

  const offsite = {
    enabled: Boolean(offsiteBackupDir),
    directory: offsiteBackupDir || null,
    files: [],
  };

  if (offsiteBackupDir) {
    const expectedFiles = [basename(dumpPath || ""), basename(latest.path), basename(restoreReportPath || "")].filter(Boolean);

    for (const fileName of expectedFiles) {
      const path = join(offsiteBackupDir, fileName);
      const exists = existsSync(path);
      const file = { path, exists };

      if (!exists) {
        failures.push(`offsite file missing: ${fileName}`);
      } else if (fileName.endsWith(".dump")) {
        file.sha256 = await sha256File(path);
        if (localDumpSha256 && file.sha256 !== localDumpSha256) {
          failures.push(`offsite dump sha256 does not match local dump: ${fileName}`);
        }
      }

      offsite.files.push(file);
    }
  }

  const status = {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    maxBackupAgeHours,
    backup: {
      manifestPath: latest.path,
      generatedAt: manifest.generatedAt,
      ageHours: Number(ageHours.toFixed(3)),
      dumpPath,
      dumpSha256: localDumpSha256,
      sizeBytes: manifest.backup?.sizeBytes || null,
      restoreMismatches: manifest.restoreCheck?.mismatches || [],
      counts: manifest.source?.counts || {},
    },
    offsite,
    failures,
  };

  await writeStatus(status);

  if (!status.ok) {
    log(`failed: ${failures.join("; ")}`);
    process.exitCode = 1;
    return;
  }

  log(`ok: latest backup ${manifest.generatedAt}, age ${status.backup.ageHours}h`);
  log(`status: ${statusPath}`);
}

main().catch(async (error) => {
  const status = statusFailure(error.message, { backupDir, offsiteBackupDir });
  await writeStatus(status).catch(() => {});
  console.error(error);
  process.exit(1);
});
