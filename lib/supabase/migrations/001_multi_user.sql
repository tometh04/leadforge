-- 001_multi_user.sql
-- Multi-user support + multi-WhatsApp accounts

-- ─── 1. Users table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  password_hash text NOT NULL,
  is_seed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- ─── 2. WhatsApp accounts table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Principal',
  phone_number text,
  status text DEFAULT 'disconnected' CHECK (status IN ('paired', 'disconnected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_whatsapp_accounts_user_id ON whatsapp_accounts(user_id);

CREATE OR REPLACE FUNCTION update_whatsapp_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_whatsapp_accounts_updated_at
  BEFORE UPDATE ON whatsapp_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_accounts_updated_at();

-- ─── 3. Modify whatsapp_auth — add account_id ──────────────────────────────────

-- Drop old PK, add account_id, set new composite PK
ALTER TABLE whatsapp_auth DROP CONSTRAINT IF EXISTS whatsapp_auth_pkey;
ALTER TABLE whatsapp_auth ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES whatsapp_accounts(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_auth ADD PRIMARY KEY (account_id, id);

-- ─── 4. Add user_id to all data tables ──────────────────────────────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lead_activity ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE scraper_searches ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- pipeline_leads table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_leads') THEN
    EXECUTE 'ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE';
  END IF;
END $$;

-- ─── 5. Add whatsapp_account_id to pipeline_runs ────────────────────────────────

ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS whatsapp_account_id uuid REFERENCES whatsapp_accounts(id);

-- ─── 6. Indexes for user_id ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_user_id ON lead_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_scraper_searches_user_id ON scraper_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id ON pipeline_runs(user_id);

-- ─── 7. Change leads unique constraint from place_id to (place_id, user_id) ─────

-- Drop old unique constraint on place_id
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_place_id_key;
-- Create new composite unique constraint
ALTER TABLE leads ADD CONSTRAINT leads_place_id_user_id_key UNIQUE (place_id, user_id);

-- ─── 8. Seed admin + backfill ───────────────────────────────────────────────────
-- NOTE: This must be run AFTER the application seeds the admin user.
-- The application will auto-provision the seed user on first login.
-- After that, run the following to backfill:
--
-- UPDATE leads SET user_id = '<seed_user_id>' WHERE user_id IS NULL;
-- UPDATE messages SET user_id = '<seed_user_id>' WHERE user_id IS NULL;
-- UPDATE lead_activity SET user_id = '<seed_user_id>' WHERE user_id IS NULL;
-- UPDATE scraper_searches SET user_id = '<seed_user_id>' WHERE user_id IS NULL;
-- UPDATE pipeline_runs SET user_id = '<seed_user_id>' WHERE user_id IS NULL;
-- UPDATE pipeline_leads SET user_id = '<seed_user_id>' WHERE user_id IS NULL;
--
-- Then set NOT NULL:
-- ALTER TABLE leads ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE lead_activity ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE scraper_searches ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE pipeline_runs ALTER COLUMN user_id SET NOT NULL;
--
-- If whatsapp_auth has existing creds:
-- INSERT INTO whatsapp_accounts (user_id, label, status) VALUES ('<seed_user_id>', 'Principal', 'paired');
-- UPDATE whatsapp_auth SET account_id = '<new_account_id>' WHERE account_id IS NULL;
