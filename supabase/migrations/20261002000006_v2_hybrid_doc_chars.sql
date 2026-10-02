-- Return only as much profile text as the caller needs (180 full documents was ~600 kB per query).
DROP FUNCTION IF EXISTS v2_hybrid_search(halfvec, text, jsonb, int, float8);

-- Hybrid retrieval at person level: best-chunk similarity + profile-document similarity + keyword rank,
-- fused with reciprocal rank fusion. Optionally restricted to people passing a structured filter.
CREATE OR REPLACE FUNCTION v2_hybrid_search(
  query_embedding halfvec(800),
  keyword_query text DEFAULT NULL,      -- a to_tsquery expression built by the edge function
  f jsonb DEFAULT NULL,
  match_count int DEFAULT 150,
  keyword_weight float8 DEFAULT 1.0,
  doc_chars int DEFAULT 1400            -- profile text returned per person (keeps the payload small)
)
RETURNS TABLE (person_id uuid, score float8, chunk_sim float8, doc_sim float8, kw_rank float8,
               filtered_total int, card jsonb, profile_doc text)
LANGUAGE sql STABLE AS $$
  WITH allowed AS (
    SELECT fp.person_id FROM v2_filter_people(coalesce(f, '{}'::jsonb)) fp
  ),
  chunk_best AS (
    SELECT cv.person_id, max(1 - (cv.embedding <=> query_embedding)) AS sim
    FROM chunk_vectors cv
    WHERE cv.person_id IN (SELECT a.person_id FROM allowed a)
    GROUP BY cv.person_id
  ),
  chunk_ranked AS (SELECT cb.person_id, cb.sim, row_number() OVER (ORDER BY cb.sim DESC) AS rk FROM chunk_best cb),
  doc_ranked AS (
    SELECT ps.person_id, 1 - (ps.embedding <=> query_embedding) AS sim,
           row_number() OVER (ORDER BY ps.embedding <=> query_embedding) AS rk
    FROM person_search ps
    WHERE ps.embedding IS NOT NULL AND ps.person_id IN (SELECT a.person_id FROM allowed a)
  ),
  kw AS (
    SELECT ps.person_id, ts_rank(ps.fts, q.tsq, 1) AS r
    FROM person_search ps, (SELECT to_tsquery('english', keyword_query) AS tsq) q
    WHERE coalesce(keyword_query, '') <> '' AND ps.fts @@ q.tsq
      AND ps.person_id IN (SELECT a.person_id FROM allowed a)
  ),
  kw_ranked AS (SELECT k.person_id, k.r, row_number() OVER (ORDER BY k.r DESC) AS rk FROM kw k),
  fused AS (
    SELECT a.person_id,
           coalesce(1.0 / (60 + c.rk), 0) + coalesce(1.0 / (60 + d.rk), 0) + keyword_weight * coalesce(1.0 / (60 + k.rk), 0) AS score,
           c.sim AS chunk_sim, d.sim AS doc_sim, k.r AS kw_rank
    FROM allowed a
    LEFT JOIN chunk_ranked c ON c.person_id = a.person_id
    LEFT JOIN doc_ranked d ON d.person_id = a.person_id
    LEFT JOIN kw_ranked k ON k.person_id = a.person_id
  )
  SELECT fu.person_id, fu.score, fu.chunk_sim, fu.doc_sim, fu.kw_rank,
         (SELECT count(*)::int FROM allowed) AS filtered_total, ps.card, left(ps.profile_doc, doc_chars)
  FROM fused fu
  JOIN person_search ps ON ps.person_id = fu.person_id
  ORDER BY fu.score DESC
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION v2_hybrid_search(halfvec, text, jsonb, int, float8, int) FROM anon, authenticated;
