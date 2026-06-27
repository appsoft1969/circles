import pg from "pg";

const { Pool } = pg;

const defaultDatabaseUrl = "postgres://incircle:incircle_local_password@127.0.0.1:5434/incircle_local";
const roleRank = new Map([
  ["guest", 1],
  ["member", 2],
  ["admin", 3],
  ["owner", 4],
]);

function parseArgs(argv) {
  const args = {
    email: process.env.TARGET_PROFILE_EMAIL || "",
    fromEmail: process.env.SOURCE_PROFILE_EMAIL || "kevin@example.com",
    dryRun: false,
    transferOwner: process.env.TRANSFER_OWNER_PROFILE !== "0",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--email") args.email = argv[++index] || "";
    else if (arg === "--from-email") args.fromEmail = argv[++index] || "";
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-transfer-owner") args.transferOwner = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  args.email = args.email.trim().toLowerCase();
  args.fromEmail = args.fromEmail.trim().toLowerCase();
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run membership:grant -- --email appsoft.1969@gmail.com
  npm run membership:grant -- --email appsoft.1969@gmail.com --from-email kevin@example.com

Options:
  --email <email>       Existing target profile email to grant access to.
  --from-email <email>  Existing source profile whose active circle roles are cloned.
  --dry-run            Print the planned changes without writing.
  --no-transfer-owner  Do not update circles.owner_profile_id when cloning owner roles.
`);
}

function betterRole(currentRole, incomingRole) {
  return (roleRank.get(incomingRole) || 0) > (roleRank.get(currentRole) || 0)
    ? incomingRole
    : currentRole;
}

async function findProfile(client, email) {
  const result = await client.query(
    `
      SELECT
        id::text,
        display_name,
        email
      FROM profiles
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
        AND status = 'active'
      LIMIT 1
    `,
    [email],
  );
  return result.rows[0] || null;
}

async function sourceMemberships(client, sourceProfileId) {
  const result = await client.query(
    `
      SELECT
        cm.id::text,
        cm.circle_id::text,
        c.name AS circle_name,
        c.owner_profile_id::text,
        cm.role::text,
        cm.status::text
      FROM circle_memberships cm
      JOIN circles c ON c.id = cm.circle_id
      WHERE cm.profile_id::text = $1
        AND cm.status = 'active'
        AND c.archived_at IS NULL
      ORDER BY c.created_at ASC, c.name ASC
    `,
    [sourceProfileId],
  );
  return result.rows;
}

async function grantMembership(client, { targetProfile, sourceProfile, membership, transferOwner }) {
  const existing = await client.query(
    `
      SELECT id::text, role::text, status::text
      FROM circle_memberships
      WHERE circle_id::text = $1
        AND profile_id::text = $2
      LIMIT 1
    `,
    [membership.circle_id, targetProfile.id],
  );

  const existingRow = existing.rows[0];
  const role = existingRow ? betterRole(existingRow.role, membership.role) : membership.role;
  const contactHint = membership.role === "owner" ? `由 ${sourceProfile.email} 移交圈主管理` : `由 ${sourceProfile.email} 授權加入`;

  if (existingRow) {
    await client.query(
      `
        UPDATE circle_memberships
        SET role = $3::circle_role,
            status = 'active',
            display_name = $4,
            contact_hint = $5,
            joined_at = COALESCE(joined_at, now()),
            removed_at = NULL,
            updated_at = now()
        WHERE id::text = $1
          AND profile_id::text = $2
      `,
      [existingRow.id, targetProfile.id, role, targetProfile.display_name, contactHint],
    );
  } else {
    await client.query(
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
      `,
      [
        membership.circle_id,
        targetProfile.id,
        targetProfile.display_name,
        contactHint,
        role,
        sourceProfile.id,
      ],
    );
  }

  if (transferOwner && membership.role === "owner" && membership.owner_profile_id === sourceProfile.id) {
    await client.query(
      `
        UPDATE circles
        SET owner_profile_id = $2,
            updated_at = now()
        WHERE id::text = $1
          AND owner_profile_id::text = $3
      `,
      [membership.circle_id, targetProfile.id, sourceProfile.id],
    );
  }

  return {
    circleId: membership.circle_id,
    circleName: membership.circle_name,
    role,
    existed: Boolean(existingRow),
    transferredOwner: Boolean(transferOwner && membership.role === "owner" && membership.owner_profile_id === sourceProfile.id),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.email) throw new Error("--email is required");
  if (!args.fromEmail) throw new Error("--from-email is required");
  if (args.email === args.fromEmail) throw new Error("--email and --from-email must be different");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL || defaultDatabaseUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const targetProfile = await findProfile(client, args.email);
    const sourceProfile = await findProfile(client, args.fromEmail);
    if (!targetProfile) throw new Error(`Target profile not found: ${args.email}`);
    if (!sourceProfile) throw new Error(`Source profile not found: ${args.fromEmail}`);

    const memberships = await sourceMemberships(client, sourceProfile.id);
    if (memberships.length === 0) throw new Error(`Source profile has no active circle memberships: ${args.fromEmail}`);

    const planned = memberships.map((membership) => ({
      circleId: membership.circle_id,
      circleName: membership.circle_name,
      role: membership.role,
      transferOwner: args.transferOwner && membership.role === "owner" && membership.owner_profile_id === sourceProfile.id,
    }));

    if (args.dryRun) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ ok: true, dryRun: true, targetProfile, sourceProfile, planned }, null, 2));
      return;
    }

    const granted = [];
    for (const membership of memberships) {
      granted.push(await grantMembership(client, {
        targetProfile,
        sourceProfile,
        membership,
        transferOwner: args.transferOwner,
      }));
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({
      ok: true,
      targetEmail: targetProfile.email,
      sourceEmail: sourceProfile.email,
      grantedCount: granted.length,
      transferredOwnerCount: granted.filter((item) => item.transferredOwner).length,
      granted,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
