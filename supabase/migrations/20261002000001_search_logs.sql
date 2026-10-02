-- Query logging for search functions (no user identity is stored)
CREATE TABLE IF NOT EXISTS search_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  function_name TEXT NOT NULL,
  query TEXT NOT NULL,
  route TEXT,
  result_count INTEGER,
  time_to_first_result_ms INTEGER,
  total_ms INTEGER,
  error TEXT,
  meta JSONB
);

COMMENT ON TABLE search_logs IS 'One row per search request. Written by edge functions with the service role only.';

CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at);

-- Service role bypasses RLS; no policies means anon/authenticated cannot read or write
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE search_logs FROM anon, authenticated;
