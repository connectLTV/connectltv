-- v2: exact (non-approximate) chunk search. The HNSW index returns at most hnsw.ef_search (40)
-- rows regardless of LIMIT, so the v1 "top 200" was really ~40 chunks. At ~31k chunks a full
-- scan is fast enough and has perfect recall. The index scan is disabled for this function only.
CREATE OR REPLACE FUNCTION v2_search_chunks_exact(
  query_embedding vector(800),
  match_count int DEFAULT 200
)
RETURNS TABLE (chunk_id uuid, person_id uuid, chunk_type text, similarity float8)
LANGUAGE sql STABLE
SET enable_indexscan = off
AS $$
  SELECT c.chunk_id, c.person_id, c.chunk_type, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  WHERE c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION v2_search_chunks_exact(vector, int) FROM anon, authenticated;
