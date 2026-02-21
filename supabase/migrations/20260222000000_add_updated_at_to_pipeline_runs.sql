-- Add updated_at column to pipeline_runs so we can detect stale/stuck runs
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-update on every row change
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
