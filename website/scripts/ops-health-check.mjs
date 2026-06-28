import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteDir = dirname(__dirname);

const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://useincircle.app").replace(/\/+$/, "");
const redirectUrls = (
  process.env.REDIRECT_URLS ||
  "https://www.useincircle.app,https://useincircle.com,https://www.useincircle.com,https://useincircle.info,https://www.useincircle.info"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const expectedBackend = process.env.EXPECTED_BACKEND || "postgres";
const backupStatusPath =
  process.env.BACKUP_STATUS_PATH || join(websiteDir, "artifacts", "postgres-backup-status.json");
const opsStatusPath = process.env.OPS_STATUS_PATH || join(websiteDir, "artifacts", "incircle-ops-status.json");
const alertStatePath =
  process.env.OPS_ALERT_STATE_PATH || join(websiteDir, "artifacts", "incircle-ops-alert-state.json");
const alertsEnabled = process.env.OPS_ALERTS_ENABLED === "1";
const alertCooldownMinutes = Number(process.env.OPS_ALERT_COOLDOWN_MINUTES || 60);
const requestTimeoutMs = Number(process.env.OPS_REQUEST_TIMEOUT_MS || 8000);
const maxBackupAgeHours = Number(process.env.MAX_BACKUP_AGE_HOURS || 36);
const minCircles = Number(process.env.MIN_BOOTSTRAP_CIRCLES || 1);
const minTasks = Number(process.env.MIN_BOOTSTRAP_TASKS || 1);
const minTemplates = Number(process.env.MIN_BOOTSTRAP_TEMPLATES || 9);
const opsProfileEmail = process.env.OPS_PROFILE_EMAIL || "appsoft.1969@gmail.com";

function log(message) {
  console.log(`[ops-health] ${message}`);
}

function assertPositiveNumber(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

async function fetchJson(path, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${publicBaseUrl}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json", ...headers },
    });
    const text = await response.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`${path} returned non-JSON response: ${error.message}`);
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function opsProfileHeaders() {
  return opsProfileEmail ? { "x-incircle-profile-email": opsProfileEmail } : {};
}

async function fetchText(path = "/") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${publicBaseUrl}${path}`, {
      signal: controller.signal,
      headers: { accept: "text/html" },
    });
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      length: text.length,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function pushFailure(failures, message) {
  failures.push(message);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
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
      reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

async function readAlertState() {
  if (!existsSync(alertStatePath)) return null;

  try {
    return JSON.parse(await readFile(alertStatePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeAlertState(state) {
  await mkdir(dirname(alertStatePath), { recursive: true });
  await writeFile(alertStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function alertFingerprint(failures) {
  return failures.join("\n");
}

async function sendMacNotification({ title, message }) {
  const escapedTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedMessage = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  await run("osascript", [
    "-e",
    `display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Glass"`,
  ]);
}

async function maybeAlert(status) {
  const alert = {
    enabled: alertsEnabled,
    statePath: alertStatePath,
    cooldownMinutes: alertCooldownMinutes,
    sent: false,
    suppressed: false,
    reason: null,
  };

  if (status.ok) {
    await writeAlertState({
      lastStatusOk: true,
      lastOkAt: status.checkedAt,
      lastFailureFingerprint: null,
      lastAlertAt: null,
    });
    return alert;
  }

  if (!alertsEnabled) {
    alert.reason = "alerts disabled";
    return alert;
  }

  const fingerprint = alertFingerprint(status.failures);
  const previous = await readAlertState();
  const previousAlertAt = previous?.lastAlertAt ? new Date(previous.lastAlertAt) : null;
  const previousFingerprint = previous?.lastFailureFingerprint || null;
  const cooldownMs = Number.isFinite(alertCooldownMinutes) ? alertCooldownMinutes * 60 * 1000 : 60 * 60 * 1000;
  const withinCooldown =
    previousAlertAt && previousFingerprint === fingerprint && Date.now() - previousAlertAt.getTime() < cooldownMs;

  if (withinCooldown) {
    alert.suppressed = true;
    alert.reason = "cooldown";
    await writeAlertState({
      lastStatusOk: false,
      lastFailureAt: status.checkedAt,
      lastFailureFingerprint: fingerprint,
      lastAlertAt: previous.lastAlertAt,
      lastFailures: status.failures,
    });
    return alert;
  }

  const message = status.failures.slice(0, 2).join(" / ").slice(0, 180);
  await sendMacNotification({
    title: "InCircle health check failed",
    message,
  });

  alert.sent = true;
  await writeAlertState({
    lastStatusOk: false,
    lastFailureAt: status.checkedAt,
    lastFailureFingerprint: fingerprint,
    lastAlertAt: status.checkedAt,
    lastFailures: status.failures,
  });
  return alert;
}

async function checkSite(failures) {
  try {
    const result = await fetchText("/");
    if (!result.ok) pushFailure(failures, `site returned HTTP ${result.status}`);
    if (result.length <= 0) pushFailure(failures, "site response body is empty");
    return result;
  } catch (error) {
    pushFailure(failures, `site check failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function checkRedirects(failures) {
  const results = [];

  for (const url of redirectUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
      });
      const location = response.headers.get("location") || "";
      const resolvedLocation = location ? new URL(location, url).toString() : "";
      const redirectsPermanently = [301, 308].includes(response.status);
      const redirectsToPrimary =
        resolvedLocation === publicBaseUrl ||
        resolvedLocation === `${publicBaseUrl}/` ||
        resolvedLocation.startsWith(`${publicBaseUrl}/`);

      if (!redirectsPermanently) {
        pushFailure(failures, `${url} returned HTTP ${response.status}, expected permanent redirect`);
      }
      if (!redirectsToPrimary) {
        pushFailure(failures, `${url} redirected to ${location || "(missing location)"}, expected ${publicBaseUrl}`);
      }

      results.push({
        url,
        ok: redirectsPermanently && redirectsToPrimary,
        status: response.status,
        location,
      });
    } catch (error) {
      pushFailure(failures, `${url} redirect check failed: ${error.message}`);
      results.push({ url, ok: false, error: error.message });
    } finally {
      clearTimeout(timeout);
    }
  }

  return results;
}

async function checkApiHealth(failures) {
  try {
    const result = await fetchJson("/api/health");
    if (!result.ok) pushFailure(failures, `api health returned HTTP ${result.status}`);
    if (!result.json?.ok) pushFailure(failures, "api health did not report ok");
    if (result.json?.backend !== expectedBackend) {
      pushFailure(failures, `api backend is ${result.json?.backend}, expected ${expectedBackend}`);
    }
    return result;
  } catch (error) {
    pushFailure(failures, `api health check failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function checkBootstrap(failures) {
  try {
    const anonymous = await fetchJson("/api/bootstrap");
    const anonymousCircles = anonymous.json?.circles || [];
    const anonymousTasks = anonymous.json?.tasks || [];
    const anonymousTemplates = anonymous.json?.templates || [];
    const scoped = await fetchJson("/api/bootstrap", opsProfileHeaders());
    const circles = scoped.json?.circles || [];
    const tasks = scoped.json?.tasks || [];
    const templates = scoped.json?.templates || [];

    if (!anonymous.ok) pushFailure(failures, `anonymous bootstrap returned HTTP ${anonymous.status}`);
    if (!Array.isArray(anonymousTemplates) || anonymousTemplates.length < minTemplates) {
      pushFailure(failures, `anonymous bootstrap templates count is below ${minTemplates}`);
    }
    if (expectedBackend === "postgres") {
      if (Array.isArray(anonymousCircles) && anonymousCircles.length > 0) {
        pushFailure(failures, "anonymous bootstrap exposed circles");
      }
      if (Array.isArray(anonymousTasks) && anonymousTasks.length > 0) {
        pushFailure(failures, "anonymous bootstrap exposed tasks");
      }
    }

    if (!scoped.ok) pushFailure(failures, `scoped bootstrap returned HTTP ${scoped.status}`);
    if (!Array.isArray(circles) || circles.length < minCircles) {
      pushFailure(failures, `scoped bootstrap circles count is below ${minCircles}`);
    }
    if (!Array.isArray(tasks) || tasks.length < minTasks) {
      pushFailure(failures, `scoped bootstrap tasks count is below ${minTasks}`);
    }
    if (!Array.isArray(templates) || templates.length < minTemplates) {
      pushFailure(failures, `scoped bootstrap templates count is below ${minTemplates}`);
    }

    return {
      ok: anonymous.ok && scoped.ok,
      profileEmail: opsProfileEmail || null,
      anonymous: {
        status: anonymous.status,
        counts: {
          circles: Array.isArray(anonymousCircles) ? anonymousCircles.length : 0,
          tasks: Array.isArray(anonymousTasks) ? anonymousTasks.length : 0,
          templates: Array.isArray(anonymousTemplates) ? anonymousTemplates.length : 0,
        },
      },
      scoped: {
        status: scoped.status,
        counts: {
          circles: Array.isArray(circles) ? circles.length : 0,
          tasks: Array.isArray(tasks) ? tasks.length : 0,
          templates: Array.isArray(templates) ? templates.length : 0,
        },
      },
      counts: {
        circles: Array.isArray(circles) ? circles.length : 0,
        tasks: Array.isArray(tasks) ? tasks.length : 0,
        templates: Array.isArray(templates) ? templates.length : 0,
      },
      firstShareToken: Array.isArray(tasks) ? tasks.find((task) => task.shareToken)?.shareToken || null : null,
    };
  } catch (error) {
    pushFailure(failures, `bootstrap check failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function checkShareLink(shareToken, failures) {
  if (!shareToken) {
    pushFailure(failures, "no share token found for share-link check");
    return { ok: false, skipped: true };
  }

  try {
    const result = await fetchJson(`/api/share/${encodeURIComponent(shareToken)}`);
    if (!result.ok) pushFailure(failures, `share link returned HTTP ${result.status}`);
    if (!result.json?.task?.title) pushFailure(failures, "share link response is missing task title");

    return {
      ok: result.ok,
      status: result.status,
      shareToken,
      taskTitle: result.json?.task?.title || null,
      template: result.json?.task?.template || null,
    };
  } catch (error) {
    pushFailure(failures, `share-link check failed: ${error.message}`);
    return { ok: false, shareToken, error: error.message };
  }
}

async function checkBackupStatus(failures) {
  if (!existsSync(backupStatusPath)) {
    pushFailure(failures, "backup status file is missing");
    return { ok: false, path: backupStatusPath, error: "missing" };
  }

  try {
    const status = JSON.parse(await readFile(backupStatusPath, "utf8"));
    const generatedAt = new Date(status.backup?.generatedAt);
    const ageHours = (Date.now() - generatedAt.getTime()) / (60 * 60 * 1000);

    if (!status.ok) pushFailure(failures, "backup status is not ok");
    if (!Number.isFinite(generatedAt.getTime())) pushFailure(failures, "backup generatedAt is invalid");
    if (ageHours > maxBackupAgeHours) {
      pushFailure(failures, `backup is too old: ${ageHours.toFixed(2)} hours`);
    }
    if (status.failures?.length) {
      pushFailure(failures, `backup status has failures: ${status.failures.join("; ")}`);
    }

    return {
      ok: Boolean(status.ok),
      path: backupStatusPath,
      generatedAt: status.backup?.generatedAt || null,
      ageHours: Number(ageHours.toFixed(3)),
      offsiteEnabled: Boolean(status.offsite?.enabled),
      failures: status.failures || [],
    };
  } catch (error) {
    pushFailure(failures, `backup status check failed: ${error.message}`);
    return { ok: false, path: backupStatusPath, error: error.message };
  }
}

async function writeStatus(status) {
  await mkdir(dirname(opsStatusPath), { recursive: true });
  await writeFile(opsStatusPath, `${JSON.stringify(status, null, 2)}\n`);
}

async function main() {
  assertPositiveNumber("OPS_REQUEST_TIMEOUT_MS", requestTimeoutMs);
  assertPositiveNumber("MAX_BACKUP_AGE_HOURS", maxBackupAgeHours);

  const failures = [];
  const site = await checkSite(failures);
  const redirects = await checkRedirects(failures);
  const apiHealth = await checkApiHealth(failures);
  const bootstrap = await checkBootstrap(failures);
  const shareLink = await checkShareLink(bootstrap.firstShareToken, failures);
  const backupStatus = await checkBackupStatus(failures);

  const status = {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    publicBaseUrl,
    expectedBackend,
    thresholds: {
      requestTimeoutMs,
      maxBackupAgeHours,
      alertCooldownMinutes,
      minCircles,
      minTasks,
      minTemplates,
    },
    checks: {
      site,
      redirects,
      apiHealth,
      bootstrap,
      shareLink,
      backupStatus,
    },
    alert: {
      enabled: alertsEnabled,
      statePath: alertStatePath,
      cooldownMinutes: alertCooldownMinutes,
      sent: false,
      suppressed: false,
      reason: "not evaluated",
    },
    failures,
  };

  try {
    status.alert = await maybeAlert(status);
  } catch (error) {
    status.alert = {
      enabled: alertsEnabled,
      statePath: alertStatePath,
      cooldownMinutes: alertCooldownMinutes,
      sent: false,
      suppressed: false,
      reason: `alert failed: ${error.message}`,
    };
  }

  await writeStatus(status);

  if (!status.ok) {
    log(`failed: ${failures.join("; ")}`);
    process.exitCode = 1;
    return;
  }

  log(`ok: ${publicBaseUrl}`);
  log(`status: ${opsStatusPath}`);
}

main().catch(async (error) => {
  const status = {
    ok: false,
    checkedAt: new Date().toISOString(),
    publicBaseUrl,
    alert: {
      enabled: alertsEnabled,
      statePath: alertStatePath,
      cooldownMinutes: alertCooldownMinutes,
      sent: false,
      suppressed: false,
      reason: "not evaluated",
    },
    failures: [error.message],
  };
  try {
    status.alert = await maybeAlert(status);
  } catch (alertError) {
    status.alert.reason = `alert failed: ${alertError.message}`;
  }
  await writeStatus(status).catch(() => {});
  console.error(error);
  process.exit(1);
});
