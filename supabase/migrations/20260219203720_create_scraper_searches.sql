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

CREATE INDEX IF NOT EXISTS idx_scraper_searches_created_at ON scraper_searches(created_at DESC);

ALTER TABLE scraper_searches DISABLE ROW LEVEL SECURITY;
