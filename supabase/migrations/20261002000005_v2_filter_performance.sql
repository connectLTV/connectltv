-- Hoist company / school name matching out of the per-person loop (the first version timed out).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS norm_names TEXT[] NOT NULL DEFAULT '{}';
UPDATE companies SET norm_names = ARRAY(SELECT DISTINCT v2_norm(x) FROM unnest(canonical_name || aliases) x WHERE v2_norm(x) <> '');

CREATE TABLE IF NOT EXISTS schools (
  school_canonical TEXT PRIMARY KEY,
  norm_name TEXT NOT NULL,
  people_count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schools FROM anon, authenticated;
INSERT INTO schools (school_canonical, norm_name, people_count)
SELECT school_canonical, v2_norm(school_canonical), count(DISTINCT person_id)
FROM education_facts WHERE school_canonical IS NOT NULL GROUP BY school_canonical
ON CONFLICT (school_canonical) DO UPDATE SET norm_name = EXCLUDED.norm_name, people_count = EXCLUDED.people_count;

-- Inputs must already be normalised with v2_norm.
CREATE OR REPLACE FUNCTION v2_norm_match(name text, n text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT n <> '' AND (name = n OR name LIKE n || ' %' OR name LIKE '% ' || n OR name LIKE '% ' || n || ' %'
                      OR replace(name, ' ', '') = replace(n, ' ', ''));
$$;

CREATE OR REPLACE FUNCTION v2_filter_people(f jsonb)
RETURNS TABLE (person_id uuid, richness_score int)
LANGUAGE sql STABLE AS $$
  WITH exp_conds AS MATERIALIZED (
    SELECT cond, cond - 'companies' - 'title_keywords' AS generic,
      CASE WHEN cond ? 'companies' THEN (
        SELECT coalesce(array_agg(c.company_id), '{}')
        FROM companies c
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(cond->'companies') q, unnest(c.norm_names) nm
                      WHERE v2_norm_match(nm, v2_norm(q)))
      ) END AS cids
    FROM jsonb_array_elements(coalesce(f->'experiences', '[]'::jsonb)) cond
  ),
  edu_conds AS MATERIALIZED (
    SELECT cond, cond - 'schools' - 'field_keywords' AS generic,
      CASE WHEN cond ? 'schools' THEN (
        SELECT coalesce(array_agg(s.school_canonical), '{}')
        FROM schools s
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(cond->'schools') q WHERE v2_norm_match(s.norm_name, v2_norm(q)))
      ) END AS schools
    FROM jsonb_array_elements(coalesce(f->'educations', '[]'::jsonb)) cond
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
                    SELECT 1 FROM jsonb_each(ec.generic) kv
                    WHERE NOT v2_json_match(to_jsonb(ef) -> kv.key, kv.value))))
    AND NOT EXISTS (
          SELECT 1 FROM edu_conds dc
          WHERE NOT EXISTS (
            SELECT 1 FROM education_facts df
            JOIN educations d ON d.edu_id = df.edu_id
            WHERE df.person_id = p.person_id
              AND (dc.schools IS NULL OR df.school_canonical = ANY(dc.schools))
              AND (NOT dc.cond ? 'field_keywords' OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(dc.cond->'field_keywords') t
                    WHERE d.field ILIKE '%' || t || '%' OR d.degree ILIKE '%' || t || '%'))
              AND NOT EXISTS (
                    SELECT 1 FROM jsonb_each(dc.generic) kv
                    WHERE NOT v2_json_match(to_jsonb(df) -> kv.key, kv.value))));
$$;
