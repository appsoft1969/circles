import express from "express";
import { createStoreFromEnv } from "./data/storeFactory.js";
import { StoreError } from "./data/storeShared.js";

const store = createStoreFromEnv();

if (process.argv.includes("--seed-only")) {
  const health = await store.health();
  console.log(`Initialized ${health.backend} store`);
  if (health.dbPath) console.log(`SQLite database: ${health.dbPath}`);
  if (health.database) console.log(`Postgres database: ${health.database}`);
  await store.close?.();
  process.exit(0);
}

const app = express();
app.use(express.json());

function actorFromRequest(req) {
  return {
    profileId: req.get("x-incircle-profile-id") || null,
    email: req.get("x-incircle-profile-email") || null,
  };
}

function sendError(res, error) {
  if (error instanceof StoreError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
}

function route(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch((error) => sendError(res, error));
}

app.get("/api/health", route(async (_req, res) => {
  res.json(await store.health());
}));

app.get("/api/bootstrap", route(async (_req, res) => {
  res.json(await store.getBootstrap());
}));

app.get("/api/session", route(async (req, res) => {
  res.json(await store.getSessionContext(actorFromRequest(req)));
}));

app.get("/api/circles/:circleId/members", route(async (req, res) => {
  const members = await store.listCircleMembers(req.params.circleId, actorFromRequest(req));
  res.json({ members });
}));

app.get("/api/tasks/:taskId", route(async (req, res) => {
  const task = await store.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
}));

app.get("/api/tasks/:taskId/permissions", route(async (req, res) => {
  const permissions = await store.getTaskPermissions(req.params.taskId, actorFromRequest(req));
  if (!permissions) return res.status(404).json({ error: "Task not found" });
  res.json({ permissions });
}));

app.post("/api/tasks", route(async (req, res) => {
  const task = await store.createTask(req.body ?? {});
  res.status(201).json({ task });
}));

app.post("/api/tasks/:taskId/convert", route(async (req, res) => {
  const result = await store.convertInterestCheck(req.params.taskId, req.body ?? {});
  if (!result) return res.status(404).json({ error: "Task not found" });
  res.status(201).json(result);
}));

app.patch("/api/tasks/:taskId", route(async (req, res) => {
  const task = await store.updateTaskDetails(req.params.taskId, req.body ?? {});
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
}));

app.get("/api/share/:token", route(async (req, res) => {
  const task = await store.getTaskByShareToken(req.params.token);
  if (!task) return res.status(404).json({ error: "Share link not found" });
  res.json({ task });
}));

app.post("/api/share/:token/responses", route(async (req, res) => {
  const task = await store.createShareResponse(req.params.token, req.body ?? {});
  res.status(201).json({ task });
}));

app.patch("/api/responses/:responseId", route(async (req, res) => {
  const task = await store.updateResponse(req.params.responseId, req.body ?? {});
  if (!task) return res.status(404).json({ error: "Response not found" });
  res.json({ task });
}));

app.patch("/api/tasks/:taskId/status", route(async (req, res) => {
  const task = await store.updateTaskStatus(req.params.taskId, req.body?.status || "open");
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
}));

app.post("/api/tasks/:taskId/announcements", route(async (req, res) => {
  const task = await store.createTaskAnnouncement(req.params.taskId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.status(201).json({ task });
}));

app.post("/api/tasks/:taskId/comments", route(async (req, res) => {
  const task = await store.createTaskComment(req.params.taskId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.status(201).json({ task });
}));

app.get("/api/circles/:circleId/conversations", route(async (req, res) => {
  const conversations = await store.listConversations(req.params.circleId, {
    taskId: req.query.taskId || null,
    actor: actorFromRequest(req),
  });
  res.json({ conversations });
}));

app.post("/api/circles/:circleId/conversations", route(async (req, res) => {
  const conversation = await store.createConversation(req.params.circleId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.status(201).json({ conversation });
}));

app.get("/api/conversations/:conversationId/messages", route(async (req, res) => {
  const messages = await store.listConversationMessages(req.params.conversationId, {
    actor: actorFromRequest(req),
  });
  res.json({ messages });
}));

app.post("/api/conversations/:conversationId/messages", route(async (req, res) => {
  const result = await store.createConversationMessage(req.params.conversationId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.status(201).json(result);
}));

app.post("/api/messages/:messageId/read", route(async (req, res) => {
  const receipt = await store.markMessageRead(req.params.messageId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.status(201).json({ receipt });
}));

app.post("/api/devices", route(async (req, res) => {
  const device = await store.registerDevice({
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.status(201).json({ device });
}));

app.get("/api/notifications", route(async (req, res) => {
  const notifications = await store.listNotifications(actorFromRequest(req));
  res.json({ notifications });
}));

app.patch("/api/notifications/:notificationId/read", route(async (req, res) => {
  const notification = await store.markNotificationRead(req.params.notificationId, actorFromRequest(req));
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification });
}));

app.get("/api/tasks/:taskId/export.csv", route(async (req, res) => {
  const result = await store.buildTaskCsv(req.params.taskId);
  if (!result) return res.status(404).send("Task not found");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${encodeURIComponent(result.task.title)}.csv\"`);
  res.send(`\uFEFF${result.csv}`);
}));

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () => {
  console.log(`InCircle API listening on http://${host}:${port}`);
  console.log(`Data store: ${store.backend}`);
  if (store.dbPath) console.log(`SQLite database: ${store.dbPath}`);
  if (store.connectionString) console.log(`Postgres: ${store.connectionString}`);
});
