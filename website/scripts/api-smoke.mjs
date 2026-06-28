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
  process.env.API_SMOKE_DATABASE_URL || "postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local";

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
  return { status: response.status, body, headers: response.headers };
}

async function runApiFlow({ label, env, cleanupCreatedTask, cleanupCreatedPushToken, cleanupCreatedInviteData }) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = startApi({ HOST: "127.0.0.1", PORT: String(port), ...env });
  const actorHeaders = { "x-incircle-profile-email": "kevin@example.com" };
  let createdTaskId = null;
  const createdTaskIds = [];
  const createdPushTokens = [];
  const createdInviteIds = [];
  let inviteSmokeProfileId = null;
  let invitedMemberHeaders = null;

  try {
    const health = await waitForHealth(baseUrl, api);
    assert.equal(health.ok, true);
    log(`${label}: ${health.backend} API ready on ${port}`);

    const anonymousBootstrap = await request(baseUrl, "/api/bootstrap");
    assert.ok(
      anonymousBootstrap.body.templates.some((template) => template.id === "interest_check"),
      `${label}: expected anonymous bootstrap interest_check template`,
    );
    if (label === "postgres") {
      assert.equal(anonymousBootstrap.body.circles.length, 0, `${label}: anonymous bootstrap should not expose circles`);
      assert.equal(anonymousBootstrap.body.tasks.length, 0, `${label}: anonymous bootstrap should not expose tasks`);
    }

    const bootstrap = await request(baseUrl, "/api/bootstrap", { headers: actorHeaders });
    assert.ok(bootstrap.body.circles.length >= 1, `${label}: expected at least one visible circle`);
    assert.ok(bootstrap.body.tasks.length >= 1, `${label}: expected at least one visible task`);
    assert.ok(bootstrap.body.templates.length >= 9, `${label}: expected task templates`);
    assert.ok(
      bootstrap.body.templates.some((template) => template.id === "interest_check"),
      `${label}: expected interest_check template`,
    );
    assert.ok(
      bootstrap.body.templates.some((template) => template.id === "claim"),
      `${label}: expected claim template`,
    );

    const anonymousSession = await request(baseUrl, "/api/session");
    assert.equal(anonymousSession.body.authenticated, false);
    assert.equal(anonymousSession.body.profile, null);

    const session = await request(baseUrl, "/api/session", { headers: actorHeaders });
    assert.equal(session.body.authenticated, true);
    assert.equal(session.body.profile.email, "kevin@example.com");
    assert.ok(session.body.memberships.length >= 1, `${label}: expected profile memberships`);

    const memberCircleIds = new Set(session.body.memberships.map((membership) => membership.circleId));
    const officeCircle =
      bootstrap.body.circles.find((circle) => circle.name.includes("辦公室") && memberCircleIds.has(circle.id)) ??
      bootstrap.body.circles.find((circle) => memberCircleIds.has(circle.id)) ??
      bootstrap.body.circles[0];

    const providers = await request(baseUrl, "/api/auth/providers");
    assert.ok(
      ["apple", "google", "line"].every((provider) => providers.body.providers.some((item) => item.id === provider)),
      `${label}: expected Apple, Google, and LINE providers`,
    );

    let sessionHeaders = actorHeaders;
    if (label === "postgres") {
      const devSession = await request(baseUrl, "/api/auth/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "kevin@example.com" }),
      });
      const cookie = devSession.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie, `${label}: expected dev-session Set-Cookie`);
      sessionHeaders = { Cookie: cookie };

      const cookieSession = await request(baseUrl, "/api/session", { headers: sessionHeaders });
      assert.equal(cookieSession.body.authenticated, true);
      assert.equal(cookieSession.body.profile.email, "kevin@example.com");

      const cookieBootstrap = await request(baseUrl, "/api/bootstrap", { headers: sessionHeaders });
      assert.ok(cookieBootstrap.body.circles.length >= 1, `${label}: expected cookie bootstrap circles`);
      assert.ok(cookieBootstrap.body.tasks.length >= 1, `${label}: expected cookie bootstrap tasks`);

      const anonymousCreate = await fetch(`${baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          circleId: officeCircle.id,
          template: "drink_order",
          title: `${label} anonymous task should fail`,
          options: [{ title: "匿名選項", unitPrice: 1 }],
        }),
      });
      assert.equal(anonymousCreate.status, 401, `${label}: anonymous task creation should require login`);

      const anonymousTaskRead = await fetch(`${baseUrl}/api/tasks/${cookieBootstrap.body.tasks[0].id}`);
      assert.equal(anonymousTaskRead.status, 401, `${label}: anonymous direct task read should require login`);
    }

    const createdCircle = await request(baseUrl, "/api/circles", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
      body: JSON.stringify({
        name: `${label} API smoke 圈子 ${Date.now()}`,
        description: "自動測試建立圈子與圈主權限。",
      }),
    });
    assert.equal(createdCircle.status, 201);
    assert.equal(createdCircle.body.circle.memberCount, 1);

    const updatedCircle = await request(baseUrl, `/api/circles/${createdCircle.body.circle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
      body: JSON.stringify({
        name: `${label} API smoke 圈子已更新`,
        description: "自動測試更新圈子名稱與說明。",
      }),
    });
    assert.equal(updatedCircle.body.circle.name, `${label} API smoke 圈子已更新`);
    assert.equal(updatedCircle.body.circle.description, "自動測試更新圈子名稱與說明。");

    const postCircleSession = await request(baseUrl, "/api/session", { headers: sessionHeaders });
    assert.ok(
      postCircleSession.body.memberships.some(
        (membership) =>
          membership.circleId === createdCircle.body.circle.id &&
          membership.circleName === updatedCircle.body.circle.name &&
          membership.role === "owner",
      ),
      `${label}: expected created circle owner membership`,
    );

    const postCircleBootstrap = await request(baseUrl, "/api/bootstrap", { headers: sessionHeaders });
    assert.ok(
      postCircleBootstrap.body.circles.some(
        (circle) => circle.id === createdCircle.body.circle.id && circle.name === updatedCircle.body.circle.name,
      ),
      `${label}: expected updated circle in bootstrap`,
    );

    const members = await request(baseUrl, `/api/circles/${officeCircle.id}/members`, { headers: sessionHeaders });
    assert.ok(members.body.members.length >= 1, `${label}: expected circle members`);
    assert.ok(
      members.body.members.some((member) => member.role === "owner"),
      `${label}: expected owner membership`,
    );

    if (label === "postgres") {
      const invite = await request(baseUrl, `/api/circles/${officeCircle.id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({
          role: "member",
          maxUses: 2,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      assert.equal(invite.status, 201);
      assert.equal(invite.body.invite.circleId, officeCircle.id);
      assert.equal(invite.body.invite.role, "member");
      assert.equal(invite.body.invite.usedCount, 0);
      createdInviteIds.push(invite.body.invite.id);

      const inviteList = await request(baseUrl, `/api/circles/${officeCircle.id}/invites`, { headers: sessionHeaders });
      assert.ok(
        inviteList.body.invites.some((item) => item.id === invite.body.invite.id),
        `${label}: expected created invite in invite list`,
      );

      const invitePreview = await request(baseUrl, `/api/circle-invites/${invite.body.invite.code}`);
      assert.equal(invitePreview.body.invite.circleId, officeCircle.id);
      assert.equal(invitePreview.body.invite.available, true);

      const inviteProfile = await ensurePostgresProfile("invite-smoke@example.com", "邀請測試成員");
      inviteSmokeProfileId = inviteProfile.id;
      const joinerSession = await request(baseUrl, "/api/auth/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invite-smoke@example.com" }),
      });
      const joinerCookie = joinerSession.headers.get("set-cookie")?.split(";")[0];
      assert.ok(joinerCookie, `${label}: expected invite joiner Set-Cookie`);
      const joinerHeaders = { Cookie: joinerCookie };
      invitedMemberHeaders = joinerHeaders;

      const accepted = await request(baseUrl, `/api/circle-invites/${invite.body.invite.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...joinerHeaders },
        body: JSON.stringify({}),
      });
      assert.equal(accepted.status, 201);
      assert.equal(accepted.body.joined, true);
      assert.equal(accepted.body.membership.circleId, officeCircle.id);
      assert.equal(accepted.body.membership.role, "member");

      const joinerContext = await request(baseUrl, "/api/session", { headers: joinerHeaders });
      assert.ok(
        joinerContext.body.memberships.some((membership) => membership.circleId === officeCircle.id),
        `${label}: expected invite joiner circle membership`,
      );

      const membersAfterInvite = await request(baseUrl, `/api/circles/${officeCircle.id}/members`, { headers: sessionHeaders });
      const joinedMember = membersAfterInvite.body.members.find((member) => member.profileId === inviteSmokeProfileId);
      assert.ok(joinedMember, `${label}: expected invited member in owner member list`);

      const updatedMember = await request(baseUrl, `/api/circles/${officeCircle.id}/members/${joinedMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({
          role: "guest",
          displayName: "邀請測試成員已整理",
          contactHint: "由 smoke 測試更新",
        }),
      });
      assert.equal(updatedMember.body.member.role, "guest");
      assert.equal(updatedMember.body.member.displayName, "邀請測試成員已整理");
      assert.equal(updatedMember.body.member.contactHint, "由 smoke 測試更新");
    }

    const created = await request(baseUrl, "/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
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

    if (label === "postgres") {
      const anonymousPermissions = await fetch(`${baseUrl}/api/tasks/${createdTaskId}/permissions`);
      assert.equal(anonymousPermissions.status, 401, `${label}: anonymous task permissions should require login`);
    }

    const permissions = await request(baseUrl, `/api/tasks/${createdTaskId}/permissions`, { headers: sessionHeaders });
    assert.equal(permissions.body.permissions.authenticated, true);
    assert.equal(permissions.body.permissions.canManage, true);
    assert.equal(permissions.body.permissions.canAnnounce, true);
    assert.equal(permissions.body.permissions.canExport, true);

    if (label === "postgres" && invitedMemberHeaders) {
      const memberPermissions = await request(baseUrl, `/api/tasks/${createdTaskId}/permissions`, {
        headers: invitedMemberHeaders,
      });
      assert.equal(memberPermissions.body.permissions.authenticated, true);
      assert.equal(memberPermissions.body.permissions.canRead, true);
      assert.equal(memberPermissions.body.permissions.canManage, false);
      assert.equal(memberPermissions.body.permissions.canAnnounce, false);
      assert.equal(memberPermissions.body.permissions.canExport, false);
      assert.equal(memberPermissions.body.permissions.role, "guest");
    }

    const edited = await request(baseUrl, `/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
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
      headers: { "Content-Type": "application/json", ...sessionHeaders },
      body: JSON.stringify({
        title: "取餐提醒",
        body: `${label} 測試公告：飲料到前台後請自取。`,
        priority: "important",
      }),
    });
    assert.equal(announced.status, 201);
    assert.equal(announced.body.task.announcements.length, 1);
    assert.equal(announced.body.task.announcements[0].priority, "important");
    if (label === "postgres" && invitedMemberHeaders) {
      const memberNotifications = await request(baseUrl, "/api/notifications", { headers: invitedMemberHeaders });
      const announcementNotification = memberNotifications.body.notifications.find(
        (notification) => notification.announcementId === announced.body.task.announcements[0].id,
      );
      assert.ok(announcementNotification, `${label}: expected invited member notification for announcement`);
      assert.equal(announcementNotification.taskId, createdTaskId);
      assert.ok(announcementNotification.data.conversationId, `${label}: expected announcement notification conversationId`);
      assert.equal(announcementNotification.readAt, null);

      const announcementConversations = await request(baseUrl, `/api/circles/${officeCircle.id}/conversations?taskId=${createdTaskId}`, {
        headers: sessionHeaders,
      });
      assert.ok(
        announcementConversations.body.conversations.some((item) => item.id === announcementNotification.data.conversationId),
        `${label}: expected announcement task conversation`,
      );
      const announcementMessages = await request(baseUrl, `/api/conversations/${announcementNotification.data.conversationId}/messages`, {
        headers: sessionHeaders,
      });
      assert.ok(
        announcementMessages.body.messages.some(
          (item) => item.metadata?.source === "announcement" && item.metadata?.announcementId === announced.body.task.announcements[0].id,
        ),
        `${label}: expected announcement mirrored into task conversation`,
      );
    }

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

    if (label === "postgres") {
      const conversation = await request(baseUrl, `/api/circles/${officeCircle.id}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({
          taskId: createdTaskId,
          title: `${label} API smoke 討論`,
          metadata: { smoke: true, backend: label },
        }),
      });
      assert.equal(conversation.status, 201);
      assert.equal(conversation.body.conversation.taskId, createdTaskId);

      const conversations = await request(baseUrl, `/api/circles/${officeCircle.id}/conversations?taskId=${createdTaskId}`, {
        headers: sessionHeaders,
      });
      assert.ok(
        conversations.body.conversations.some((item) => item.id === conversation.body.conversation.id),
        `${label}: expected created conversation in list`,
      );

      const message = await request(baseUrl, `/api/conversations/${conversation.body.conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({
          body: `${label} 測試訊息：飲料到前台後請自取。`,
          metadata: { smoke: true },
        }),
      });
      assert.equal(message.status, 201);
      assert.equal(message.body.message.authorName, "Kevin");

      if (invitedMemberHeaders) {
        const memberNotifications = await request(baseUrl, "/api/notifications", { headers: invitedMemberHeaders });
        const memberNotification = memberNotifications.body.notifications.find(
          (notification) => notification.messageId === message.body.message.id,
        );
        assert.ok(memberNotification, `${label}: expected invited member notification for new message`);
        assert.equal(memberNotification.readAt, null);

        const readNotification = await request(baseUrl, `/api/notifications/${memberNotification.id}/read`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...invitedMemberHeaders },
          body: JSON.stringify({}),
        });
        assert.equal(readNotification.body.notification.id, memberNotification.id);
        assert.ok(readNotification.body.notification.readAt, `${label}: expected notification read timestamp`);
      }

      const messages = await request(baseUrl, `/api/conversations/${conversation.body.conversation.id}/messages`, {
        headers: sessionHeaders,
      });
      assert.ok(
        messages.body.messages.some((item) => item.id === message.body.message.id),
        `${label}: expected created message in list`,
      );

      const receipt = await request(baseUrl, `/api/messages/${message.body.message.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({}),
      });
      assert.equal(receipt.status, 201);
      assert.equal(receipt.body.receipt.messageId, message.body.message.id);

      const pushToken = `api-smoke-${createdTaskId}`;
      createdPushTokens.push(pushToken);
      const device = await request(baseUrl, "/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({
          platform: "web",
          pushToken,
          appVersion: "smoke",
          deviceName: "API smoke",
        }),
      });
      assert.equal(device.status, 201);
      assert.equal(device.body.device.pushToken, pushToken);

      const notifications = await request(baseUrl, "/api/notifications", { headers: sessionHeaders });
      assert.ok(Array.isArray(notifications.body.notifications), `${label}: expected notifications array`);
    }

    const response = submitted.body.task.responses.find((item) => item.participantName === `${label} 測試成員`);
    assert.ok(response, `${label}: expected created response`);
    assert.equal(response.paymentStatus, "unpaid");

    const patched = await request(baseUrl, `/api/responses/${response.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
      body: JSON.stringify({ paymentStatus: "paid", fulfillmentStatus: "picked_up" }),
    });
    const patchedResponse = patched.body.task.responses.find((item) => item.id === response.id);
    assert.equal(patchedResponse.paymentStatus, "paid");
    assert.equal(patchedResponse.fulfillmentStatus, "picked_up");
    assert.equal(patched.body.task.stats.paid, 1);

    const closed = await request(baseUrl, `/api/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
      body: JSON.stringify({ status: "closed" }),
    });
    assert.equal(closed.body.task.status, "closed");

    const reopened = await request(baseUrl, `/api/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
      body: JSON.stringify({ status: "open" }),
    });
    assert.equal(reopened.body.task.status, "open");

    const csvResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskId}/export.csv`, { headers: sessionHeaders });
    const csv = await csvResponse.text();
    assert.equal(csvResponse.status, 200);
    assert.ok(csv.includes(`${label} 測試成員`), `${label}: CSV should include participant`);
    assert.ok(csv.includes("紅茶拿鐵已編輯"), `${label}: CSV should include edited selected option`);

    const interest = await request(baseUrl, "/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeaders },
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
      headers: { "Content-Type": "application/json", ...sessionHeaders },
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

    if (label === "postgres") {
      await request(baseUrl, "/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({}),
      });
      const loggedOut = await request(baseUrl, "/api/session", { headers: sessionHeaders });
      assert.equal(loggedOut.body.authenticated, false);
    }

    log(`${label}: flow passed`);
    return { createdTaskId };
  } finally {
    await stopApi(api);
    if (cleanupCreatedTask) {
      for (const taskId of createdTaskIds.toReversed()) {
        await cleanupCreatedTask(taskId);
      }
    }
    if (cleanupCreatedPushToken) {
      for (const pushToken of createdPushTokens.toReversed()) {
        await cleanupCreatedPushToken(pushToken);
      }
    }
    if (cleanupCreatedInviteData) {
      await cleanupCreatedInviteData({ profileId: inviteSmokeProfileId, inviteIds: createdInviteIds });
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
      `Postgres smoke requires local Postgres at ${postgresUrl}. Start Homebrew PostgreSQL with brew services start postgresql@16, then apply the migration and seed. For Docker Postgres parity, set API_SMOKE_DATABASE_URL explicitly.\n${error.message}`,
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

async function cleanupPostgresPushToken(pushToken) {
  if (!pushToken) return;
  const pool = new Pool({ connectionString: postgresUrl });
  try {
    await pool.query("DELETE FROM devices WHERE push_token = $1", [pushToken]);
  } finally {
    await pool.end();
  }
}

async function ensurePostgresProfile(email, displayName) {
  const pool = new Pool({ connectionString: postgresUrl });
  try {
    const existing = await pool.query(
      `
        SELECT id::text
        FROM profiles
        WHERE lower(email) = lower($1)
        LIMIT 1
      `,
      [email],
    );
    if (existing.rows[0]) {
      await pool.query(
        `
          UPDATE profiles
          SET display_name = $2,
              status = 'active',
              deleted_at = NULL
          WHERE id::text = $1
        `,
        [existing.rows[0].id, displayName],
      );
      return { id: existing.rows[0].id };
    }

    const created = await pool.query(
      `
        INSERT INTO profiles (display_name, email, locale, timezone, metadata)
        VALUES ($1, $2, 'zh-TW', 'Asia/Taipei', $3::jsonb)
        RETURNING id::text
      `,
      [displayName, email, JSON.stringify({ smoke: true })],
    );
    return { id: created.rows[0].id };
  } finally {
    await pool.end();
  }
}

async function cleanupPostgresInviteData({ profileId, inviteIds }) {
  const pool = new Pool({ connectionString: postgresUrl });
  try {
    await pool.query("BEGIN");
    if (inviteIds.length > 0) {
      await pool.query("DELETE FROM circle_invites WHERE id = ANY($1::uuid[])", [inviteIds]);
    }
    if (profileId) {
      await pool.query("DELETE FROM auth_sessions WHERE profile_id::text = $1", [profileId]);
      await pool.query("DELETE FROM circle_memberships WHERE profile_id::text = $1", [profileId]);
      await pool.query("DELETE FROM auth_identities WHERE profile_id::text = $1", [profileId]);
      await pool.query("DELETE FROM profiles WHERE id::text = $1", [profileId]);
    }
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
    env: { DATA_STORE: "postgres", DATABASE_URL: postgresUrl, AUTH_DEV_LOGIN_ENABLED: "1", AUTH_COOKIE_SECURE: "0" },
    cleanupCreatedTask: cleanupPostgresTask,
    cleanupCreatedPushToken: cleanupPostgresPushToken,
    cleanupCreatedInviteData: cleanupPostgresInviteData,
  });

  log("all API smoke tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
