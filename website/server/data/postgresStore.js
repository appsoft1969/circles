import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { buildInterestConversion, normalizeTaskOptions, StoreError, templateLabels } from "./storeShared.js";

const { Pool } = pg;

const defaultConnectionString = "postgres://circles:circles_dev_password@127.0.0.1:5433/circles_dev";

function maskConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return "postgres://****";
  }
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function amountFromCents(value) {
  return Number(value || 0) / 100;
}

function amountToCents(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function currency(value) {
  return String(value || "TWD").trim();
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function shareToken() {
  return randomBytes(7).toString("base64url");
}

function sessionToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function positiveInteger(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const taskStatuses = new Set(["draft", "open", "closed", "completed", "cancelled", "archived"]);
const paymentStatuses = new Set(["not_required", "unpaid", "review", "paid", "refunded", "cancelled", "failed"]);
const fulfillmentStatuses = new Set(["pending", "picked_up", "attending", "maybe", "completed", "cancelled", "no_show"]);
const announcementPriorities = new Set(["normal", "important", "urgent"]);
const inviteRoles = new Set(["member", "guest"]);
const memberRoles = new Set(["admin", "member", "guest"]);
const membershipStatuses = new Set(["active", "muted", "left", "removed"]);

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const groupKey = row[key];
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
    return groups;
  }, new Map());
}

function optionFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    unitPrice: amountFromCents(row.unit_price_cents),
    currency: currency(row.currency),
    maxQuantity: row.max_quantity,
    metadata: parseJson(row.metadata),
    sortOrder: row.sort_order,
  };
}

function itemFromRow(row) {
  return {
    id: row.id,
    optionId: row.option_id,
    title: row.title,
    subtitle: row.subtitle,
    quantity: row.quantity,
    unitPrice: amountFromCents(row.unit_price_cents),
    currency: currency(row.currency),
    metadata: parseJson(row.metadata),
  };
}

function responseFromRows(response, items = []) {
  return {
    id: response.id,
    taskId: response.task_id,
    participantName: response.participant_name,
    participantContact: response.participant_contact,
    note: response.note,
    totalAmount: amountFromCents(response.total_amount_cents),
    currency: currency(response.currency),
    paymentStatus: response.payment_status,
    fulfillmentStatus: response.fulfillment_status,
    rsvpStatus: response.rsvp_status,
    guestCount: response.guest_count,
    metadata: parseJson(response.metadata),
    createdAt: toIso(response.created_at),
    updatedAt: toIso(response.updated_at),
    items,
  };
}

function announcementFromRow(row) {
  return {
    id: row.id,
    circleId: row.circle_id,
    taskId: row.task_id,
    authorName: row.author_name ?? "主揪",
    title: row.title,
    body: row.body,
    priority: row.priority,
    requiresConfirmation: row.requires_confirmation,
    pinnedAt: toIso(row.pinned_at),
    publishedAt: toIso(row.published_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function commentFromRow(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    authorName: row.author_name ?? "",
    participantName: row.participant_name ?? row.author_name ?? "成員",
    body: row.body,
    metadata: parseJson(row.metadata),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function profileFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    locale: row.locale,
    timezone: row.timezone,
    status: row.status,
  };
}

function membershipFromRow(row) {
  return {
    id: row.id,
    circleId: row.circle_id,
    circleName: row.circle_name,
    profileId: row.profile_id,
    displayName: row.display_name,
    contactHint: row.contact_hint,
    role: row.role,
    status: row.status,
    joinedAt: toIso(row.joined_at),
  };
}

function circleFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    inviteCode: row.invite_code,
    memberCount: Number(row.member_count || 0),
  };
}

function inviteFromRow(row) {
  return {
    id: row.id,
    circleId: row.circle_id,
    circleName: row.circle_name,
    circleDescription: row.circle_description,
    code: row.code,
    role: row.role,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: toIso(row.expires_at),
    createdByProfileId: row.created_by_profile_id,
    createdByName: row.created_by_name,
    createdAt: toIso(row.created_at),
    revokedAt: toIso(row.revoked_at),
    available: row.available,
  };
}

function conversationFromRow(row) {
  return {
    id: row.id,
    circleId: row.circle_id,
    taskId: row.task_id,
    type: row.type,
    title: row.title,
    metadata: parseJson(row.metadata),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function messageFromRow(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorProfileId: row.author_profile_id,
    authorName: row.author_name ?? "",
    body: row.body,
    metadata: parseJson(row.metadata),
    createdAt: toIso(row.created_at),
    editedAt: toIso(row.edited_at),
    deletedAt: toIso(row.deleted_at),
  };
}

function deviceFromRow(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    platform: row.platform,
    pushToken: row.push_token,
    appVersion: row.app_version,
    deviceName: row.device_name,
    locale: row.locale,
    timezone: row.timezone,
    lastSeenAt: toIso(row.last_seen_at),
    createdAt: toIso(row.created_at),
  };
}

function notificationFromRow(row) {
  return {
    id: row.id,
    recipientProfileId: row.recipient_profile_id,
    actorProfileId: row.actor_profile_id,
    circleId: row.circle_id,
    taskId: row.task_id,
    announcementId: row.announcement_id,
    messageId: row.message_id,
    type: row.type,
    title: row.title,
    body: row.body,
    status: row.status,
    data: parseJson(row.data),
    createdAt: toIso(row.created_at),
    readAt: toIso(row.read_at),
  };
}

function sessionFromRow(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    createdAt: toIso(row.created_at),
    lastSeenAt: toIso(row.last_seen_at),
    expiresAt: toIso(row.expires_at),
  };
}

function summarizeResponses(responses) {
  return responses.reduce(
    (acc, response) => {
      acc.responses += 1;
      acc.totalAmount += response.totalAmount;
      acc.totalQuantity += response.items.reduce((sum, item) => sum + item.quantity, 0);
      if (response.paymentStatus === "unpaid") acc.unpaid += 1;
      if (response.paymentStatus === "review") acc.review += 1;
      if (response.paymentStatus === "paid") acc.paid += 1;
      if (["pending", "attending", "maybe"].includes(response.fulfillmentStatus)) acc.pending += 1;
      return acc;
    },
    { responses: 0, totalAmount: 0, totalQuantity: 0, unpaid: 0, review: 0, paid: 0, pending: 0 },
  );
}

function taskFromRow(row, options = [], responses = [], announcements = [], comments = []) {
  return {
    id: row.id,
    circleId: row.circle_id,
    circleName: row.circle_name ?? "",
    template: row.template_id,
    templateLabel: row.template_label ?? templateLabels[row.template_id] ?? row.template_id,
    title: row.title,
    description: row.description,
    deadlineAt: toIso(row.deadline_at),
    status: row.status,
    shareToken: row.share_token,
    paymentInstructions: row.payment_instructions,
    pickupInstructions: row.pickup_instructions,
    metadata: parseJson(row.metadata),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    options,
    responses,
    announcements,
    comments,
    stats: summarizeResponses(responses),
  };
}

function buildCsv(task) {
  const rows = [
    ["事項", "模板", "姓名", "品項", "數量", "金額", "付款狀態", "完成狀態", "備註"],
    ...task.responses.flatMap((response) =>
      response.items.map((item) => [
        task.title,
        task.templateLabel,
        response.participantName,
        item.title,
        item.quantity,
        response.totalAmount,
        response.paymentStatus,
        response.fulfillmentStatus,
        response.note,
      ]),
    ),
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function createPostgresStore({ connectionString = defaultConnectionString } = {}) {
  const pool = new Pool({ connectionString });

  const taskSelect = `
    SELECT
      t.id::text,
      t.circle_id::text,
      t.template_id,
      t.title,
      t.description,
      t.status::text,
      t.deadline_at,
      t.share_token,
      t.payment_instructions,
      t.pickup_instructions,
      t.metadata,
      t.created_at,
      t.updated_at,
      c.name AS circle_name,
      tt.display_name AS template_label
    FROM tasks t
    JOIN circles c ON c.id = t.circle_id
    LEFT JOIN task_templates tt ON tt.id = t.template_id
    WHERE t.archived_at IS NULL
  `;

  async function health() {
    const result = await pool.query("SELECT current_database() AS database, current_user AS user_name");
    return {
      ok: true,
      backend: "postgres",
      database: result.rows[0]?.database,
      user: result.rows[0]?.user_name,
    };
  }

  async function withTransaction(callback) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function profileBySessionToken(token, client = pool) {
    if (!token) return null;
    const result = await client.query(
      `
        UPDATE auth_sessions s
        SET last_seen_at = now()
        FROM profiles p
        WHERE s.profile_id = p.id
          AND s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND p.deleted_at IS NULL
          AND p.status = 'active'
        RETURNING
          p.id::text,
          p.display_name,
          p.email,
          p.phone,
          p.avatar_url,
          p.locale,
          p.timezone,
          p.status::text
      `,
      [hashToken(token)],
    );
    return profileFromRow(result.rows[0]);
  }

  async function resolveProfile(actor = {}, client = pool) {
    const sessionProfile = actor.sessionToken ? await profileBySessionToken(actor.sessionToken, client) : null;
    if (sessionProfile) return sessionProfile;

    const profileId = actor.profileId ? String(actor.profileId).trim() : "";
    const email = actor.email ? String(actor.email).trim().toLowerCase() : "";
    if (!profileId && !email) return null;

    const result = profileId
      ? await client.query(
          `
            SELECT
              id::text,
              display_name,
              email,
              phone,
              avatar_url,
              locale,
              timezone,
              status::text
            FROM profiles
            WHERE id::text = $1
              AND deleted_at IS NULL
              AND status = 'active'
            LIMIT 1
          `,
          [profileId],
        )
      : await client.query(
          `
            SELECT
              id::text,
              display_name,
              email,
              phone,
              avatar_url,
              locale,
              timezone,
              status::text
            FROM profiles
            WHERE lower(email) = $1
              AND deleted_at IS NULL
              AND status = 'active'
            LIMIT 1
          `,
          [email],
        );

    return profileFromRow(result.rows[0]);
  }

  async function createAuthSession(profileId, metadata = {}) {
    const token = sessionToken();
    const result = await pool.query(
      `
        INSERT INTO auth_sessions (
          profile_id,
          token_hash,
          expires_at,
          user_agent,
          ip_address,
          metadata
        )
        VALUES ($1, $2, now() + interval '30 days', $3, $4, $5::jsonb)
        RETURNING id::text, profile_id::text, created_at, last_seen_at, expires_at
      `,
      [
        profileId,
        hashToken(token),
        metadata.userAgent || null,
        metadata.ipAddress || null,
        json({ provider: metadata.provider || null }),
      ],
    );
    return { token, session: sessionFromRow(result.rows[0]) };
  }

  async function revokeAuthSession(token) {
    if (!token) return false;
    const result = await pool.query(
      `
        UPDATE auth_sessions
        SET revoked_at = now()
        WHERE token_hash = $1
          AND revoked_at IS NULL
        RETURNING id
      `,
      [hashToken(token)],
    );
    return result.rowCount > 0;
  }

  async function createOAuthState(provider, body = {}) {
    const state = sessionToken();
    const result = await pool.query(
      `
        INSERT INTO auth_oauth_states (
          provider,
          state_hash,
          nonce,
          redirect_after,
          expires_at,
          metadata
        )
        VALUES ($1, $2, $3, $4, now() + interval '10 minutes', $5::jsonb)
        RETURNING id::text, provider, nonce, redirect_after, created_at, expires_at
      `,
      [provider, hashToken(state), body.nonce, body.redirectAfter || "/", json(body.metadata)],
    );
    return {
      state,
      oauthState: {
        id: result.rows[0].id,
        provider: result.rows[0].provider,
        nonce: result.rows[0].nonce,
        redirectAfter: result.rows[0].redirect_after,
        createdAt: toIso(result.rows[0].created_at),
        expiresAt: toIso(result.rows[0].expires_at),
      },
    };
  }

  async function consumeOAuthState(provider, state) {
    const result = await pool.query(
      `
        UPDATE auth_oauth_states
        SET consumed_at = now()
        WHERE provider = $1
          AND state_hash = $2
          AND consumed_at IS NULL
          AND expires_at > now()
        RETURNING id::text, provider, nonce, redirect_after, created_at, expires_at
      `,
      [provider, hashToken(state)],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      provider: row.provider,
      nonce: row.nonce,
      redirectAfter: row.redirect_after,
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at),
    };
  }

  async function upsertAuthIdentity(identity = {}) {
    if (!identity.provider || !identity.providerUserId) {
      throw new StoreError(400, "provider and providerUserId are required");
    }

    return withTransaction(async (client) => {
      const existingIdentity = await client.query(
        `
          SELECT
            p.id::text,
            p.display_name,
            p.email,
            p.phone,
            p.avatar_url,
            p.locale,
            p.timezone,
            p.status::text
          FROM auth_identities ai
          JOIN profiles p ON p.id = ai.profile_id
          WHERE ai.provider = $1
            AND ai.provider_user_id = $2
            AND p.deleted_at IS NULL
          LIMIT 1
        `,
        [identity.provider, identity.providerUserId],
      );

      let profile = profileFromRow(existingIdentity.rows[0]);
      if (!profile && identity.email && identity.emailVerified) {
        const profileResult = await client.query(
          `
            SELECT
              id::text,
              display_name,
              email,
              phone,
              avatar_url,
              locale,
              timezone,
              status::text
            FROM profiles
            WHERE lower(email) = lower($1)
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [identity.email],
        );
        profile = profileFromRow(profileResult.rows[0]);
      }

      if (!profile) {
        const created = await client.query(
          `
            INSERT INTO profiles (
              display_name,
              email,
              avatar_url,
              metadata
            )
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING
              id::text,
              display_name,
              email,
              phone,
              avatar_url,
              locale,
              timezone,
              status::text
          `,
          [
            identity.displayName || identity.email || `${identity.provider} 使用者`,
            identity.email || null,
            identity.avatarUrl || null,
            json({ createdFromProvider: identity.provider }),
          ],
        );
        profile = profileFromRow(created.rows[0]);
      } else {
        const updated = await client.query(
          `
            UPDATE profiles
            SET display_name = COALESCE(NULLIF($2, ''), display_name),
                email = COALESCE(NULLIF($3, ''), email),
                avatar_url = COALESCE(NULLIF($4, ''), avatar_url),
                updated_at = now()
            WHERE id::text = $1
            RETURNING
              id::text,
              display_name,
              email,
              phone,
              avatar_url,
              locale,
              timezone,
              status::text
          `,
          [profile.id, identity.displayName || "", identity.email || "", identity.avatarUrl || ""],
        );
        profile = profileFromRow(updated.rows[0]);
      }

      await client.query(
        `
          INSERT INTO auth_identities (
            profile_id,
            provider,
            provider_user_id,
            email,
            email_verified,
            display_name,
            avatar_url,
            raw_profile,
            last_login_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
          ON CONFLICT (provider, provider_user_id)
          DO UPDATE SET
            profile_id = EXCLUDED.profile_id,
            email = EXCLUDED.email,
            email_verified = EXCLUDED.email_verified,
            display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            raw_profile = EXCLUDED.raw_profile,
            last_login_at = now()
        `,
        [
          profile.id,
          identity.provider,
          identity.providerUserId,
          identity.email || null,
          Boolean(identity.emailVerified),
          identity.displayName || null,
          identity.avatarUrl || null,
          json(identity.rawProfile),
        ],
      );

      return { profile };
    });
  }

  async function createAuthSessionForEmail(email, metadata = {}) {
    const profile = await resolveProfile({ email });
    if (!profile) throw new StoreError(404, "Profile not found");
    const session = await createAuthSession(profile.id, metadata);
    return { profile, ...session };
  }

  async function requireProfile(actor = {}, client = pool) {
    const profile = await resolveProfile(actor, client);
    if (!profile) throw new StoreError(401, "Profile authentication required");
    return profile;
  }

  async function getMembership(circleId, profileId, client = pool) {
    const result = await client.query(
      `
        SELECT
          cm.id::text,
          cm.circle_id::text,
          c.name AS circle_name,
          cm.profile_id::text,
          cm.display_name,
          cm.contact_hint,
          cm.role::text,
          cm.status::text,
          cm.joined_at
        FROM circle_memberships cm
        JOIN circles c ON c.id = cm.circle_id
        WHERE cm.circle_id::text = $1
          AND cm.profile_id::text = $2
          AND cm.status = 'active'
          AND c.archived_at IS NULL
        LIMIT 1
      `,
      [circleId, profileId],
    );
    return result.rows[0] ? membershipFromRow(result.rows[0]) : null;
  }

  async function requireCircleMember(circleId, actor = {}, { roles = null, client = pool } = {}) {
    const profile = await requireProfile(actor, client);
    const membership = await getMembership(circleId, profile.id, client);
    if (!membership) throw new StoreError(403, "Circle membership required");
    if (roles && !roles.includes(membership.role)) {
      throw new StoreError(403, `Circle role required: ${roles.join(", ")}`);
    }
    return { profile, membership };
  }

  function hasActor(actor = {}) {
    return Boolean(actor.sessionToken || actor.profileId || actor.email);
  }

  async function requireTaskManager(taskId, actor = {}, client = pool) {
    const profile = await requireProfile(actor, client);
    const result = await client.query(
      `
        SELECT
          t.id::text,
          t.circle_id::text,
          t.created_by_profile_id::text,
          c.name AS circle_name,
          cm.role::text AS membership_role
        FROM tasks t
        JOIN circles c ON c.id = t.circle_id
        LEFT JOIN circle_memberships cm
          ON cm.circle_id = t.circle_id
         AND cm.profile_id = $2
         AND cm.status = 'active'
        WHERE t.id::text = $1
          AND t.archived_at IS NULL
          AND c.archived_at IS NULL
        LIMIT 1
      `,
      [taskId, profile.id],
    );
    const task = result.rows[0];
    if (!task) throw new StoreError(404, "Task not found");
    const canManage =
      task.created_by_profile_id === profile.id || ["owner", "admin"].includes(task.membership_role);
    if (!canManage) throw new StoreError(403, "Task manager role required");
    return { profile, task };
  }

  async function requireTaskReader(taskId, actor = {}, client = pool) {
    const profile = await requireProfile(actor, client);
    const result = await client.query(
      `
        SELECT
          t.id::text,
          t.circle_id::text,
          cm.role::text AS membership_role
        FROM tasks t
        JOIN circles c ON c.id = t.circle_id
        JOIN circle_memberships cm
          ON cm.circle_id = t.circle_id
         AND cm.profile_id = $2
         AND cm.status = 'active'
        WHERE t.id::text = $1
          AND t.archived_at IS NULL
          AND c.archived_at IS NULL
        LIMIT 1
      `,
      [taskId, profile.id],
    );
    const task = result.rows[0];
    if (!task) throw new StoreError(404, "Task not found");
    return { profile, task };
  }

  function normalizeInviteCode(code) {
    const cleaned = String(code || "").trim();
    if (!cleaned) throw new StoreError(400, "Invite code is required");
    return cleaned;
  }

  function normalizeCircleName(name) {
    const value = String(name || "").trim();
    if (!value) throw new StoreError(400, "Circle name is required");
    if (value.length > 40) throw new StoreError(400, "Circle name must be 40 characters or less");
    return value;
  }

  function normalizeCircleDescription(description = "") {
    const value = String(description || "").trim();
    if (value.length > 160) throw new StoreError(400, "Circle description must be 160 characters or less");
    return value;
  }

  function normalizeProfileDisplayName(value) {
    const clean = String(value || "").trim();
    if (!clean) throw new StoreError(400, "Profile display name is required");
    if (clean.length > 40) throw new StoreError(400, "Profile display name must be 40 characters or less");
    return clean;
  }

  function normalizeInviteRole(role = "member") {
    const value = String(role || "member").trim();
    if (!inviteRoles.has(value)) {
      throw new StoreError(400, "Invite role must be member or guest");
    }
    return value;
  }

  function normalizeMemberRole(role) {
    const value = String(role || "").trim();
    if (!memberRoles.has(value)) {
      throw new StoreError(400, "Member role must be admin, member, or guest");
    }
    return value;
  }

  function normalizeMemberDisplayName(value, fallback) {
    if (value == null) return fallback;
    const clean = String(value || "").trim();
    if (!clean) throw new StoreError(400, "Member display name is required");
    if (clean.length > 40) throw new StoreError(400, "Member display name must be 40 characters or less");
    return clean;
  }

  function normalizeMemberContactHint(value, fallback) {
    if (value == null) return fallback;
    const clean = String(value || "").trim();
    if (clean.length > 80) throw new StoreError(400, "Member contact hint must be 80 characters or less");
    return clean;
  }

  function normalizeMembershipStatus(status) {
    const value = String(status || "").trim();
    if (!membershipStatuses.has(value)) {
      throw new StoreError(400, "Membership status must be active, muted, left, or removed");
    }
    return value;
  }

  function normalizeInviteExpiresAt(value) {
    if (value === null) return null;
    const source = value || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) throw new StoreError(400, "Invite expiration is invalid");
    if (date.getTime() <= Date.now()) throw new StoreError(400, "Invite expiration must be in the future");
    return date.toISOString();
  }

  const inviteSelect = `
    SELECT
      ci.id::text,
      ci.circle_id::text,
      c.name AS circle_name,
      c.description AS circle_description,
      ci.code,
      ci.role::text,
      ci.max_uses,
      ci.used_count,
      ci.expires_at,
      ci.created_by_profile_id::text,
      creator.display_name AS created_by_name,
      ci.created_at,
      ci.revoked_at,
      (
        ci.revoked_at IS NULL
        AND c.archived_at IS NULL
        AND (ci.expires_at IS NULL OR ci.expires_at > now())
        AND (ci.max_uses IS NULL OR ci.used_count < ci.max_uses)
      ) AS available
    FROM circle_invites ci
    JOIN circles c ON c.id = ci.circle_id
    LEFT JOIN profiles creator ON creator.id = ci.created_by_profile_id
  `;

  async function loadCircleInvite(code, client = pool, { lock = false } = {}) {
    const result = await client.query(
      `
        ${inviteSelect}
        WHERE ci.code = $1
        LIMIT 1
        ${lock ? "FOR UPDATE OF ci" : ""}
      `,
      [normalizeInviteCode(code)],
    );
    return result.rows[0] ?? null;
  }

  function assertAvailableInvite(row) {
    if (!row || row.revoked_at) throw new StoreError(404, "Invite link not found");
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      throw new StoreError(410, "Invite link has expired");
    }
    if (row.max_uses != null && row.used_count >= row.max_uses) {
      throw new StoreError(409, "Invite link has reached its usage limit");
    }
    if (!row.available) throw new StoreError(404, "Invite link is not available");
  }

  async function createCircle(body = {}) {
    return withTransaction(async (client) => {
      const profile = await requireProfile(body.actor, client);
      const name = normalizeCircleName(body.name);
      const description = normalizeCircleDescription(body.description);
      const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
      const ownerDisplayName = profile.displayName || profile.email || "圈主";

      const result = await client.query(
        `
          WITH inserted_circle AS (
            INSERT INTO circles (
              owner_profile_id,
              name,
              description,
              visibility,
              metadata
            )
            VALUES ($1, $2, $3, 'private', $4::jsonb)
            RETURNING *
          ),
          inserted_membership AS (
            INSERT INTO circle_memberships (
              circle_id,
              profile_id,
              display_name,
              contact_hint,
              role,
              status,
              invited_by_profile_id,
              joined_at
            )
            SELECT
              id,
              $1,
              $5,
              '圈主',
              'owner',
              'active',
              $1,
              now()
            FROM inserted_circle
            RETURNING id
          )
          SELECT
            c.id::text,
            c.name,
            c.description,
            c.invite_code,
            1::int AS member_count
          FROM inserted_circle c
        `,
        [profile.id, name, description, json({ ...metadata, createdFrom: metadata.createdFrom ?? "web" }), ownerDisplayName],
      );

      return circleFromRow(result.rows[0]);
    });
  }

  async function updateCircle(circleId, body = {}) {
    return withTransaction(async (client) => {
      await requireCircleMember(circleId, body.actor, { roles: ["owner"], client });
      const name = normalizeCircleName(body.name);
      const description = normalizeCircleDescription(body.description);

      const result = await client.query(
        `
          UPDATE circles c
          SET name = $2,
              description = $3
          WHERE c.id::text = $1
            AND c.archived_at IS NULL
          RETURNING
            c.id::text,
            c.name,
            c.description,
            c.invite_code,
            (
              SELECT COUNT(active_cm.id)::int
              FROM circle_memberships active_cm
              WHERE active_cm.circle_id = c.id
                AND active_cm.status = 'active'
            ) AS member_count
        `,
        [circleId, name, description],
      );
      if (!result.rows[0]) throw new StoreError(404, "Circle not found");
      return circleFromRow(result.rows[0]);
    });
  }

  async function getSessionContext(actor = {}) {
    const profile = await resolveProfile(actor);
    if (!profile) {
      return {
        authenticated: false,
        profile: null,
        memberships: [],
        capabilities: {
          createTask: false,
          manageTasks: false,
          circleChat: false,
          pushDevices: false,
        },
      };
    }

    const membershipsResult = await pool.query(
      `
        SELECT
          cm.id::text,
          cm.circle_id::text,
          c.name AS circle_name,
          cm.profile_id::text,
          cm.display_name,
          cm.contact_hint,
          cm.role::text,
          cm.status::text,
          cm.joined_at
        FROM circle_memberships cm
        JOIN circles c ON c.id = cm.circle_id
        WHERE cm.profile_id::text = $1
          AND cm.status = 'active'
          AND c.archived_at IS NULL
        ORDER BY c.created_at ASC
      `,
      [profile.id],
    );
    const memberships = membershipsResult.rows.map(membershipFromRow);
    const canManage = memberships.some((membership) => ["owner", "admin"].includes(membership.role));

    return {
      authenticated: true,
      profile,
      memberships,
      capabilities: {
        createTask: canManage,
        manageTasks: canManage,
        circleChat: memberships.length > 0,
        pushDevices: true,
      },
    };
  }

  async function updateProfile(body = {}) {
    const profile = await requireProfile(body.actor);
    const displayName = normalizeProfileDisplayName(body.displayName);
    const result = await pool.query(
      `
        UPDATE profiles
        SET display_name = $2
        WHERE id::text = $1
          AND deleted_at IS NULL
          AND status = 'active'
        RETURNING
          id::text,
          display_name,
          email,
          phone,
          avatar_url,
          locale,
          timezone,
          status::text
      `,
      [profile.id, displayName],
    );
    if (!result.rows[0]) throw new StoreError(404, "Profile not found");
    return profileFromRow(result.rows[0]);
  }

  async function listCircleMembers(circleId, actor = {}) {
    await requireCircleMember(circleId, actor);

    const result = await pool.query(
      `
        SELECT
          cm.id::text,
          cm.circle_id::text,
          c.name AS circle_name,
          cm.profile_id::text,
          cm.display_name,
          cm.contact_hint,
          cm.role::text,
          cm.status::text,
          cm.joined_at
        FROM circle_memberships cm
        JOIN circles c ON c.id = cm.circle_id
        WHERE cm.circle_id::text = $1
          AND cm.status = 'active'
        ORDER BY
          CASE cm.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'member' THEN 3
            ELSE 4
          END,
          cm.created_at ASC
      `,
      [circleId],
    );

    return result.rows.map(membershipFromRow);
  }

  async function getCircleInvite(code) {
    const row = await loadCircleInvite(code);
    assertAvailableInvite(row);
    return inviteFromRow(row);
  }

  async function listCircleInvites(circleId, actor = {}) {
    await requireCircleMember(circleId, actor, { roles: ["owner", "admin"] });
    const result = await pool.query(
      `
        ${inviteSelect}
        WHERE ci.circle_id::text = $1
          AND ci.revoked_at IS NULL
        ORDER BY ci.created_at DESC
        LIMIT 20
      `,
      [circleId],
    );
    return result.rows.map(inviteFromRow);
  }

  async function createCircleInvite(circleId, body = {}) {
    const { profile } = await requireCircleMember(circleId, body.actor, { roles: ["owner", "admin"] });
    const role = normalizeInviteRole(body.role);
    const maxUses = positiveInteger(body.maxUses, 30);
    const expiresAt = normalizeInviteExpiresAt(body.expiresAt);

    const result = await pool.query(
      `
        WITH inserted AS (
          INSERT INTO circle_invites (
            circle_id,
            role,
            max_uses,
            expires_at,
            created_by_profile_id
          )
          VALUES ($1, $2::circle_role, $3, $4::timestamptz, $5)
          RETURNING *
        )
        ${inviteSelect.replace("FROM circle_invites ci", "FROM inserted ci")}
      `,
      [circleId, role, maxUses, expiresAt, profile.id],
    );
    return inviteFromRow(result.rows[0]);
  }

  async function revokeCircleInvite(circleId, inviteId, actor = {}) {
    await requireCircleMember(circleId, actor, { roles: ["owner", "admin"] });
    const result = await pool.query(
      `
        WITH revoked AS (
          UPDATE circle_invites
          SET revoked_at = now()
          WHERE circle_id::text = $1
            AND id::text = $2
            AND revoked_at IS NULL
          RETURNING *
        )
        ${inviteSelect.replace("FROM circle_invites ci", "FROM revoked ci")}
      `,
      [circleId, inviteId],
    );
    return result.rows[0] ? inviteFromRow(result.rows[0]) : null;
  }

  async function acceptCircleInvite(code, actor = {}) {
    return withTransaction(async (client) => {
      const profile = await requireProfile(actor, client);
      const inviteRow = await loadCircleInvite(code, client, { lock: true });
      assertAvailableInvite(inviteRow);

      const existingResult = await client.query(
        `
          SELECT
            cm.id::text,
            cm.circle_id::text,
            c.name AS circle_name,
            cm.profile_id::text,
            cm.display_name,
            cm.contact_hint,
            cm.role::text,
            cm.status::text,
            cm.joined_at
          FROM circle_memberships cm
          JOIN circles c ON c.id = cm.circle_id
          WHERE cm.circle_id::text = $1
            AND cm.profile_id::text = $2
          LIMIT 1
          FOR UPDATE OF cm
        `,
        [inviteRow.circle_id, profile.id],
      );

      const existing = existingResult.rows[0] ?? null;
      if (existing?.status === "active") {
        return {
          invite: inviteFromRow(inviteRow),
          membership: membershipFromRow(existing),
          joined: false,
          alreadyMember: true,
        };
      }

      const nextRole = existing && ["owner", "admin"].includes(existing.role) ? existing.role : inviteRow.role;
      const contactHint = "透過邀請連結加入";
      const membershipResult = existing
        ? await client.query(
            `
              UPDATE circle_memberships
              SET display_name = $2,
                  contact_hint = COALESCE(NULLIF(contact_hint, ''), $3),
                  role = $4::circle_role,
                  status = 'active',
                  invited_by_profile_id = COALESCE(invited_by_profile_id, $5),
                  joined_at = COALESCE(joined_at, now()),
                  removed_at = NULL
              WHERE id::text = $1
              RETURNING
                id::text,
                circle_id::text,
                $6::text AS circle_name,
                profile_id::text,
                display_name,
                contact_hint,
                role::text,
                status::text,
                joined_at
            `,
            [existing.id, profile.displayName, contactHint, nextRole, inviteRow.created_by_profile_id, inviteRow.circle_name],
          )
        : await client.query(
            `
              INSERT INTO circle_memberships (
                circle_id,
                profile_id,
                display_name,
                contact_hint,
                role,
                status,
                invited_by_profile_id,
                joined_at
              )
              VALUES ($1, $2, $3, $4, $5::circle_role, 'active', $6, now())
              RETURNING
                id::text,
                circle_id::text,
                $7::text AS circle_name,
                profile_id::text,
                display_name,
                contact_hint,
                role::text,
                status::text,
                joined_at
            `,
            [
              inviteRow.circle_id,
              profile.id,
              profile.displayName,
              contactHint,
              nextRole,
              inviteRow.created_by_profile_id,
              inviteRow.circle_name,
            ],
          );

      await client.query("UPDATE circle_invites SET used_count = used_count + 1 WHERE id::text = $1", [inviteRow.id]);
      return {
        invite: inviteFromRow({ ...inviteRow, used_count: inviteRow.used_count + 1 }),
        membership: membershipFromRow(membershipResult.rows[0]),
        joined: true,
        alreadyMember: false,
      };
    });
  }

  async function updateCircleMember(circleId, membershipId, body = {}) {
    return withTransaction(async (client) => {
      const { profile, membership: actorMembership } = await requireCircleMember(circleId, body.actor, {
        roles: ["owner", "admin"],
        client,
      });
      const targetResult = await client.query(
        `
          SELECT
            cm.id::text,
            cm.circle_id::text,
            c.name AS circle_name,
            cm.profile_id::text,
            cm.display_name,
            cm.contact_hint,
            cm.role::text,
            cm.status::text,
            cm.joined_at
          FROM circle_memberships cm
          JOIN circles c ON c.id = cm.circle_id
          WHERE cm.circle_id::text = $1
            AND cm.id::text = $2
          LIMIT 1
          FOR UPDATE OF cm
        `,
        [circleId, membershipId],
      );
      const target = targetResult.rows[0] ? membershipFromRow(targetResult.rows[0]) : null;
      if (!target) throw new StoreError(404, "Circle member not found");
      if (target.role === "owner") {
        throw new StoreError(400, "Owner membership cannot be changed from member management");
      }

      const nextRole = body.role == null ? target.role : normalizeMemberRole(body.role);
      const nextStatus = body.status == null ? target.status : normalizeMembershipStatus(body.status);
      const nextDisplayName = normalizeMemberDisplayName(body.displayName, target.displayName);
      const nextContactHint = normalizeMemberContactHint(body.contactHint, target.contactHint);

      if (target.profileId === profile.id && ["left", "removed"].includes(nextStatus)) {
        throw new StoreError(400, "You cannot remove your own active membership");
      }
      if (actorMembership.role !== "owner" && (target.role === "admin" || nextRole === "admin")) {
        throw new StoreError(403, "Only circle owners can manage admins");
      }

      const result = await client.query(
        `
          UPDATE circle_memberships
          SET role = $3::circle_role,
              status = $4::membership_status,
              display_name = $5,
              contact_hint = $6,
              joined_at = CASE
                WHEN $4::membership_status = 'active' THEN COALESCE(joined_at, now())
                ELSE joined_at
              END,
              removed_at = CASE
                WHEN $4::membership_status = 'removed' THEN now()
                WHEN $4::membership_status = 'active' THEN NULL
                ELSE removed_at
              END
          WHERE circle_id::text = $1
            AND id::text = $2
          RETURNING
            id::text,
            circle_id::text,
            $7::text AS circle_name,
            profile_id::text,
            display_name,
            contact_hint,
            role::text,
            status::text,
            joined_at
        `,
        [circleId, membershipId, nextRole, nextStatus, nextDisplayName, nextContactHint, target.circleName],
      );
      return membershipFromRow(result.rows[0]);
    });
  }

  async function getTaskPermissions(taskId, actor = {}) {
    const taskResult = await pool.query(
      `
        SELECT
          id::text,
          circle_id::text,
          created_by_profile_id::text,
          status::text
        FROM tasks
        WHERE id::text = $1
          AND archived_at IS NULL
        LIMIT 1
      `,
      [taskId],
    );
    const task = taskResult.rows[0];
    if (!task) return null;

    const profile = await resolveProfile(actor);
    if (!profile) throw new StoreError(401, "Profile authentication required");
    const membership = profile ? await getMembership(task.circle_id, profile.id) : null;
    if (!membership) throw new StoreError(403, "Circle membership required");
    const canManage =
      Boolean(profile) &&
      (task.created_by_profile_id === profile.id || ["owner", "admin"].includes(membership?.role));

    return {
      authenticated: Boolean(profile),
      profileId: profile?.id ?? null,
      circleId: task.circle_id,
      role: membership?.role ?? null,
      canRead: Boolean(membership),
      canComment: Boolean(membership) || task.status === "open",
      canRespond: task.status === "open",
      canManage,
      canAnnounce: canManage,
      canClose: canManage,
      canExport: canManage,
    };
  }

  async function hydrateTasks(taskRows) {
    if (taskRows.length === 0) return [];

    const taskIds = taskRows.map((task) => task.id);
    const [optionsResult, responsesResult, announcementsResult, commentsResult] = await Promise.all([
      pool.query(
        `
          SELECT
            id::text,
            task_id::text,
            title,
            subtitle,
            unit_price_cents,
            currency,
            max_quantity,
            metadata,
            sort_order
          FROM task_options
          WHERE task_id::text = ANY($1::text[])
            AND is_active = true
          ORDER BY sort_order ASC, created_at ASC
        `,
        [taskIds],
      ),
      pool.query(
        `
          SELECT
            id::text,
            task_id::text,
            participant_name,
            participant_contact,
            note,
            total_amount_cents,
            currency,
            payment_status::text,
            fulfillment_status::text,
            rsvp_status::text,
            guest_count,
            metadata,
            created_at,
            updated_at
          FROM responses
          WHERE task_id::text = ANY($1::text[])
            AND cancelled_at IS NULL
          ORDER BY created_at DESC
        `,
        [taskIds],
      ),
      pool.query(
        `
          SELECT
            a.id::text,
            a.circle_id::text,
            a.task_id::text,
            COALESCE(p.display_name, '') AS author_name,
            a.title,
            a.body,
            a.priority::text,
            a.requires_confirmation,
            a.pinned_at,
            a.published_at,
            a.created_at,
            a.updated_at
          FROM announcements a
          LEFT JOIN profiles p ON p.id = a.author_profile_id
          WHERE a.task_id::text = ANY($1::text[])
            AND a.deleted_at IS NULL
          ORDER BY a.published_at DESC, a.created_at DESC
        `,
        [taskIds],
      ),
      pool.query(
        `
          SELECT
            c.id::text,
            c.task_id::text,
            COALESCE(p.display_name, '') AS author_name,
            c.participant_name,
            c.body,
            c.metadata,
            c.created_at,
            c.updated_at
          FROM task_comments c
          LEFT JOIN profiles p ON p.id = c.author_profile_id
          WHERE c.task_id::text = ANY($1::text[])
            AND c.deleted_at IS NULL
          ORDER BY c.created_at ASC
        `,
        [taskIds],
      ),
    ]);

    const responseIds = responsesResult.rows.map((response) => response.id);
    const itemsResult =
      responseIds.length > 0
        ? await pool.query(
            `
              SELECT
                ri.id::text,
                ri.response_id::text,
                ri.option_id::text,
                ri.quantity,
                ri.unit_price_cents,
                ri.currency,
                ri.metadata,
                o.title,
                o.subtitle
              FROM response_items ri
              JOIN task_options o ON o.id = ri.option_id
              WHERE ri.response_id::text = ANY($1::text[])
              ORDER BY ri.created_at ASC
            `,
            [responseIds],
          )
        : { rows: [] };

    const optionsByTask = groupBy(optionsResult.rows, "task_id");
    const responsesByTask = groupBy(responsesResult.rows, "task_id");
    const itemsByResponse = groupBy(itemsResult.rows, "response_id");
    const announcementsByTask = groupBy(announcementsResult.rows, "task_id");
    const commentsByTask = groupBy(commentsResult.rows, "task_id");

    return taskRows.map((taskRow) => {
      const options = (optionsByTask.get(taskRow.id) ?? []).map(optionFromRow);
      const responses = (responsesByTask.get(taskRow.id) ?? []).map((response) =>
        responseFromRows(response, (itemsByResponse.get(response.id) ?? []).map(itemFromRow)),
      );
      const announcements = (announcementsByTask.get(taskRow.id) ?? []).map(announcementFromRow);
      const comments = (commentsByTask.get(taskRow.id) ?? []).map(commentFromRow);
      return taskFromRow(taskRow, options, responses, announcements, comments);
    });
  }

  async function listTasks(actor = null) {
    if (!actor) {
      const result = await pool.query(`${taskSelect} ORDER BY t.created_at DESC`);
      return hydrateTasks(result.rows);
    }

    const profile = await requireProfile(actor);
    const result = await pool.query(
      `
        ${taskSelect}
          AND EXISTS (
            SELECT 1
            FROM circle_memberships cm
            WHERE cm.circle_id = t.circle_id
              AND cm.profile_id::text = $1
              AND cm.status = 'active'
          )
        ORDER BY t.created_at DESC
      `,
      [profile.id],
    );
    return hydrateTasks(result.rows);
  }

  async function getTask(taskId, actor = null) {
    if (actor) await requireTaskReader(taskId, actor);
    const result = await pool.query(`${taskSelect} AND t.id::text = $1 LIMIT 1`, [taskId]);
    const tasks = await hydrateTasks(result.rows);
    return tasks[0] ?? null;
  }

  async function getTaskByShareToken(token) {
    const result = await pool.query(`${taskSelect} AND t.share_token = $1 LIMIT 1`, [token]);
    const tasks = await hydrateTasks(result.rows);
    return tasks[0] ?? null;
  }

  async function getBootstrap(actor = {}) {
    const profile = await resolveProfile(actor);
    const templatesResult = await pool.query(`
      SELECT id, display_name
      FROM task_templates
      WHERE is_active = true
      ORDER BY sort_order ASC
    `);

    if (!profile) {
      return {
        circles: [],
        tasks: [],
        templates: templatesResult.rows.map((template) => ({
          id: template.id,
          label: template.display_name,
        })),
      };
    }

    const [circlesResult, tasks] = await Promise.all([
      pool.query(
        `
        SELECT
          c.id::text,
          c.name,
          c.description,
          c.invite_code,
          (
            SELECT COUNT(active_cm.id)::int
            FROM circle_memberships active_cm
            WHERE active_cm.circle_id = c.id
              AND active_cm.status = 'active'
          ) AS member_count
        FROM circles c
        JOIN circle_memberships viewer_cm
          ON viewer_cm.circle_id = c.id
         AND viewer_cm.profile_id = $1
         AND viewer_cm.status = 'active'
        WHERE c.archived_at IS NULL
        ORDER BY c.created_at ASC
      `,
        [profile.id],
      ),
      listTasks({ profileId: profile.id }),
    ]);

    return {
      circles: circlesResult.rows.map(circleFromRow),
      tasks,
      templates: templatesResult.rows.map((template) => ({
        id: template.id,
        label: template.display_name,
      })),
    };
  }

  async function buildTaskCsv(taskId, actor = {}) {
    const task = await getTask(taskId);
    if (!task) return null;
    await requireTaskManager(taskId, actor);
    return { task, csv: buildCsv(task) };
  }

  async function createTask(body = {}) {
    const taskId = await withTransaction(async (client) => {
      const profile = await requireProfile(body.actor, client);
      const template = body.template || "group_buy";
      const templateResult = await client.query(
        `
          SELECT id, display_name
          FROM task_templates
          WHERE id = $1
            AND is_active = true
          LIMIT 1
        `,
        [template],
      );
      if (!templateResult.rows[0]) throw new StoreError(400, `Unsupported template: ${template}`);

      const circleResult = body.circleId
        ? await client.query(
            `
              SELECT c.id::text, c.owner_profile_id::text
              FROM circles c
              JOIN circle_memberships cm
                ON cm.circle_id = c.id
               AND cm.profile_id = $2
               AND cm.status = 'active'
               AND cm.role IN ('owner', 'admin')
              WHERE c.id::text = $1
                AND c.archived_at IS NULL
              LIMIT 1
            `,
            [body.circleId, profile.id],
          )
        : await client.query(
            `
              SELECT c.id::text, c.owner_profile_id::text
              FROM circles c
              JOIN circle_memberships cm
                ON cm.circle_id = c.id
               AND cm.profile_id = $1
               AND cm.status = 'active'
               AND cm.role IN ('owner', 'admin')
              WHERE c.archived_at IS NULL
              ORDER BY c.created_at ASC
              LIMIT 1
            `,
            [profile.id],
          );
      const circle = circleResult.rows[0];
      if (!circle) throw new StoreError(403, "Circle owner/admin role required");

      const metadata = body.metadata ?? {};
      const options =
        Array.isArray(body.options) && body.options.length > 0
          ? body.options
          : [{ title: "選項", subtitle: "", unitPrice: 0 }];

      const taskResult = await client.query(
        `
          INSERT INTO tasks (
            circle_id,
            template_id,
            created_by_profile_id,
            seller_display_name,
            title,
            description,
            status,
            deadline_at,
            share_token,
            payment_instructions,
            pickup_instructions,
            metadata,
            opened_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, $10, $11::jsonb, now())
          RETURNING id::text
        `,
        [
          circle.id,
          template,
          profile.id,
          body.sellerDisplayName || metadata.seller || null,
          body.title || `新的${templateLabels[template] ?? "事項"}`,
          body.description || "",
          body.deadlineAt || null,
          shareToken(),
          body.paymentInstructions || "",
          body.pickupInstructions || "",
          json(metadata),
        ],
      );
      const createdTaskId = taskResult.rows[0].id;

      for (const [index, option] of options.entries()) {
        const maxQuantity = option.maxQuantity == null ? null : positiveInteger(option.maxQuantity, null);
        await client.query(
          `
            INSERT INTO task_options (
              task_id,
              title,
              subtitle,
              unit_price_cents,
              currency,
              max_quantity,
              sort_order,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          `,
          [
            createdTaskId,
            option.title || "選項",
            option.subtitle || "",
            amountToCents(option.unitPrice),
            currency(option.currency),
            maxQuantity,
            index,
            json(option.metadata),
          ],
        );
      }

      return createdTaskId;
    });

    return getTask(taskId);
  }

  async function updateTaskDetails(taskId, body = {}) {
    const updatedTaskId = await withTransaction(async (client) => {
      await requireTaskManager(taskId, body.actor, client);
      const existingResult = await client.query(
        `
          SELECT
            id::text,
            title,
            description,
            deadline_at,
            payment_instructions,
            pickup_instructions,
            metadata
          FROM tasks
          WHERE id::text = $1
            AND archived_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [taskId],
      );
      const existing = existingResult.rows[0];
      if (!existing) return null;

      const nextTitle = body.title == null ? existing.title : String(body.title).trim();
      if (!nextTitle) throw new StoreError(400, "Task title is required");

      await client.query(
        `
          UPDATE tasks
          SET title = $1,
              description = $2,
              deadline_at = $3,
              payment_instructions = $4,
              pickup_instructions = $5,
              metadata = $6::jsonb,
              updated_at = now()
          WHERE id::text = $7
        `,
        [
          nextTitle,
          body.description == null ? existing.description : String(body.description),
          Object.hasOwn(body, "deadlineAt") ? body.deadlineAt || null : existing.deadline_at,
          body.paymentInstructions == null ? existing.payment_instructions : String(body.paymentInstructions),
          body.pickupInstructions == null ? existing.pickup_instructions : String(body.pickupInstructions),
          body.metadata === undefined ? json(parseJson(existing.metadata)) : json(body.metadata),
          existing.id,
        ],
      );

      const options = normalizeTaskOptions(body.options);
      if (options) {
        const existingOptionsResult = await client.query(
          `
            SELECT id::text, metadata
            FROM task_options
            WHERE task_id::text = $1
            FOR UPDATE
          `,
          [existing.id],
        );
        const existingById = new Map(existingOptionsResult.rows.map((option) => [option.id, option]));
        const activeOptionIds = [];

        for (const [index, option] of options.entries()) {
          const maxQuantity = option.maxQuantity == null ? null : positiveInteger(option.maxQuantity, null);
          if (option.id) {
            const existingOption = existingById.get(option.id);
            if (!existingOption) throw new StoreError(400, `Invalid option ${option.id}`);
            await client.query(
              `
                UPDATE task_options
                SET title = $1,
                    subtitle = $2,
                    unit_price_cents = $3,
                    currency = $4,
                    max_quantity = $5,
                    sort_order = $6,
                    metadata = $7::jsonb,
                    is_active = true,
                    updated_at = now()
                WHERE id::text = $8
                  AND task_id::text = $9
              `,
              [
                option.title,
                option.subtitle,
                amountToCents(option.unitPrice),
                currency(option.currency),
                maxQuantity,
                index,
                option.metadata === undefined ? json(parseJson(existingOption.metadata)) : json(option.metadata),
                option.id,
                existing.id,
              ],
            );
            activeOptionIds.push(option.id);
            continue;
          }

          const insertedOption = await client.query(
            `
              INSERT INTO task_options (
                task_id,
                title,
                subtitle,
                unit_price_cents,
                currency,
                max_quantity,
                sort_order,
                metadata
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
              RETURNING id::text
            `,
            [
              existing.id,
              option.title,
              option.subtitle,
              amountToCents(option.unitPrice),
              currency(option.currency),
              maxQuantity,
              index,
              json(option.metadata),
            ],
          );
          activeOptionIds.push(insertedOption.rows[0].id);
        }

        await client.query(
          `
            UPDATE task_options
            SET is_active = false,
                updated_at = now()
            WHERE task_id::text = $1
              AND NOT (id::text = ANY($2::text[]))
          `,
          [existing.id, activeOptionIds],
        );
      }

      return existing.id;
    });

    if (!updatedTaskId) return null;
    return getTask(updatedTaskId);
  }

  async function convertInterestCheck(taskId, body = {}) {
    await requireTaskManager(taskId, body.actor);
    const sourceTask = await getTask(taskId);
    if (!sourceTask) return null;
    if (sourceTask.template !== "interest_check") {
      throw new StoreError(409, "Only interest_check tasks can be converted");
    }

    const targetTemplate = body.targetTemplate || body.template || "activity";
    const conversion = buildInterestConversion({
      sourceTask,
      targetTemplate,
      overrides: {
        title: body.title,
        description: body.description,
        deadlineAt: body.deadlineAt,
        paymentInstructions: body.paymentInstructions,
        pickupInstructions: body.pickupInstructions,
        options: body.options,
        metadata: body.metadata,
      },
    });

    const createdTask = await createTask({ ...conversion.task, actor: body.actor });
    await createTaskComment(createdTask.id, {
      participantName: "系統",
      body: conversion.summaryText,
      metadata: { type: "interest_conversion", sourceTaskId: sourceTask.id },
    });

    const nextSourceMetadata = {
      ...sourceTask.metadata,
      convertedTo: [
        ...(Array.isArray(sourceTask.metadata.convertedTo) ? sourceTask.metadata.convertedTo : []),
        {
          taskId: createdTask.id,
          template: targetTemplate,
          title: createdTask.title,
          convertedAt: conversion.sourceReference.convertedAt,
        },
      ],
    };

    await pool.query(
      `
        UPDATE tasks
        SET metadata = $1::jsonb,
            updated_at = now()
        WHERE id::text = $2
          AND archived_at IS NULL
      `,
      [json(nextSourceMetadata), sourceTask.id],
    );

    return {
      sourceTask: await getTask(sourceTask.id),
      task: await getTask(createdTask.id),
    };
  }

  async function createShareResponse(token, body = {}) {
    const taskId = await withTransaction(async (client) => {
      const taskResult = await client.query(
        `
          SELECT id::text, template_id, status::text
          FROM tasks
          WHERE share_token = $1
            AND archived_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [token],
      );
      const task = taskResult.rows[0];
      if (!task) throw new StoreError(404, "Share link not found");
      if (task.status !== "open") throw new StoreError(409, "Task is not open");

      const requestedItems = new Map();
      for (const item of Array.isArray(body.items) ? body.items : []) {
        const quantity = positiveInteger(item.quantity, 0);
        if (quantity <= 0) continue;
        const current = requestedItems.get(item.optionId) ?? { quantity: 0, metadata: item.metadata };
        current.quantity += quantity;
        requestedItems.set(item.optionId, current);
      }

      if (!body.participantName || requestedItems.size === 0) {
        throw new StoreError(400, "participantName and at least one item are required");
      }

      const optionIds = Array.from(requestedItems.keys());
      const optionsResult = await client.query(
        `
          SELECT id::text, unit_price_cents, currency
          FROM task_options
          WHERE task_id = $1
            AND id::text = ANY($2::text[])
            AND is_active = true
          FOR SHARE
        `,
        [task.id, optionIds],
      );
      const optionsById = new Map(optionsResult.rows.map((option) => [option.id, option]));
      for (const optionId of optionIds) {
        if (!optionsById.has(optionId)) throw new StoreError(400, `Invalid option ${optionId}`);
      }

      let totalAmountCents = 0;
      for (const optionId of optionIds) {
        const option = optionsById.get(optionId);
        const item = requestedItems.get(optionId);
        totalAmountCents += Number(option.unit_price_cents || 0) * item.quantity;
      }

      const responseResult = await client.query(
        `
          INSERT INTO responses (
            task_id,
            participant_name,
            participant_contact,
            note,
            total_amount_cents,
            currency,
            payment_status,
            fulfillment_status,
            rsvp_status,
            guest_count,
            metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'TWD',
            $6::payment_status,
            $7::fulfillment_status,
            $8::rsvp_status,
            $9,
            $10::jsonb
          )
          RETURNING id::text
        `,
        [
          task.id,
          body.participantName,
          body.participantContact || "",
          body.note || "",
          totalAmountCents,
          totalAmountCents > 0 ? "unpaid" : "not_required",
          task.template_id === "activity" ? "attending" : "pending",
          body.rsvpStatus || "yes",
          positiveInteger(body.guestCount, 0),
          json(body.metadata),
        ],
      );
      const responseId = responseResult.rows[0].id;

      for (const optionId of optionIds) {
        const option = optionsById.get(optionId);
        const item = requestedItems.get(optionId);
        await client.query(
          `
            INSERT INTO response_items (
              response_id,
              option_id,
              quantity,
              unit_price_cents,
              currency,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          `,
          [
            responseId,
            option.id,
            item.quantity,
            option.unit_price_cents,
            currency(option.currency),
            json(item.metadata),
          ],
        );
      }

      return task.id;
    });

    return getTask(taskId);
  }

  async function updateResponse(responseId, patch = {}) {
    const taskId = await withTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT id::text, task_id::text, payment_status::text, fulfillment_status::text, note
          FROM responses
          WHERE id::text = $1
            AND cancelled_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [responseId],
      );
      const existing = existingResult.rows[0];
      if (!existing) return null;
      await requireTaskManager(existing.task_id, patch.actor, client);

      const nextPaymentStatus = patch.paymentStatus ?? existing.payment_status;
      const nextFulfillmentStatus = patch.fulfillmentStatus ?? existing.fulfillment_status;
      if (!paymentStatuses.has(nextPaymentStatus)) throw new StoreError(400, `Invalid paymentStatus: ${nextPaymentStatus}`);
      if (!fulfillmentStatuses.has(nextFulfillmentStatus)) {
        throw new StoreError(400, `Invalid fulfillmentStatus: ${nextFulfillmentStatus}`);
      }

      await client.query(
        `
          UPDATE responses
          SET payment_status = $1::payment_status,
              fulfillment_status = $2::fulfillment_status,
              note = $3,
              updated_at = now()
          WHERE id = $4
        `,
        [nextPaymentStatus, nextFulfillmentStatus, patch.note ?? existing.note, existing.id],
      );

      return existing.task_id;
    });

    if (!taskId) return null;
    return getTask(taskId);
  }

  async function updateTaskStatus(taskId, status = "open", actor = {}) {
    if (!taskStatuses.has(status)) throw new StoreError(400, `Invalid task status: ${status}`);

    const updatedTaskId = await withTransaction(async (client) => {
      await requireTaskManager(taskId, actor, client);
      const result = await client.query(
        `
          UPDATE tasks
          SET status = $1::task_status,
              opened_at = CASE
                WHEN $1 = 'open' THEN COALESCE(opened_at, now())
                ELSE opened_at
              END,
              closed_at = CASE
                WHEN $1 = 'open' THEN NULL
                WHEN $1 IN ('closed', 'completed', 'cancelled') THEN now()
                ELSE closed_at
              END,
              updated_at = now()
          WHERE id::text = $2
            AND archived_at IS NULL
          RETURNING id::text
        `,
        [status, taskId],
      );

      return result.rows[0]?.id ?? null;
    });

    if (!updatedTaskId) return null;
    return getTask(updatedTaskId);
  }

  async function createTaskAnnouncement(taskId, body = {}) {
    const priority = body.priority || "normal";
    if (!announcementPriorities.has(priority)) throw new StoreError(400, `Invalid announcement priority: ${priority}`);
    if (!body.body) throw new StoreError(400, "Announcement body is required");

    const updatedTaskId = await withTransaction(async (client) => {
      const { profile, task: managedTask } = await requireTaskManager(taskId, body.actor, client);
      const taskResult = await client.query(
        `
          SELECT id::text, circle_id::text, created_by_profile_id::text, title
          FROM tasks
          WHERE id::text = $1
            AND archived_at IS NULL
          LIMIT 1
        `,
        [taskId],
      );
      const task = taskResult.rows[0];
      if (!task) return null;
      const authorProfileId = profile.id;

      const announcementResult = await client.query(
        `
          INSERT INTO announcements (
            circle_id,
            task_id,
            author_profile_id,
            title,
            body,
            priority,
            requires_confirmation,
            pinned_at,
            published_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::announcement_priority, $7, $8, now())
          RETURNING id::text
        `,
        [
          task.circle_id,
          managedTask.id,
          authorProfileId,
          body.title || "事項公告",
          body.body,
          priority,
          Boolean(body.requiresConfirmation),
          body.pinnedAt || null,
        ],
      );
      const announcementId = announcementResult.rows[0].id;
      const conversationResult = await client.query(
        `
          SELECT
            id::text,
            circle_id::text,
            task_id::text,
            type::text,
            title,
            metadata,
            created_at,
            updated_at
          FROM conversations
          WHERE circle_id::text = $1
            AND task_id::text = $2
            AND type = 'task'
            AND archived_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [task.circle_id, managedTask.id],
      );
      let conversationId = conversationResult.rows[0]?.id;
      if (!conversationId) {
        const createdConversation = await client.query(
          `
            INSERT INTO conversations (
              circle_id,
              task_id,
              type,
              title,
              metadata
            )
            VALUES ($1, $2, 'task', $3, $4::jsonb)
            RETURNING id::text
          `,
          [task.circle_id, managedTask.id, `${task.title} 討論`, json({ source: "task_announcement" })],
        );
        conversationId = createdConversation.rows[0].id;
      }

      await client.query(
        `
          INSERT INTO messages (
            conversation_id,
            author_profile_id,
            body,
            metadata
          )
          VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          conversationId,
          authorProfileId,
          `${body.title || "事項公告"}：${body.body}`,
          json({ source: "announcement", announcementId }),
        ],
      );
      await client.query("UPDATE conversations SET updated_at = now() WHERE id::text = $1", [conversationId]);

      await client.query(
        `
          INSERT INTO announcement_receipts (announcement_id, profile_id)
          SELECT $1::uuid, cm.profile_id
          FROM circle_memberships cm
          WHERE cm.circle_id = $2::uuid
            AND cm.status = 'active'
            AND cm.profile_id IS NOT NULL
          ON CONFLICT (announcement_id, profile_id) DO NOTHING
        `,
        [announcementId, task.circle_id],
      );

      await client.query(
        `
          INSERT INTO notifications (
            recipient_profile_id,
            actor_profile_id,
            circle_id,
            task_id,
            announcement_id,
            type,
            title,
            body,
            data
          )
          SELECT
            cm.profile_id,
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            'announcement',
            $5,
            $6,
            $7::jsonb
          FROM circle_memberships cm
          WHERE cm.circle_id = $2::uuid
            AND cm.status = 'active'
            AND cm.profile_id IS NOT NULL
            AND cm.profile_id <> $1::uuid
        `,
        [
          authorProfileId,
          task.circle_id,
          managedTask.id,
          announcementId,
          body.title || "事項公告",
          body.body.slice(0, 160),
          json({ taskId: managedTask.id, conversationId }),
        ],
      );

      return task.id;
    });

    if (!updatedTaskId) return null;
    return getTask(updatedTaskId);
  }

  async function createTaskComment(taskId, body = {}) {
    if (!body.body) throw new StoreError(400, "Comment body is required");

    const updatedTaskId = await withTransaction(async (client) => {
      const taskResult = await client.query(
        `
          SELECT id::text, circle_id::text
          FROM tasks
          WHERE id::text = $1
            AND archived_at IS NULL
          LIMIT 1
        `,
        [taskId],
      );
      const task = taskResult.rows[0];
      if (!task) return null;
      let authorProfileId = null;
      let participantName = body.participantName || body.authorName || "成員";
      if (hasActor(body.actor)) {
        const { profile } = await requireCircleMember(task.circle_id, body.actor, { client });
        authorProfileId = profile.id;
        participantName = profile.displayName;
      }

      await client.query(
        `
          INSERT INTO task_comments (
            task_id,
            author_profile_id,
            participant_name,
            body,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [task.id, authorProfileId, participantName, body.body, json(body.metadata)],
      );

      return task.id;
    });

    if (!updatedTaskId) return null;
    return getTask(updatedTaskId);
  }

  async function conversationAccess(conversationId, actor = {}, client = pool) {
    const conversationResult = await client.query(
      `
        SELECT
          id::text,
          circle_id::text,
          task_id::text,
          type::text,
          title,
          metadata,
          created_at,
          updated_at
        FROM conversations
        WHERE id::text = $1
          AND archived_at IS NULL
        LIMIT 1
      `,
      [conversationId],
    );
    const conversation = conversationResult.rows[0];
    if (!conversation) throw new StoreError(404, "Conversation not found");
    const access = await requireCircleMember(conversation.circle_id, actor, { client });
    return { conversation, ...access };
  }

  async function listConversations(circleId, { taskId = null, actor = {} } = {}) {
    await requireCircleMember(circleId, actor);
    const params = [circleId];
    let filter = "";
    if (taskId) {
      params.push(taskId);
      filter = "AND task_id::text = $2";
    }

    const result = await pool.query(
      `
        SELECT
          id::text,
          circle_id::text,
          task_id::text,
          type::text,
          title,
          metadata,
          created_at,
          updated_at
        FROM conversations
        WHERE circle_id::text = $1
          ${filter}
          AND archived_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
      `,
      params,
    );

    return result.rows.map(conversationFromRow);
  }

  async function createConversation(circleId, body = {}) {
    const { membership } = await requireCircleMember(circleId, body.actor);
    const type = body.type || (body.taskId ? "task" : "circle");
    if (!["circle", "task", "support"].includes(type)) throw new StoreError(400, `Invalid conversation type: ${type}`);

    if (body.taskId) {
      const taskResult = await pool.query(
        `
          SELECT id::text
          FROM tasks
          WHERE id::text = $1
            AND circle_id::text = $2
            AND archived_at IS NULL
          LIMIT 1
        `,
        [body.taskId, circleId],
      );
      if (!taskResult.rows[0]) throw new StoreError(400, "Task does not belong to circle");

      if (type === "task") {
        const existingResult = await pool.query(
          `
            SELECT
              id::text,
              circle_id::text,
              task_id::text,
              type::text,
              title,
              metadata,
              created_at,
              updated_at
            FROM conversations
            WHERE circle_id::text = $1
              AND task_id::text = $2
              AND type = 'task'
              AND archived_at IS NULL
            ORDER BY created_at ASC
            LIMIT 1
          `,
          [circleId, body.taskId],
        );
        if (existingResult.rows[0]) return conversationFromRow(existingResult.rows[0]);
      }
    }

    const result = await pool.query(
      `
        INSERT INTO conversations (
          circle_id,
          task_id,
          type,
          title,
          metadata
        )
        VALUES ($1, $2, $3::conversation_type, $4, $5::jsonb)
        RETURNING
          id::text,
          circle_id::text,
          task_id::text,
          type::text,
          title,
          metadata,
          created_at,
          updated_at
      `,
      [
        circleId,
        body.taskId || null,
        type,
        body.title || (type === "task" ? "事項討論" : "圈內聊天"),
        json({ ...(body.metadata ?? {}), createdByMembershipId: membership.id }),
      ],
    );

    return conversationFromRow(result.rows[0]);
  }

  async function listConversationMessages(conversationId, { actor = {}, limit = 50 } = {}) {
    await conversationAccess(conversationId, actor);
    const result = await pool.query(
      `
        SELECT
          m.id::text,
          m.conversation_id::text,
          m.author_profile_id::text,
          COALESCE(p.display_name, '') AS author_name,
          m.body,
          m.metadata,
          m.created_at,
          m.edited_at,
          m.deleted_at
        FROM messages m
        LEFT JOIN profiles p ON p.id = m.author_profile_id
        WHERE m.conversation_id::text = $1
          AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT $2
      `,
      [conversationId, Math.min(100, positiveInteger(limit, 50))],
    );

    return result.rows.map(messageFromRow).reverse();
  }

  async function createConversationMessage(conversationId, body = {}) {
    if (!body.body) throw new StoreError(400, "Message body is required");

    return withTransaction(async (client) => {
      const { conversation, profile } = await conversationAccess(conversationId, body.actor, client);
      const messageResult = await client.query(
        `
          INSERT INTO messages (
            conversation_id,
            author_profile_id,
            body,
            metadata
          )
          VALUES ($1, $2, $3, $4::jsonb)
          RETURNING
            id::text,
            conversation_id::text,
            author_profile_id::text,
            $5::text AS author_name,
            body,
            metadata,
            created_at,
            edited_at,
            deleted_at
        `,
        [conversation.id, profile.id, body.body, json(body.metadata), profile.displayName],
      );
      const message = messageFromRow(messageResult.rows[0]);

      await client.query("UPDATE conversations SET updated_at = now() WHERE id::text = $1", [conversation.id]);
      await client.query(
        `
          INSERT INTO notifications (
            recipient_profile_id,
            actor_profile_id,
            circle_id,
            task_id,
            message_id,
            type,
            title,
            body,
            data
          )
          SELECT
            cm.profile_id,
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            'message',
            $5,
            $6,
            $7::jsonb
          FROM circle_memberships cm
          WHERE cm.circle_id = $2::uuid
            AND cm.status = 'active'
            AND cm.profile_id IS NOT NULL
            AND cm.profile_id <> $1::uuid
        `,
        [
          profile.id,
          conversation.circle_id,
          conversation.task_id,
          message.id,
          conversation.title || "圈內新訊息",
          body.body.slice(0, 160),
          json({ conversationId: conversation.id }),
        ],
      );

      return { conversation: conversationFromRow(conversation), message };
    });
  }

  async function markMessageRead(messageId, body = {}) {
    const messageResult = await pool.query(
      `
        SELECT
          m.id::text,
          c.circle_id::text
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id::text = $1
          AND m.deleted_at IS NULL
          AND c.archived_at IS NULL
        LIMIT 1
      `,
      [messageId],
    );
    const message = messageResult.rows[0];
    if (!message) throw new StoreError(404, "Message not found");

    const { profile } = await requireCircleMember(message.circle_id, body.actor);
    const result = await pool.query(
      `
        INSERT INTO message_reads (message_id, profile_id, read_at)
        VALUES ($1, $2, now())
        ON CONFLICT (message_id, profile_id)
        DO UPDATE SET read_at = EXCLUDED.read_at
        RETURNING id::text, message_id::text, profile_id::text, read_at
      `,
      [messageId, profile.id],
    );

    return {
      id: result.rows[0].id,
      messageId: result.rows[0].message_id,
      profileId: result.rows[0].profile_id,
      readAt: toIso(result.rows[0].read_at),
    };
  }

  async function registerDevice(body = {}) {
    const profile = await requireProfile(body.actor);
    if (!body.pushToken) throw new StoreError(400, "pushToken is required");
    const platform = body.platform || "unknown";
    if (!["ios", "android", "web", "unknown"].includes(platform)) {
      throw new StoreError(400, `Invalid device platform: ${platform}`);
    }

    const result = await pool.query(
      `
        INSERT INTO devices (
          profile_id,
          platform,
          push_token,
          app_version,
          device_name,
          locale,
          timezone,
          last_seen_at
        )
        VALUES ($1, $2::device_platform, $3, $4, $5, $6, $7, now())
        ON CONFLICT (push_token)
        DO UPDATE SET
          profile_id = EXCLUDED.profile_id,
          platform = EXCLUDED.platform,
          app_version = EXCLUDED.app_version,
          device_name = EXCLUDED.device_name,
          locale = EXCLUDED.locale,
          timezone = EXCLUDED.timezone,
          last_seen_at = now(),
          revoked_at = NULL
        RETURNING
          id::text,
          profile_id::text,
          platform::text,
          push_token,
          app_version,
          device_name,
          locale,
          timezone,
          last_seen_at,
          created_at
      `,
      [
        profile.id,
        platform,
        body.pushToken,
        body.appVersion || null,
        body.deviceName || null,
        body.locale || profile.locale,
        body.timezone || profile.timezone,
      ],
    );

    return deviceFromRow(result.rows[0]);
  }

  async function listNotifications(actor = {}) {
    const profile = await requireProfile(actor);
    const result = await pool.query(
      `
        SELECT
          id::text,
          recipient_profile_id::text,
          actor_profile_id::text,
          circle_id::text,
          task_id::text,
          announcement_id::text,
          message_id::text,
          type,
          title,
          body,
          status::text,
          data,
          created_at,
          read_at
        FROM notifications
        WHERE recipient_profile_id::text = $1
          AND cancelled_at IS NULL
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [profile.id],
    );

    return result.rows.map(notificationFromRow);
  }

  async function markNotificationRead(notificationId, actor = {}) {
    const profile = await requireProfile(actor);
    const result = await pool.query(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, now()),
            status = CASE
              WHEN status = 'queued' THEN 'read'::notification_status
              ELSE status
            END
        WHERE id::text = $1
          AND recipient_profile_id::text = $2
          AND cancelled_at IS NULL
        RETURNING
          id::text,
          recipient_profile_id::text,
          actor_profile_id::text,
          circle_id::text,
          task_id::text,
          announcement_id::text,
          message_id::text,
          type,
          title,
          body,
          status::text,
          data,
          created_at,
          read_at
      `,
      [notificationId, profile.id],
    );

    return result.rows[0] ? notificationFromRow(result.rows[0]) : null;
  }

  return {
    backend: "postgres",
    connectionString: maskConnectionString(connectionString),
    health,
    getSessionContext,
    updateProfile,
    createCircle,
    updateCircle,
    listCircleMembers,
    getCircleInvite,
    listCircleInvites,
    createCircleInvite,
    revokeCircleInvite,
    acceptCircleInvite,
    updateCircleMember,
    getTaskPermissions,
    createOAuthState,
    consumeOAuthState,
    upsertAuthIdentity,
    createAuthSession,
    createAuthSessionForEmail,
    revokeAuthSession,
    getBootstrap,
    getTask,
    getTaskByShareToken,
    createTask,
    updateTaskDetails,
    convertInterestCheck,
    createShareResponse,
    updateResponse,
    updateTaskStatus,
    createTaskAnnouncement,
    createTaskComment,
    listConversations,
    createConversation,
    listConversationMessages,
    createConversationMessage,
    markMessageRead,
    registerDevice,
    listNotifications,
    markNotificationRead,
    buildTaskCsv,
    close: () => pool.end(),
  };
}
