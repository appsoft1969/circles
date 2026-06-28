-- Direct in-app invitations for existing InCircle accounts.
-- Invite links still exist; this table supports exact-account invitations only.

CREATE TABLE IF NOT EXISTS circle_member_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  invited_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  role circle_role NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending',
  message text NOT NULL DEFAULT '',
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS ix_circle_member_invitations_invited_status
  ON circle_member_invitations (invited_profile_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_circle_member_invitations_circle_status
  ON circle_member_invitations (circle_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_circle_member_invitations_pending
  ON circle_member_invitations (circle_id, invited_profile_id)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_circle_member_invitations_updated_at ON circle_member_invitations;
CREATE TRIGGER trg_circle_member_invitations_updated_at
BEFORE UPDATE ON circle_member_invitations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
