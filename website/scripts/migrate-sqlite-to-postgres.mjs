import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteDir = dirname(__dirname);
const sqlitePath = process.env.SQLITE_DB_PATH || join(websiteDir, "data", "circles.sqlite");
const connectionString =
  process.env.DATABASE_URL || "postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local";

function log(message) {
  console.log(`[sqlite-to-postgres] ${message}`);
}

function uuidFor(scope, id) {
  const bytes = createHash("sha256").update(`incircle:${scope}:${id}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function cents(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function optionalDate(value) {
  return value || null;
}

function rows(db, table) {
  return db.prepare(`SELECT * FROM ${table}`).all();
}

function byId(records) {
  return new Map(records.map((record) => [record.id, record]));
}

async function main() {
  if (!existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`);
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  const users = rows(sqlite, "users");
  const circles = rows(sqlite, "circles");
  const members = rows(sqlite, "circle_members");
  const tasks = rows(sqlite, "tasks");
  const options = rows(sqlite, "task_options");
  const responses = rows(sqlite, "responses");
  const responseItems = rows(sqlite, "response_items");
  const announcements = rows(sqlite, "announcements");
  const comments = rows(sqlite, "task_comments");

  const usersById = byId(users);
  const circlesById = byId(circles);
  const profilesByName = new Map(users.map((user) => [user.display_name, uuidFor("user", user.id)]));

  try {
    await client.query("BEGIN");
    await client.query(`
      TRUNCATE TABLE
        notification_deliveries,
        notifications,
        message_reads,
        messages,
        conversations,
        task_comments,
        announcement_receipts,
        announcements,
        payment_records,
        response_items,
        responses,
        task_options,
        tasks,
        attachments,
        circle_invites,
        circle_memberships,
        devices,
        circles,
        profiles,
        audit_events
      RESTART IDENTITY CASCADE
    `);

    for (const user of users) {
      await client.query(
        `
          INSERT INTO profiles (
            id,
            display_name,
            email,
            locale,
            timezone,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, 'zh-TW', 'Asia/Taipei', $4::jsonb, $5, $5)
        `,
        [
          uuidFor("user", user.id),
          user.display_name,
          user.email || null,
          json({ migratedFrom: "sqlite", sqliteId: user.id }),
          user.created_at,
        ],
      );
    }

    for (const circle of circles) {
      await client.query(
        `
          INSERT INTO circles (
            id,
            owner_profile_id,
            name,
            description,
            visibility,
            invite_code,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'invite_link', $5, $6::jsonb, $7, $7)
        `,
        [
          uuidFor("circle", circle.id),
          uuidFor("user", circle.owner_user_id),
          circle.name,
          circle.description || "",
          circle.invite_code,
          json({ migratedFrom: "sqlite", sqliteId: circle.id }),
          circle.created_at,
        ],
      );
    }

    for (const member of members) {
      const circle = circlesById.get(member.circle_id);
      const profileId = profilesByName.get(member.display_name) ?? null;
      const isOwner = profileId && circle && profileId === uuidFor("user", circle.owner_user_id);
      const isAdmin = member.contact_hint?.includes("可發起") || member.contact_hint?.includes("窗口");
      await client.query(
        `
          INSERT INTO circle_memberships (
            id,
            circle_id,
            profile_id,
            display_name,
            contact_hint,
            role,
            status,
            invited_by_profile_id,
            joined_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::circle_role, 'active', $7, $8, $8, $8)
        `,
        [
          uuidFor("circle_member", member.id),
          uuidFor("circle", member.circle_id),
          profileId,
          member.display_name,
          member.contact_hint || "",
          isOwner ? "owner" : isAdmin ? "admin" : "member",
          circle ? uuidFor("user", circle.owner_user_id) : null,
          member.created_at,
        ],
      );
    }

    for (const task of tasks) {
      const circle = circlesById.get(task.circle_id);
      const metadata = parseJson(task.metadata_json);
      await client.query(
        `
          INSERT INTO tasks (
            id,
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
            created_at,
            updated_at,
            opened_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::task_status,
            $9,
            $10,
            $11,
            $12,
            $13::jsonb,
            $14,
            $15,
            $14
          )
        `,
        [
          uuidFor("task", task.id),
          uuidFor("circle", task.circle_id),
          task.template,
          circle ? uuidFor("user", circle.owner_user_id) : null,
          metadata.seller || null,
          task.title,
          task.description || "",
          task.status || "open",
          optionalDate(task.deadline_at),
          task.share_token,
          task.payment_instructions || "",
          task.pickup_instructions || "",
          json(metadata),
          task.created_at,
          task.updated_at,
        ],
      );
    }

    for (const option of options) {
      const metadata = parseJson(option.metadata_json);
      const maxQuantity = Number.isFinite(Number(metadata.inventory)) ? Number(metadata.inventory) : null;
      await client.query(
        `
          INSERT INTO task_options (
            id,
            task_id,
            title,
            subtitle,
            unit_price_cents,
            currency,
            max_quantity,
            sort_order,
            is_active,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'TWD', $6, $7, $8, $9::jsonb, now(), now())
        `,
        [
          uuidFor("task_option", option.id),
          uuidFor("task", option.task_id),
          option.title,
          option.subtitle || "",
          cents(option.unit_price),
          maxQuantity,
          option.sort_order || 0,
          option.is_active !== 0,
          json(metadata),
        ],
      );
    }

    for (const response of responses) {
      await client.query(
        `
          INSERT INTO responses (
            id,
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
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'TWD', $7::payment_status, $8::fulfillment_status, $9::rsvp_status, $10, $11::jsonb, $12, $13)
        `,
        [
          uuidFor("response", response.id),
          uuidFor("task", response.task_id),
          response.participant_name,
          response.participant_contact || "",
          response.note || "",
          cents(response.total_amount),
          response.payment_status || "unpaid",
          response.fulfillment_status || "pending",
          response.rsvp_status || "yes",
          Number(response.guest_count || 0),
          json(parseJson(response.metadata_json)),
          response.created_at,
          response.updated_at,
        ],
      );
    }

    for (const item of responseItems) {
      await client.query(
        `
          INSERT INTO response_items (
            id,
            response_id,
            option_id,
            quantity,
            unit_price_cents,
            currency,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'TWD', $6::jsonb, now())
        `,
        [
          uuidFor("response_item", item.id),
          uuidFor("response", item.response_id),
          uuidFor("task_option", item.option_id),
          Number(item.quantity || 1),
          cents(item.unit_price),
          json(parseJson(item.metadata_json)),
        ],
      );
    }

    for (const announcement of announcements) {
      await client.query(
        `
          INSERT INTO announcements (
            id,
            circle_id,
            task_id,
            author_profile_id,
            title,
            body,
            priority,
            requires_confirmation,
            pinned_at,
            published_at,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::announcement_priority, $8, $9, $10, $11, $12, $13)
        `,
        [
          uuidFor("announcement", announcement.id),
          uuidFor("circle", announcement.circle_id),
          uuidFor("task", announcement.task_id),
          profilesByName.get(announcement.author_name) ?? null,
          announcement.title,
          announcement.body || "",
          announcement.priority || "normal",
          Boolean(announcement.requires_confirmation),
          optionalDate(announcement.pinned_at),
          announcement.published_at,
          announcement.created_at,
          announcement.updated_at,
          optionalDate(announcement.deleted_at),
        ],
      );
    }

    for (const comment of comments) {
      await client.query(
        `
          INSERT INTO task_comments (
            id,
            task_id,
            author_profile_id,
            participant_name,
            body,
            metadata,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
        `,
        [
          uuidFor("task_comment", comment.id),
          uuidFor("task", comment.task_id),
          profilesByName.get(comment.author_name) ?? null,
          comment.participant_name || null,
          comment.body,
          json(parseJson(comment.metadata_json)),
          comment.created_at,
          comment.updated_at,
          optionalDate(comment.deleted_at),
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }

  log(`migrated ${users.length} users`);
  log(`migrated ${circles.length} circles and ${members.length} memberships`);
  log(`migrated ${tasks.length} tasks, ${options.length} options, ${responses.length} responses, ${responseItems.length} response items`);
  log(`migrated ${announcements.length} announcements and ${comments.length} comments`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
