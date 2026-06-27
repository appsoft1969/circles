import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteDir = dirname(__dirname);
const serverEntry = join(websiteDir, "server", "index.js");
const postgresUrl =
  process.env.API_SMOKE_DATABASE_URL || "postgres://circles:circles_dev_password@127.0.0.1:5433/circles_dev";

function log(message) {
  console.log(`[api-smoke] ${message}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function startApi(env) {
  const child = spawn(process.execPath, ["--no-warnings", serverEntry], {
    cwd: websiteDir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  return {
    child,
    getOutput: () => output,
  };
}

async function stopApi(api) {
  if (api.child.exitCode != null) return;
  api.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => api.child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (api.child.exitCode == null) api.child.kill("SIGKILL");
}

async function waitForHealth(baseUrl, api) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (api.child.exitCode != null) {
      throw new Error(`API exited before health check passed:\n${api.getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      // Keep polling until the server is ready or times out.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for API health:\n${api.getOutput()}`);
}

async function request(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  assert.ok(response.ok, `${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body };
}

async function runApiFlow({ label, env, cleanupCreatedTask }) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = startApi({ HOST: "127.0.0.1", PORT: String(port), ...env });
  let createdTaskId = null;
  const createdTaskIds = [];

  try {
    const health = await waitForHealth(baseUrl, api);
    assert.equal(health.ok, true);
    log(`${label}: ${health.backend} API ready on ${port}`);

    const bootstrap = await request(baseUrl, "/api/bootstrap");
    assert.ok(bootstrap.body.circles.length >= 1, `${label}: expected at least one circle`);
    assert.ok(bootstrap.body.templates.length >= 9, `${label}: expected task templates`);
    assert.ok(
      bootstrap.body.templates.some((template) => template.id === "interest_check"),
      `${label}: expected interest_check template`,
    );
    assert.ok(
      bootstrap.body.templates.some((template) => template.id === "claim"),
      `${label}: expected claim template`,
    );

    const officeCircle =
      bootstrap.body.circles.find((circle) => circle.name.includes("辦公室")) ?? bootstrap.body.circles[0];

    const created = await request(baseUrl, "/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        circleId: officeCircle.id,
        template: "drink_order",
        title: `${label} API smoke 飲料`,
        description: "自動測試建立、填單、狀態更新與 CSV。",
        paymentInstructions: "飲料到後轉帳。",
        pickupInstructions: "前台自取。",
        metadata: { smoke: true, backend: label },
        options: [
          { title: "紅茶拿鐵", subtitle: "大杯", unitPrice: 65, metadata: { sweetness: ["微糖"] } },
          { title: "四季春青茶", subtitle: "大杯", unitPrice: 45 },
        ],
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.task.template, "drink_order");
    assert.equal(created.body.task.options.length, 2);
    createdTaskId = created.body.task.id;
    createdTaskIds.push(createdTaskId);

    const edited = await request(baseUrl, `/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${label} API smoke 飲料已編輯`,
        description: "自動測試建立後編輯、填單、狀態更新與 CSV。",
        paymentInstructions: "編輯後：飲料到後轉帳。",
        pickupInstructions: "編輯後：前台自取。",
        options: [
          { id: created.body.task.options[0].id, title: "紅茶拿鐵已編輯", subtitle: "大杯，可改甜度", unitPrice: 70 },
          { title: "冬瓜茶", subtitle: "大杯", unitPrice: 35 },
        ],
      }),
    });
    assert.equal(edited.body.task.title, `${label} API smoke 飲料已編輯`);
    assert.equal(edited.body.task.options.length, 2);
    assert.equal(edited.body.task.options[0].title, "紅茶拿鐵已編輯");
    assert.equal(edited.body.task.options[0].unitPrice, 70);
    assert.ok(!edited.body.task.options.some((option) => option.title === "四季春青茶"), `${label}: removed option should be inactive`);
    const winterMelon = edited.body.task.options.find((option) => option.title === "冬瓜茶");
    assert.ok(winterMelon, `${label}: expected added option`);

    const shared = await request(baseUrl, `/api/share/${created.body.task.shareToken}`);
    assert.equal(shared.body.task.id, createdTaskId);
    assert.equal(shared.body.task.title, `${label} API smoke 飲料已編輯`);
    assert.ok(Array.isArray(shared.body.task.announcements), `${label}: announcements should be an array`);
    assert.ok(Array.isArray(shared.body.task.comments), `${label}: comments should be an array`);

    const announced = await request(baseUrl, `/api/tasks/${createdTaskId}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "取餐提醒",
        body: `${label} 測試公告：飲料到前台後請自取。`,
        priority: "important",
      }),
    });
    assert.equal(announced.status, 201);
    assert.equal(announced.body.task.announcements.length, 1);
    assert.equal(announced.body.task.announcements[0].priority, "important");

    const submitted = await request(baseUrl, `/api/share/${created.body.task.shareToken}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantName: `${label} 測試成員`,
        note: "微糖少冰",
        items: [
          { optionId: edited.body.task.options[0].id, quantity: 2 },
          { optionId: winterMelon.id, quantity: 1 },
        ],
      }),
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.task.stats.totalAmount, 175);
    assert.equal(submitted.body.task.stats.responses, 1);

    const commented = await request(baseUrl, `/api/tasks/${createdTaskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantName: `${label} 測試成員`,
        body: "我會晚一點來拿，請先放前台。",
      }),
    });
    assert.equal(commented.status, 201);
    assert.equal(commented.body.task.comments.length, 1);
    assert.equal(commented.body.task.comments[0].participantName, `${label} 測試成員`);

    const response = submitted.body.task.responses.find((item) => item.participantName === `${label} 測試成員`);
    assert.ok(response, `${label}: expected created response`);
    assert.equal(response.paymentStatus, "unpaid");

    const patched = await request(baseUrl, `/api/responses/${response.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: "paid", fulfillmentStatus: "picked_up" }),
    });
    const patchedResponse = patched.body.task.responses.find((item) => item.id === response.id);
    assert.equal(patchedResponse.paymentStatus, "paid");
    assert.equal(patchedResponse.fulfillmentStatus, "picked_up");
    assert.equal(patched.body.task.stats.paid, 1);

    const closed = await request(baseUrl, `/api/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    assert.equal(closed.body.task.status, "closed");

    const reopened = await request(baseUrl, `/api/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "open" }),
    });
    assert.equal(reopened.body.task.status, "open");

    const csvResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskId}/export.csv`);
    const csv = await csvResponse.text();
    assert.equal(csvResponse.status, 200);
    assert.ok(csv.includes(`${label} 測試成員`), `${label}: CSV should include participant`);
    assert.ok(csv.includes("紅茶拿鐵已編輯"), `${label}: CSV should include edited selected option`);

    const interest = await request(baseUrl, "/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        circleId: officeCircle.id,
        template: "interest_check",
        title: `${label} 週末票券意願調查`,
        description: "先問圈內有多少人想要免費票券。",
        paymentInstructions: "意願調查階段不收款。",
        pickupInstructions: "確定後再公告領取方式。",
        metadata: { smoke: true, stage: "interest" },
        options: [
          { title: "我有興趣", subtitle: "可備註需要幾張", unitPrice: 0, metadata: { intent: "interested" } },
          { title: "想先保留名額", subtitle: "需要主揪確認", unitPrice: 0, metadata: { intent: "reserve" } },
          { title: "這次先不參加", subtitle: "下次再約", unitPrice: 0, metadata: { intent: "not_this_time" } },
        ],
      }),
    });
    const interestTaskId = interest.body.task.id;
    createdTaskIds.push(interestTaskId);

    const interestResponse = await request(baseUrl, `/api/share/${interest.body.task.shareToken}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantName: `${label} 票券成員`,
        note: "需要兩張，週末可領",
        items: [{ optionId: interest.body.task.options[0].id, quantity: 2 }],
      }),
    });
    assert.equal(interestResponse.status, 201);
    assert.equal(interestResponse.body.task.stats.responses, 1);

    const converted = await request(baseUrl, `/api/tasks/${interestTaskId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetTemplate: "claim",
        title: `${label} 自訂票券領取登記`,
        description: "主揪確認後，請正式登記要領取的票券數量。",
        paymentInstructions: "此票券免費領取。",
        pickupInstructions: "週五前到櫃台取票。",
        options: [
          { title: "我要領取票券", subtitle: "每人最多 2 張", unitPrice: 0 },
          { title: "候補名單", subtitle: "有剩餘票券再通知", unitPrice: 0 },
        ],
        metadata: { smokeEdited: true },
      }),
    });
    assert.equal(converted.status, 201);
    assert.equal(converted.body.task.template, "claim");
    assert.equal(converted.body.task.title, `${label} 自訂票券領取登記`);
    assert.equal(converted.body.task.description, "主揪確認後，請正式登記要領取的票券數量。");
    assert.equal(converted.body.task.paymentInstructions, "此票券免費領取。");
    assert.equal(converted.body.task.pickupInstructions, "週五前到櫃台取票。");
    assert.equal(converted.body.task.options.length, 2);
    assert.equal(converted.body.task.options[0].title, "我要領取票券");
    assert.equal(converted.body.task.metadata.smokeEdited, true);
    assert.equal(converted.body.task.metadata.convertedFrom.sourceTaskId, interestTaskId);
    assert.ok(converted.body.task.comments[0]?.body.includes("由意願調查"), `${label}: converted task should keep source summary`);
    assert.equal(converted.body.sourceTask.metadata.convertedTo[0].taskId, converted.body.task.id);
    createdTaskIds.push(converted.body.task.id);

    log(`${label}: flow passed`);
    return { createdTaskId };
  } finally {
    await stopApi(api);
    if (cleanupCreatedTask) {
      for (const taskId of createdTaskIds.toReversed()) {
        await cleanupCreatedTask(taskId);
      }
    }
  }
}

async function assertPostgresReady() {
  const pool = new Pool({ connectionString: postgresUrl });
  try {
    const result = await pool.query("SELECT current_database() AS database");
    assert.ok(result.rows[0]?.database, "Postgres connection did not return a database");
  } catch (error) {
    throw new Error(
      `Postgres smoke requires local Postgres at ${postgresUrl}. Start it with docker compose --profile postgres up -d postgres adminer, then apply the migration and seed.\n${error.message}`,
    );
  } finally {
    await pool.end();
  }
}

async function cleanupPostgresTask(taskId) {
  if (!taskId) return;
  const pool = new Pool({ connectionString: postgresUrl });
  try {
    await pool.query("BEGIN");
    await pool.query("DELETE FROM announcement_receipts WHERE announcement_id IN (SELECT id FROM announcements WHERE task_id = $1)", [
      taskId,
    ]);
    await pool.query("DELETE FROM announcements WHERE task_id = $1", [taskId]);
    await pool.query("DELETE FROM task_comments WHERE task_id = $1", [taskId]);
    await pool.query("DELETE FROM response_items WHERE response_id IN (SELECT id FROM responses WHERE task_id = $1)", [taskId]);
    await pool.query("DELETE FROM responses WHERE task_id = $1", [taskId]);
    await pool.query("DELETE FROM task_options WHERE task_id = $1", [taskId]);
    await pool.query("DELETE FROM tasks WHERE id = $1", [taskId]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

function cleanupSqliteFiles(dbPath) {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

async function main() {
  const sqlitePath = join(tmpdir(), `circles-api-smoke-${Date.now()}.sqlite`);
  try {
    await runApiFlow({
      label: "sqlite",
      env: { DATA_STORE: "sqlite", SQLITE_DB_PATH: sqlitePath },
    });
  } finally {
    cleanupSqliteFiles(sqlitePath);
  }

  if (process.env.SKIP_POSTGRES_SMOKE === "1") {
    log("postgres: skipped by SKIP_POSTGRES_SMOKE=1");
    return;
  }

  await assertPostgresReady();
  await runApiFlow({
    label: "postgres",
    env: { DATA_STORE: "postgres", DATABASE_URL: postgresUrl },
    cleanupCreatedTask: cleanupPostgresTask,
  });

  log("all API smoke tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
