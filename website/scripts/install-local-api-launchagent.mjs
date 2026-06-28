import { execFileSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const websiteRoot = path.join(projectRoot, "website");

const label = "com.useincircle.api";
const targetPlist =
  process.env.INCIRCLE_API_PLIST_PATH ||
  path.join(homedir(), "Library/LaunchAgents", `${label}.plist`);
const envFile =
  process.env.INCIRCLE_API_ENV_FILE ||
  path.join(projectRoot, ".env.production.local");

const args = new Set(process.argv.slice(2));
const shouldReload = args.has("--reload");
const shouldPrint = args.has("--print");
const sensitiveEnvKeys = new Set([
  "GOOGLE_CLIENT_SECRET",
  "LINE_CLIENT_SECRET",
  "LINE_CHANNEL_SECRET",
  "APPLE_PRIVATE_KEY",
  "WEB_PUSH_PRIVATE_KEY",
]);

const baseEnv = {
  NODE_ENV: "production",
  DATA_STORE: "postgres",
  DATABASE_URL: "postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local",
  HOST: "127.0.0.1",
  PORT: "8787",
  PUBLIC_BASE_URL: "https://useincircle.app",
  AUTH_BASE_URL: "https://useincircle.app",
  AUTH_SESSION_COOKIE: "incircle_session",
};

const allowedEnvKeys = new Set([
  ...Object.keys(baseEnv),
  "AUTH_COOKIE_SECURE",
  "AUTH_DEV_LOGIN_ENABLED",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "LINE_CLIENT_ID",
  "LINE_CLIENT_SECRET",
  "LINE_CHANNEL_ID",
  "LINE_CHANNEL_SECRET",
  "APPLE_CLIENT_ID",
  "APPLE_SERVICE_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "WEB_PUSH_PUBLIC_KEY",
  "WEB_PUSH_PRIVATE_KEY",
  "WEB_PUSH_SUBJECT",
]);

function parseEnvFile(filePath) {
  let content = "";
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }

  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    values[key] = value.replace(/\\n/g, "\n");
  }
  return values;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function plistForEnv(env) {
  const envEntries = Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `\t\t<key>${xmlEscape(key)}</key>\n\t\t<string>${xmlEscape(value)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${label}</string>

\t<key>ProgramArguments</key>
\t<array>
\t\t<string>/opt/homebrew/bin/node</string>
\t\t<string>--no-warnings</string>
\t\t<string>server/index.js</string>
\t</array>

\t<key>WorkingDirectory</key>
\t<string>${xmlEscape(websiteRoot)}</string>

\t<key>EnvironmentVariables</key>
\t<dict>
${envEntries}
\t</dict>

\t<key>KeepAlive</key>
\t<true/>

\t<key>RunAtLoad</key>
\t<true/>

\t<key>StandardOutPath</key>
\t<string>${xmlEscape(path.join(websiteRoot, "artifacts/incircle-api.out.log"))}</string>

\t<key>StandardErrorPath</key>
\t<string>${xmlEscape(path.join(websiteRoot, "artifacts/incircle-api.err.log"))}</string>
</dict>
</plist>
`;
}

function launchctl(argsForLaunchctl, options = {}) {
  return execFileSync("/bin/launchctl", argsForLaunchctl, {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
}

const localEnv = parseEnvFile(envFile);
const acceptedLocalEnv = Object.fromEntries(
  Object.entries(localEnv).filter(([key]) => allowedEnvKeys.has(key)),
);
const ignoredKeys = Object.keys(localEnv).filter((key) => !allowedEnvKeys.has(key));
const finalEnv = { ...baseEnv, ...acceptedLocalEnv };
const plist = plistForEnv(finalEnv);

if (shouldPrint) {
  const redactedEnv = Object.fromEntries(
    Object.entries(finalEnv).map(([key, value]) => [
      key,
      sensitiveEnvKeys.has(key) && value ? "__redacted__" : value,
    ]),
  );
  process.stdout.write(plistForEnv(redactedEnv));
  process.exit(0);
}

mkdirSync(path.dirname(targetPlist), { recursive: true });
try {
  if (lstatSync(targetPlist).isSymbolicLink()) {
    unlinkSync(targetPlist);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
writeFileSync(targetPlist, plist, { mode: 0o600 });
chmodSync(targetPlist, 0o600);

console.log(`Wrote ${targetPlist}`);
console.log(`Loaded local env from ${envFile}`);
if (ignoredKeys.length > 0) {
  console.log(`Ignored unsupported env keys: ${ignoredKeys.join(", ")}`);
}

if (shouldReload) {
  const domainTarget = `gui/${process.getuid()}/${label}`;
  const userDomain = `gui/${process.getuid()}`;
  try {
    launchctl(["bootout", userDomain, targetPlist]);
  } catch {
    // It is fine when the service is not loaded from this path yet.
  }
  try {
    launchctl(["bootout", domainTarget]);
  } catch {
    // It is fine when the service is not loaded yet.
  }
  launchctl(["bootstrap", userDomain, targetPlist], { stdio: "inherit" });
  launchctl(["kickstart", "-k", domainTarget], { stdio: "inherit" });
  console.log(`Reloaded ${label}`);
}
