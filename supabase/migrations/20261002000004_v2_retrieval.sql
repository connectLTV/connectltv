-- v2 retrieval layer (MASTER_PLAN step 1.5). Additive: new tables and functions only.

-- One searchable document per person: keyword index + embedding + the ready-to-return result card.
CREATE TABLE IF NOT EXISTS person_search (
  person_id UUID PRIMARY KEY REFERENCES people(person_id) ON DELETE CASCADE,
  profile_doc TEXT NOT NULL,
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', profile_doc)) STORED,
  embedding halfvec(800),
  card JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_person_search_fts ON person_search USING gin (fts);

-- Compact copy of the chunk embeddings (half precision, stored inline) so an exact scan is small and cache-friendly.
CREATE TABLE IF NOT EXISTS chunk_vectors (
  chunk_id UUID PRIMARY KEY REFERENCES chunks(chunk_id) ON DELETE CASCADE,
  person_id UUID NOT NULL,
  chunk_type TEXT NOT NULL,
  embedding halfvec(800) NOT NULL
);
ALTER TABLE chunk_vectors ALTER COLUMN embedding SET STORAGE PLAIN;
INSERT INTO chunk_vectors (chunk_id, person_id, chunk_type, embedding)
SELECT chunk_id, person_id, chunk_type, embedding::halfvec(800) FROM chunks WHERE embedding IS NOT NULL
ON CONFLICT (chunk_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_chunk_vectors_person ON chunk_vectors(person_id);

ALTER TABLE person_search ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunk_vectors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE person_search, chunk_vectors FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION v2_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Does a user-supplied name match any of the candidate names on a word boundary?
-- "amazon" matches "amazon web services"; "meta" does not match "metabolic"; "jpmorgan" matches "j p morgan".
CREATE OR REPLACE FUNCTION v2_name_match(names text[], q text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(names) raw, LATERAL (SELECT v2_norm(raw) AS name, v2_norm(q) AS n) x
    WHERE x.n <> '' AND (x.name = x.n OR x.name LIKE x.n || ' %' OR x.name LIKE '% ' || x.n OR x.name LIKE '% ' || x.n || ' %'
           OR replace(x.name, ' ', '') = replace(x.n, ' ', ''))
  );
$$;

-- Generic filter match: array filter = any-of; scalar filter = equality. Works for scalar and array columns.
CREATE OR REPLACE FUNCTION v2_json_match(col jsonb, want jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN col IS NULL OR jsonb_typeof(col) = 'null' THEN false
    WHEN jsonb_typeof(want) = 'array' AND jsonb_typeof(col) = 'array'
      THEN col ?| ARRAY(SELECT jsonb_array_elements_text(want))
    WHEN jsonb_typeof(want) = 'array'
      THEN (col #>> '{}') = ANY(ARRAY(SELECT jsonb_array_elements_text(want)))
    WHEN jsonb_typeof(col) = 'array'
      THEN col ? (want #>> '{}')
    ELSE col = want
  END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Structured filter. `f` is the filter object produced by query translation:
--   class_years [int], class_year_min/max, years_experience_min/max,
--   locations [text]  (metro, city, country or region),
--   skills [text]     (any-of, matched against the skills table),
--   person {col: value | [values]}        any person_facts column
--   experiences [{companies [text], title_keywords [text], <experience_facts col>: value | [values]}]
--        each object must be satisfied by a single experience; all objects must be satisfied
--   educations  [{schools [text], field_keywords [text], <education_facts col>: value | [values]}]
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION v2_filter_people(f jsonb)
RETURNS TABLE (person_id uuid, richness_score int)
LANGUAGE sql STABLE AS $$
  WITH exp_conds AS (
    SELECT cond,
      CASE WHEN cond ? 'companies' THEN (
        SELECT coalesce(array_agg(c.company_id), '{}')
        FROM companies c
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(cond->'companies') n
                      WHERE v2_name_match(c.canonical_name || c.aliases, n))
      ) END AS cids
    FROM jsonb_array_elements(coalesce(f->'experiences', '[]'::jsonb)) cond
  ),
  edu_conds AS (
    SELECT cond FROM jsonb_array_elements(coalesce(f->'educations', '[]'::jsonb)) cond
  )
  SELECT p.person_id, pf.richness_score
  FROM people p
  JOIN person_facts pf ON pf.person_id = p.person_id
  WHERE (NOT f ? 'class_years' OR p.class_year IN (SELECT x::int FROM jsonb_array_elements_text(f->'class_years') x))
    AND (NOT f ? 'class_year_min' OR p.class_year >= (f->>'class_year_min')::int)
    AND (NOT f ? 'class_year_max' OR p.class_year <= (f->>'class_year_max')::int)
    AND (NOT f ? 'years_experience_min' OR pf.years_experience >= (f->>'years_experience_min')::numeric)
    AND (NOT f ? 'years_experience_max' OR pf.years_experience <= (f->>'years_experience_max')::numeric)
    AND (NOT f ? 'locations' OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(f->'locations') l
          WHERE pf.metro ILIKE l OR p.location ILIKE '%' || l || '%' OR pf.country ILIKE l OR pf.region ILIKE l))
    AND (NOT f ? 'skills' OR EXISTS (
          SELECT 1 FROM skills s, jsonb_array_elements_text(f->'skills') k
          WHERE s.person_id = p.person_id AND s.skill_name ILIKE k))
    AND NOT EXISTS (
          SELECT 1 FROM jsonb_each(coalesce(f->'person', '{}'::jsonb)) kv
          WHERE NOT v2_json_match(to_jsonb(pf) -> kv.key, kv.value))
    AND NOT EXISTS (
          SELECT 1 FROM exp_conds ec
          WHERE NOT EXISTS (
            SELECT 1 FROM experience_facts ef
            JOIN experiences e ON e.exp_id = ef.exp_id
            WHERE ef.person_id = p.person_id
              AND (ec.cids IS NULL OR ef.company_id = ANY(ec.cids))
              AND (NOT ec.cond ? 'title_keywords' OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(ec.cond->'title_keywords') t
                    WHERE e.title ILIKE '%' || t || '%'))
              AND NOT EXISTS (
                    SELECT 1 FROM jsonb_each(ec.cond - 'companies' - 'title_keywords') kv
                    WHERE NOT v2_json_match(to_jsonb(ef) -> kv.key, kv.value))))
    AND NOT EXISTS (
          SELECT 1 FROM edu_conds dc
          WHERE NOT EXISTS (
            SELECT 1 FROM education_facts df
            JOIN educations d ON d.edu_id = df.edu_id
            WHERE df.person_id = p.person_id
              AND (NOT dc.cond ? 'schools' OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(dc.cond->'schools') n
                    WHERE v2_name_match(ARRAY[df.school_canonical, d.school], n)))
              AND (NOT dc.cond ? 'field_keywords' OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(dc.cond->'field_keywords') t
                    WHERE d.field ILIKE '%' || t || '%' OR d.degree ILIKE '%' || t || '%'))
              AND NOT EXISTS (
                    SELECT 1 FROM jsonb_each(dc.cond - 'schools' - 'field_keywords') kv
                    WHERE NOT v2_json_match(to_jsonb(df) -> kv.key, kv.value))));
$$;

-- Purely structured search: every match, richest profiles first, with the result card.
CREATE OR REPLACE FUNCTION v2_structured_search(f jsonb)
RETURNS TABLE (person_id uuid, richness_score int, card jsonb)
LANGUAGE sql STABLE AS $$
  SELECT fp.person_id, fp.richness_score, ps.card
  FROM v2_filter_people(f) fp
  JOIN person_search ps ON ps.person_id = fp.person_id
  ORDER BY fp.richness_score DESC, fp.person_id;
$$;

-- Hybrid retrieval at person level: best-chunk similarity + profile-document similarity + keyword rank,
-- fused with reciprocal rank fusion. Optionally restricted to people passing a structured filter.
CREATE OR REPLACE FUNCTION v2_hybrid_search(
  query_embedding halfvec(800),
  keyword_query text DEFAULT NULL,      -- a to_tsquery expression built by the edge function
  f jsonb DEFAULT NULL,
  match_count int DEFAULT 150,
  keyword_weight float8 DEFAULT 1.0
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
         (SELECT count(*)::int FROM allowed) AS filtered_total, ps.card, ps.profile_doc
  FROM fused fu
  JOIN person_search ps ON ps.person_id = fu.person_id
  ORDER BY fu.score DESC
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION v2_filter_people(jsonb), v2_structured_search(jsonb),
  v2_hybrid_search(halfvec, text, jsonb, int, float8) FROM anon, authenticated;
