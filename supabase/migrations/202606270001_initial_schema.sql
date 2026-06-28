-- InCircle initial Postgres schema.
-- This migration is designed for local Postgres and future Supabase/Postgres.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TYPE profile_status AS ENUM ('active', 'disabled', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE circle_visibility AS ENUM ('private', 'invite_link');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE circle_role AS ENUM ('owner', 'admin', 'member', 'guest');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE membership_status AS ENUM ('invited', 'active', 'muted', 'left', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE task_status AS ENUM ('draft', 'open', 'closed', 'completed', 'cancelled', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE payment_status AS ENUM ('not_required', 'unpaid', 'review', 'paid', 'refunded', 'cancelled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE fulfillment_status AS ENUM ('pending', 'picked_up', 'attending', 'maybe', 'completed', 'cancelled', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE rsvp_status AS ENUM ('pending', 'yes', 'maybe', 'no');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'line_pay', 'credit_card', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE announcement_priority AS ENUM ('normal', 'important', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE conversation_type AS ENUM ('circle', 'task', 'support');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE notification_channel AS ENUM ('in_app', 'push', 'email', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE attachment_purpose AS ENUM ('avatar', 'item_photo', 'payment_proof', 'chat_attachment', 'announcement_attachment', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  email text,
  phone text,
  avatar_url text,
  locale text NOT NULL DEFAULT 'zh-TW',
  timezone text NOT NULL DEFAULT 'Asia/Taipei',
  status profile_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_email_lower
  ON profiles (lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_phone
  ON profiles (phone)
  WHERE phone IS NOT NULL;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform device_platform NOT NULL DEFAULT 'unknown',
  push_token text NOT NULL,
  app_version text,
  device_name text,
  locale text,
  timezone text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_devices_push_token
  ON devices (push_token);

CREATE INDEX IF NOT EXISTS ix_devices_profile_id
  ON devices (profile_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  important_only boolean NOT NULL DEFAULT false,
  announcement_enabled boolean NOT NULL DEFAULT true,
  message_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time NOT NULL DEFAULT '22:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL REFERENCES profiles(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  visibility circle_visibility NOT NULL DEFAULT 'private',
  invite_code text NOT NULL UNIQUE DEFAULT substr(encode(gen_random_bytes(8), 'hex'), 1, 12),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_circles_owner_profile_id
  ON circles (owner_profile_id);

DROP TRIGGER IF EXISTS trg_circles_updated_at ON circles;
CREATE TRIGGER trg_circles_updated_at
BEFORE UPDATE ON circles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS circle_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  contact_hint text NOT NULL DEFAULT '',
  role circle_role NOT NULL DEFAULT 'member',
  status membership_status NOT NULL DEFAULT 'active',
  invited_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_circle_memberships_circle_profile
  ON circle_memberships (circle_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_circle_memberships_circle_id
  ON circle_memberships (circle_id);

CREATE INDEX IF NOT EXISTS ix_circle_memberships_profile_id
  ON circle_memberships (profile_id);

DROP TRIGGER IF EXISTS trg_circle_memberships_updated_at ON circle_memberships;
CREATE TRIGGER trg_circle_memberships_updated_at
BEFORE UPDATE ON circle_memberships
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS circle_notification_preferences (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  important_only boolean NOT NULL DEFAULT false,
  announcement_enabled boolean NOT NULL DEFAULT true,
  message_enabled boolean NOT NULL DEFAULT true,
  muted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, circle_id)
);

CREATE INDEX IF NOT EXISTS ix_circle_notification_preferences_circle_id
  ON circle_notification_preferences (circle_id);

DROP TRIGGER IF EXISTS trg_circle_notification_preferences_updated_at ON circle_notification_preferences;
CREATE TRIGGER trg_circle_notification_preferences_updated_at
BEFORE UPDATE ON circle_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS circle_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE DEFAULT substr(encode(gen_random_bytes(10), 'hex'), 1, 16),
  role circle_role NOT NULL DEFAULT 'member',
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at timestamptz,
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (max_uses IS NULL OR max_uses > 0)
);

CREATE INDEX IF NOT EXISTS ix_circle_invites_circle_id
  ON circle_invites (circle_id);

CREATE TABLE IF NOT EXISTS task_templates (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_task_templates_updated_at ON task_templates;
CREATE TRIGGER trg_task_templates_updated_at
BEFORE UPDATE ON task_templates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO task_templates (id, display_name, description, category, sort_order)
VALUES
  ('group_buy', '團購', '商品、數量、付款、取貨', 'commerce', 10),
  ('interest_check', '意願調查', '電影、吃飯、球賽、票券先問人數', 'coordination', 20),
  ('claim', '領取登記', '免費票券、名額、好康領取', 'coordination', 30),
  ('member_sale', '圈內小市集', '成員自售、限量、面交', 'commerce', 40),
  ('meal_order', '訂餐', '便當、外食、到餐領取', 'food', 50),
  ('drink_order', '訂飲料', '甜度、冰塊、加料', 'food', 60),
  ('activity', '活動 / KTV', '參加統計、訂金、AA', 'activity', 70),
  ('poll', '投票', '時間、地點、選項', 'coordination', 80),
  ('expense_split', '費用分攤', '誰付、誰欠、誰結清', 'money', 90)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES task_templates(id),
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  seller_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  seller_display_name text,
  source_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status task_status NOT NULL DEFAULT 'draft',
  deadline_at timestamptz,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  payment_instructions text NOT NULL DEFAULT '',
  pickup_instructions text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_tasks_circle_status_deadline
  ON tasks (circle_id, status, deadline_at);

CREATE INDEX IF NOT EXISTS ix_tasks_template_id
  ON tasks (template_id);

CREATE INDEX IF NOT EXISTS ix_tasks_created_by_profile_id
  ON tasks (created_by_profile_id);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS task_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'TWD',
  max_quantity integer CHECK (max_quantity IS NULL OR max_quantity >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_task_options_task_id_sort
  ON task_options (task_id, sort_order);

DROP TRIGGER IF EXISTS trg_task_options_updated_at ON task_options;
CREATE TRIGGER trg_task_options_updated_at
BEFORE UPDATE ON task_options
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  participant_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  participant_name text NOT NULL,
  participant_contact text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  total_amount_cents integer NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'TWD',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  fulfillment_status fulfillment_status NOT NULL DEFAULT 'pending',
  rsvp_status rsvp_status NOT NULL DEFAULT 'yes',
  guest_count integer NOT NULL DEFAULT 0 CHECK (guest_count >= 0),
  edit_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_responses_task_id_created
  ON responses (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_responses_participant_profile_id
  ON responses (participant_profile_id);

CREATE INDEX IF NOT EXISTS ix_responses_payment_status
  ON responses (task_id, payment_status);

DROP TRIGGER IF EXISTS trg_responses_updated_at ON responses;
CREATE TRIGGER trg_responses_updated_at
BEFORE UPDATE ON responses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS response_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES task_options(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'TWD',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_response_items_response_option
  ON response_items (response_id, option_id);

CREATE INDEX IF NOT EXISTS ix_response_items_option_id
  ON response_items (option_id);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  circle_id uuid REFERENCES circles(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  response_id uuid REFERENCES responses(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  object_key text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  byte_size bigint NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  purpose attachment_purpose NOT NULL DEFAULT 'other',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_attachments_bucket_object_key
  ON attachments (bucket, object_key);

CREATE INDEX IF NOT EXISTS ix_attachments_task_id
  ON attachments (task_id);

CREATE INDEX IF NOT EXISTS ix_attachments_response_id
  ON attachments (response_id);

CREATE TABLE IF NOT EXISTS payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  response_id uuid REFERENCES responses(id) ON DELETE CASCADE,
  payer_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'TWD',
  method payment_method NOT NULL DEFAULT 'other',
  status payment_status NOT NULL DEFAULT 'review',
  transfer_last5 text,
  proof_attachment_id uuid REFERENCES attachments(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  confirmed_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_payment_records_task_id
  ON payment_records (task_id);

CREATE INDEX IF NOT EXISTS ix_payment_records_response_id
  ON payment_records (response_id);

CREATE INDEX IF NOT EXISTS ix_payment_records_status
  ON payment_records (status);

DROP TRIGGER IF EXISTS trg_payment_records_updated_at ON payment_records;
CREATE TRIGGER trg_payment_records_updated_at
BEFORE UPDATE ON payment_records
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  author_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  priority announcement_priority NOT NULL DEFAULT 'normal',
  requires_confirmation boolean NOT NULL DEFAULT false,
  pinned_at timestamptz,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_announcements_circle_published
  ON announcements (circle_id, published_at DESC);

CREATE INDEX IF NOT EXISTS ix_announcements_task_id
  ON announcements (task_id);

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON announcements;
CREATE TRIGGER trg_announcements_updated_at
BEFORE UPDATE ON announcements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS announcement_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, profile_id)
);

CREATE INDEX IF NOT EXISTS ix_announcement_receipts_profile_id
  ON announcement_receipts (profile_id);

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  participant_name text,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_task_comments_task_created
  ON task_comments (task_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_task_comments_updated_at ON task_comments;
CREATE TRIGGER trg_task_comments_updated_at
BEFORE UPDATE ON task_comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  type conversation_type NOT NULL DEFAULT 'circle',
  title text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_conversations_circle_id
  ON conversations (circle_id);

CREATE INDEX IF NOT EXISTS ix_conversations_task_id
  ON conversations (task_id);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, profile_id)
);

CREATE INDEX IF NOT EXISTS ix_message_reads_profile_id
  ON message_reads (profile_id);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  circle_id uuid REFERENCES circles(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status notification_status NOT NULL DEFAULT 'queued',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_notifications_recipient_created
  ON notifications (recipient_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notifications_unread
  ON notifications (recipient_profile_id, read_at)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  channel notification_channel NOT NULL,
  provider text NOT NULL DEFAULT '',
  provider_message_id text,
  status notification_status NOT NULL DEFAULT 'queued',
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_notification_deliveries_notification_id
  ON notification_deliveries (notification_id);

CREATE INDEX IF NOT EXISTS ix_notification_deliveries_status
  ON notification_deliveries (status);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  circle_id uuid REFERENCES circles(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_events_circle_created
  ON audit_events (circle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_audit_events_actor_created
  ON audit_events (actor_profile_id, created_at DESC);
