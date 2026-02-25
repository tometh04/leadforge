-- LeadForge — Schema con multi-user
-- Ejecutar en el SQL Editor de Supabase

-- Tabla de usuarios
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

-- Tabla de cuentas WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Principal',
  phone_number text,
  status text DEFAULT 'disconnected' CHECK (status IN ('paired', 'disconnected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_user_id ON whatsapp_accounts(user_id);

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

-- Tabla principal de leads
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id text NOT NULL,
  business_name text NOT NULL,
  address text,
  phone text,
  website text,
  category text,
  rating numeric,
  google_photo_url text,
  niche text,
  city text,
  status text DEFAULT 'nuevo' CHECK (status IN (
    'nuevo', 'analizado', 'candidato', 'sitio_generado',
    'contactado', 'en_negociacion', 'cerrado', 'descartado'
  )),
  score integer CHECK (score >= 1 AND score <= 10),
  score_summary text,
  score_details jsonb,
  generated_site_url text,
  notes text,
  tags text[] DEFAULT '{}',
  last_contacted_at timestamptz,
  UNIQUE (place_id, user_id)
);

-- Tabla de mensajes enviados
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  channel text DEFAULT 'whatsapp',
  message_body text NOT NULL,
  template_used text
);

-- Tabla de actividad del lead
CREATE TABLE IF NOT EXISTS lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  action text NOT NULL,
  detail text
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_niche ON leads(niche);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_lead_id ON lead_activity(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_id ON lead_activity(user_id);

-- Historial de búsquedas del scraper
CREATE TABLE IF NOT EXISTS scraper_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  niche text NOT NULL,
  city text NOT NULL,
  max_results integer NOT NULL DEFAULT 20,
  total_found integer NOT NULL DEFAULT 0,
  new_found integer NOT NULL DEFAULT 0,
  viable integer NOT NULL DEFAULT 0,
  discarded integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scraper_searches_created_at ON scraper_searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_searches_user_id ON scraper_searches(user_id);

-- Auth state de WhatsApp (Baileys) — scoped per account
CREATE TABLE IF NOT EXISTS whatsapp_auth (
  account_id uuid NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (account_id, id)
);

-- Historial de ejecuciones del pipeline autopilot
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_account_id uuid REFERENCES whatsapp_accounts(id),
  niche text NOT NULL,
  city text NOT NULL,
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  total_leads integer DEFAULT 0,
  analyzed integer DEFAULT 0,
  sites_generated integer DEFAULT 0,
  messages_sent integer DEFAULT 0,
  errors jsonb DEFAULT '[]',
  completed_at timestamptz,
  stage text DEFAULT 'idle',
  config jsonb DEFAULT '{}',
  search_results jsonb
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id ON pipeline_runs(user_id);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_pipeline_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pipeline_runs_updated_at
  BEFORE UPDATE ON pipeline_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_runs_updated_at();

-- Pipeline leads tracking
CREATE TABLE IF NOT EXISTS pipeline_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  phone text DEFAULT '',
  status text DEFAULT 'pending',
  score integer,
  site_url text,
  message text,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_run_id ON pipeline_leads(run_id);

-- RLS — desactivado (filtrado manual por user_id en código)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activity DISABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_searches DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_auth DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_leads DISABLE ROW LEVEL SECURITY;
