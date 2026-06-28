import { execFileSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const websiteRoot = path.join(projectRoot, "website");
const label = "com.useincircle.web-push";
const targetPlist =
  process.env.INCIRCLE_PUSH_PLIST_PATH ||
  path.join(homedir(), "Library/LaunchAgents", `${label}.plist`);
const intervalSeconds = Math.max(30, Math.trunc(Number(process.env.INCIRCLE_PUSH_INTERVAL_SECONDS || 60)));
const args = new Set(process.argv.slice(2));
const shouldReload = args.has("--reload");
const shouldPrint = args.has("--print");

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function plist() {
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
\t\t<string>scripts/send-web-push-notifications.mjs</string>
\t</array>

\t<key>WorkingDirectory</key>
\t<string>${xmlEscape(websiteRoot)}</string>

\t<key>StartInterval</key>
\t<integer>${intervalSeconds}</integer>

\t<key>RunAtLoad</key>
\t<true/>

\t<key>StandardOutPath</key>
\t<string>${xmlEscape(path.join(websiteRoot, "artifacts/incircle-web-push.out.log"))}</string>

\t<key>StandardErrorPath</key>
\t<string>${xmlEscape(path.join(websiteRoot, "artifacts/incircle-web-push.err.log"))}</string>
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

const content = plist();
if (shouldPrint) {
  process.stdout.write(content);
  process.exit(0);
}

mkdirSync(path.dirname(targetPlist), { recursive: true });
try {
  if (lstatSync(targetPlist).isSymbolicLink()) unlinkSync(targetPlist);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
writeFileSync(targetPlist, content, { mode: 0o600 });
chmodSync(targetPlist, 0o600);

console.log(`Wrote ${targetPlist}`);
console.log(`Interval: ${intervalSeconds}s`);

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
