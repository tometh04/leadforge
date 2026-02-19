-- LeadForge — Schema inicial Supabase
-- Ejecutar en el SQL Editor de Supabase

-- Tabla principal de leads
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  place_id text UNIQUE NOT NULL,
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
  last_contacted_at timestamptz
);

-- Tabla de mensajes enviados
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  channel text DEFAULT 'whatsapp',
  message_body text NOT NULL,
  template_used text
);

-- Tabla de actividad del lead
CREATE TABLE IF NOT EXISTS lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_lead_id ON lead_activity(lead_id);

-- Historial de búsquedas del scraper
CREATE TABLE IF NOT EXISTS scraper_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  niche text NOT NULL,
  city text NOT NULL,
  max_results integer NOT NULL DEFAULT 20,
  total_found integer NOT NULL DEFAULT 0,
  new_found integer NOT NULL DEFAULT 0,
  viable integer NOT NULL DEFAULT 0,
  discarded integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_scraper_searches_created_at ON scraper_searches(created_at DESC);

-- RLS (Row Level Security) — desactivado para MVP single-user
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activity DISABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_searches DISABLE ROW LEVEL SECURITY;
