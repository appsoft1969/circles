import express from "express";
import {
  buildAuthorizationUrl,
  exchangeOAuthCode,
  oauthRandomToken,
  supportedAuthProviders,
} from "./auth/oauthProviders.js";
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
app.use(express.urlencoded({ extended: false }));

const sessionCookieName = process.env.AUTH_SESSION_COOKIE || "incircle_session";

function actorFromRequest(req) {
  return {
    sessionToken: readCookie(req, sessionCookieName) || bearerToken(req),
    profileId: req.get("x-incircle-profile-id") || null,
    email: req.get("x-incircle-profile-email") || null,
  };
}

function readCookie(req, name) {
  const header = req.get("cookie");
  if (!header) return null;
  const cookies = Object.fromEntries(
    header.split(";").map((cookie) => {
      const [key, ...rest] = cookie.trim().split("=");
      return [key, decodeURIComponent(rest.join("=") || "")];
    }),
  );
  return cookies[name] || null;
}

function bearerToken(req) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function cookieOptions() {
  const secure = process.env.AUTH_COOKIE_SECURE !== "0";
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    `Max-Age=${60 * 60 * 24 * 30}`,
  ].filter(Boolean);
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${sessionCookieName}=${encodeURIComponent(token)}; ${cookieOptions().join("; ")}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function requestMetadata(req, provider = null) {
  return {
    provider,
    userAgent: req.get("user-agent") || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
  };
}

function safeRedirectPath(value) {
  if (!value || typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function parseAppleUser(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sendError(res, error) {
  if (error instanceof StoreError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (Number.isInteger(error.status)) {
    return res.status(error.status).json({
      error: error.message,
      missingEnv: error.missingEnv || undefined,
    });
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

app.get("/api/bootstrap", route(async (req, res) => {
  res.json(await store.getBootstrap(actorFromRequest(req)));
}));

app.get("/api/session", route(async (req, res) => {
  res.json(await store.getSessionContext(actorFromRequest(req)));
}));

app.patch("/api/profile", route(async (req, res) => {
  const profile = await store.updateProfile({
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.json({ profile });
}));

app.get("/api/auth/providers", route(async (_req, res) => {
  res.json({ providers: supportedAuthProviders(process.env) });
}));

app.get("/api/auth/:provider/start", route(async (req, res) => {
  const provider = req.params.provider;
  const nonce = oauthRandomToken(16);
  const { state } = await store.createOAuthState(provider, {
    nonce,
    redirectAfter: safeRedirectPath(req.query.redirectAfter || "/"),
  });
  const authorization = buildAuthorizationUrl({ provider, req, state, nonce });
  res.redirect(authorization.url);
}));

app.all("/api/auth/:provider/callback", route(async (req, res) => {
  const provider = req.params.provider;
  const code = req.method === "POST" ? req.body?.code : req.query.code;
  const state = req.method === "POST" ? req.body?.state : req.query.state;
  if (!code || !state) throw new StoreError(400, "OAuth callback requires code and state");

  const oauthState = await store.consumeOAuthState(provider, state);
  if (!oauthState) throw new StoreError(400, "OAuth state is invalid or expired");

  const rawUser = provider === "apple" ? parseAppleUser(req.body?.user) : null;
  const { identity } = await exchangeOAuthCode({
    provider,
    req,
    code,
    nonce: oauthState.nonce,
    rawUser,
  });
  const { profile } = await store.upsertAuthIdentity(identity);
  const { token } = await store.createAuthSession(profile.id, requestMetadata(req, provider));
  setSessionCookie(res, token);
  res.redirect(safeRedirectPath(oauthState.redirectAfter || "/"));
}));

app.post("/api/auth/logout", route(async (req, res) => {
  await store.revokeAuthSession(actorFromRequest(req).sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.post("/api/auth/dev-session", route(async (req, res) => {
  if (process.env.AUTH_DEV_LOGIN_ENABLED !== "1") {
    throw new StoreError(403, "Development login is disabled");
  }
  const email = req.body?.email || "kevin@example.com";
  const result = await store.createAuthSessionForEmail(email, requestMetadata(req, "dev"));
  setSessionCookie(res, result.token);
  res.status(201).json({
    profile: result.profile,
    session: result.session,
  });
}));

app.get("/api/circle-invites/:code", route(async (req, res) => {
  const invite = await store.getCircleInvite(req.params.code);
  res.json({ invite });
}));

app.post("/api/circle-invites/:code/join", route(async (req, res) => {
  const result = await store.acceptCircleInvite(req.params.code, actorFromRequest(req));
  res.status(result.joined ? 201 : 200).json(result);
}));

app.post("/api/circles", route(async (req, res) => {
  const circle = await store.createCircle({
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.status(201).json({ circle });
}));

app.patch("/api/circles/:circleId", route(async (req, res) => {
  const circle = await store.updateCircle(req.params.circleId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.json({ circle });
}));

app.get("/api/circles/:circleId/members", route(async (req, res) => {
  const members = await store.listCircleMembers(req.params.circleId, actorFromRequest(req));
  res.json({ members });
}));

app.patch("/api/circles/:circleId/members/:membershipId", route(async (req, res) => {
  const member = await store.updateCircleMember(req.params.circleId, req.params.membershipId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.json({ member });
}));

app.get("/api/circles/:circleId/invites", route(async (req, res) => {
  const invites = await store.listCircleInvites(req.params.circleId, actorFromRequest(req));
  res.json({ invites });
}));

app.post("/api/circles/:circleId/invites", route(async (req, res) => {
  const invite = await store.createCircleInvite(req.params.circleId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.status(201).json({ invite });
}));

app.patch("/api/circles/:circleId/invites/:inviteId", route(async (req, res) => {
  if (req.body?.revoked !== true) throw new StoreError(400, "Only invite revocation is supported");
  const invite = await store.revokeCircleInvite(req.params.circleId, req.params.inviteId, actorFromRequest(req));
  if (!invite) return res.status(404).json({ error: "Invite not found" });
  res.json({ invite });
}));

app.get("/api/tasks/:taskId", route(async (req, res) => {
  const task = await store.getTask(req.params.taskId, actorFromRequest(req));
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
}));

app.get("/api/tasks/:taskId/permissions", route(async (req, res) => {
  const permissions = await store.getTaskPermissions(req.params.taskId, actorFromRequest(req));
  if (!permissions) return res.status(404).json({ error: "Task not found" });
  res.json({ permissions });
}));

app.post("/api/tasks", route(async (req, res) => {
  const task = await store.createTask({
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  res.status(201).json({ task });
}));

app.post("/api/tasks/:taskId/convert", route(async (req, res) => {
  const result = await store.convertInterestCheck(req.params.taskId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  if (!result) return res.status(404).json({ error: "Task not found" });
  res.status(201).json(result);
}));

app.patch("/api/tasks/:taskId", route(async (req, res) => {
  const task = await store.updateTaskDetails(req.params.taskId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
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
  const task = await store.updateResponse(req.params.responseId, {
    ...(req.body ?? {}),
    actor: actorFromRequest(req),
  });
  if (!task) return res.status(404).json({ error: "Response not found" });
  res.json({ task });
}));

app.patch("/api/tasks/:taskId/status", route(async (req, res) => {
  const task = await store.updateTaskStatus(req.params.taskId, req.body?.status || "open", actorFromRequest(req));
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
  const result = await store.buildTaskCsv(req.params.taskId, actorFromRequest(req));
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
