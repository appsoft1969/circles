-- InCircle auth identity and session tables.
-- Supports Apple, Google, LINE, and future OAuth/OIDC providers.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  display_name text,
  avatar_url text,
  raw_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (provider, provider_user_id),
  CHECK (provider IN ('apple', 'google', 'line', 'facebook'))
);

CREATE INDEX IF NOT EXISTS ix_auth_identities_profile_id
  ON auth_identities (profile_id);

CREATE INDEX IF NOT EXISTS ix_auth_identities_email_lower
  ON auth_identities (lower(email))
  WHERE email IS NOT NULL;

DROP TRIGGER IF EXISTS trg_auth_identities_updated_at ON auth_identities;
CREATE TRIGGER trg_auth_identities_updated_at
BEFORE UPDATE ON auth_identities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_auth_sessions_profile_active
  ON auth_sessions (profile_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  nonce text NOT NULL,
  redirect_after text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (provider IN ('apple', 'google', 'line', 'facebook'))
);

CREATE INDEX IF NOT EXISTS ix_auth_oauth_states_provider_active
  ON auth_oauth_states (provider, expires_at)
  WHERE consumed_at IS NULL;
