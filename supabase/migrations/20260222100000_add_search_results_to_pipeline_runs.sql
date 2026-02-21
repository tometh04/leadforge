-- Store search results between pipeline stages (chained invocations)
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS search_results jsonb;
