-- Per-lead state for pipeline runs (persists across tab closes)
CREATE TABLE IF NOT EXISTS pipeline_leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  lead_id     uuid REFERENCES leads(id),
  business_name text NOT NULL,
  phone       text DEFAULT '',
  status      text DEFAULT 'pending',
  score       integer,
  site_url    text,
  message     text,
  error       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_pipeline_leads_run ON pipeline_leads(run_id);
ALTER TABLE pipeline_leads DISABLE ROW LEVEL SECURITY;

-- Add stage and config columns to pipeline_runs
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS stage text DEFAULT 'idle';
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}';
