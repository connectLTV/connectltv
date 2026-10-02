-- Explore agent support (MASTER_PLAN Phase 2): aggregates over the structured facts, and session logging.

-- Count people by one dimension, optionally within a structured filter (same filter object as v2_filter_people).
-- Groups smaller than `min_group` are folded into one "(small groups)" row so aggregates cannot single people out.
CREATE OR REPLACE FUNCTION v2_aggregate(
  f jsonb,
  dimension text,
  top_n int DEFAULT 25,
  min_group int DEFAULT 3
)
RETURNS TABLE (value text, people int, total_people int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  person_dims text[] := ARRAY['metro','country','region','current_function','current_seniority','current_size_bucket',
    'current_industry_group','pre_hbs_archetype','post_hbs_path','investor_type','founder_type','first_post_hbs_size_bucket',
    'first_post_hbs_function','undergrad_school','undergrad_major_category','harvard_joint_degree','sector_tags','instructors',
    'pedigree','advanced_degrees','countries_worked','ever_founded','currently_founder','founded_near_hbs','early_employee',
    'joined_startup_after_hbs','is_investor','ever_investor','industry_switcher','function_switcher','technical_background',
    'military_veteran','has_board_role'];
BEGIN
  IF NOT (dimension = ANY(person_dims) OR dimension IN ('class_year', 'current_company', 'company', 'school')) THEN
    RAISE EXCEPTION 'unknown dimension: %', dimension;
  END IF;

  RETURN QUERY
  WITH allowed AS (SELECT fp.person_id FROM v2_filter_people(coalesce(f, '{}'::jsonb)) fp),
  vals AS (
    -- one row per (person, value)
    SELECT a.person_id, p.class_year::text AS v
      FROM allowed a JOIN people p ON p.person_id = a.person_id WHERE dimension = 'class_year'
    UNION ALL
    SELECT a.person_id, c.canonical_name
      FROM allowed a JOIN person_facts pf ON pf.person_id = a.person_id JOIN companies c ON c.company_id = pf.current_company_id
      WHERE dimension = 'current_company'
    UNION ALL
    SELECT DISTINCT a.person_id, c.canonical_name
      FROM allowed a JOIN experience_facts ef ON ef.person_id = a.person_id JOIN companies c ON c.company_id = ef.company_id
      WHERE dimension = 'company' AND ef.role_type IN ('full_time', 'internship')
    UNION ALL
    SELECT DISTINCT a.person_id, df.school_canonical
      FROM allowed a JOIN education_facts df ON df.person_id = a.person_id
      WHERE dimension = 'school' AND df.school_canonical IS NOT NULL
    UNION ALL
    SELECT a.person_id, x.v
      FROM allowed a JOIN person_facts pf ON pf.person_id = a.person_id,
      LATERAL (
        SELECT CASE WHEN jsonb_typeof(to_jsonb(pf) -> dimension) = 'array' THEN NULL ELSE to_jsonb(pf) ->> dimension END AS v
        UNION ALL
        SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(pf) -> dimension) = 'array' THEN to_jsonb(pf) -> dimension ELSE '[]'::jsonb END)
      ) x
      WHERE dimension = ANY(person_dims) AND x.v IS NOT NULL
  ),
  grouped AS (SELECT vals.v, count(DISTINCT vals.person_id)::int AS n FROM vals GROUP BY vals.v),
  ranked AS (SELECT g.v, g.n, row_number() OVER (ORDER BY g.n DESC, g.v) AS rk FROM grouped g WHERE g.n >= min_group),
  small AS (SELECT coalesce(sum(g.n), 0)::int AS n FROM grouped g WHERE g.n < min_group),
  tail AS (SELECT coalesce(sum(r.n), 0)::int AS n FROM ranked r WHERE r.rk > top_n)
  SELECT r.v, r.n, (SELECT count(*)::int FROM allowed) FROM ranked r WHERE r.rk <= top_n
  UNION ALL
  SELECT '(other values beyond the top ' || top_n || ')', t.n, (SELECT count(*)::int FROM allowed) FROM tail t WHERE t.n > 0
  UNION ALL
  SELECT '(values held by fewer than ' || min_group || ' people, combined)', s.n, (SELECT count(*)::int FROM allowed) FROM small s WHERE s.n > 0;
END;
$$;
REVOKE ALL ON FUNCTION v2_aggregate(jsonb, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION v2_aggregate(jsonb, text, int, int) TO service_role;

CREATE TABLE IF NOT EXISTS explore_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT,
  user_message TEXT NOT NULL,
  tool_calls JSONB,
  people_shown INTEGER,
  cost_usd NUMERIC,
  duration_ms INTEGER,
  error TEXT
);
COMMENT ON TABLE explore_logs IS 'One row per Explore agent turn. No user identity. Service role only.';
ALTER TABLE explore_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE explore_logs FROM anon, authenticated;
