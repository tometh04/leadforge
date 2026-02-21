-- Auth state de WhatsApp (Baileys)
CREATE TABLE IF NOT EXISTS whatsapp_auth (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_auth DISABLE ROW LEVEL SECURITY;

-- Historial de ejecuciones del pipeline autopilot
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  niche text NOT NULL,
  city text NOT NULL,
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  total_leads integer DEFAULT 0,
  analyzed integer DEFAULT 0,
  sites_generated integer DEFAULT 0,
  messages_sent integer DEFAULT 0,
  errors jsonb DEFAULT '[]',
  completed_at timestamptz
);

ALTER TABLE pipeline_runs DISABLE ROW LEVEL SECURITY;
