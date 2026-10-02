-- One call to refresh the derived helper data after an enrichment run (called by scripts/enrichment/03_derive_facts.py).
CREATE OR REPLACE FUNCTION v2_refresh_helpers() RETURNS void LANGUAGE sql AS $$
  UPDATE companies SET norm_names = ARRAY(SELECT DISTINCT v2_norm(x) FROM unnest(canonical_name || aliases) x WHERE v2_norm(x) <> '');

  INSERT INTO schools (school_canonical, norm_name, people_count)
  SELECT school_canonical, v2_norm(school_canonical), count(DISTINCT person_id)
  FROM education_facts WHERE school_canonical IS NOT NULL GROUP BY school_canonical
  ON CONFLICT (school_canonical) DO UPDATE SET norm_name = EXCLUDED.norm_name, people_count = EXCLUDED.people_count;

  INSERT INTO chunk_vectors (chunk_id, person_id, chunk_type, embedding)
  SELECT chunk_id, person_id, chunk_type, embedding::halfvec(800) FROM chunks WHERE embedding IS NOT NULL
  ON CONFLICT (chunk_id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION v2_refresh_helpers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION v2_refresh_helpers() TO service_role;
