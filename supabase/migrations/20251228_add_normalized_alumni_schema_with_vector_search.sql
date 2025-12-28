-- Schema for ConnectLTV Alumni Database
-- Creates all normalized tables from scratch: people, experiences, educations, skills, chunks

-- ============================================================================
-- 1. CREATE people TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS people (
  person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  headline TEXT,
  summary TEXT,
  class_year INTEGER,
  section TEXT,
  location TEXT,
  current_company TEXT,
  current_title TEXT,
  current_industry TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE people IS 'LTV Alumni profiles';
COMMENT ON COLUMN people.full_name IS 'Full name of the alumni';
COMMENT ON COLUMN people.email IS 'Email address (from CSV)';
COMMENT ON COLUMN people.linkedin_url IS 'LinkedIn profile URL';
COMMENT ON COLUMN people.headline IS 'LinkedIn headline';
COMMENT ON COLUMN people.summary IS 'LinkedIn about/summary section';
COMMENT ON COLUMN people.class_year IS 'HBS graduation year (e.g., 2024)';
COMMENT ON COLUMN people.section IS 'LTV Instructor(s)';
COMMENT ON COLUMN people.location IS 'Current location (e.g., "Atlanta Metropolitan Area, United States")';
COMMENT ON COLUMN people.current_company IS 'Current company name';
COMMENT ON COLUMN people.current_title IS 'Current job title';
COMMENT ON COLUMN people.current_industry IS 'Industry of current company';

CREATE INDEX IF NOT EXISTS idx_people_class_year ON people(class_year);
CREATE INDEX IF NOT EXISTS idx_people_section ON people(section);
CREATE INDEX IF NOT EXISTS idx_people_location ON people(location);

-- ============================================================================
-- 2. CREATE experiences TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS experiences (
  exp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
  company TEXT,
  title TEXT,
  description TEXT,
  location TEXT,
  start_date DATE,
  end_date DATE,
  sort_index INTEGER DEFAULT 0,
  company_industry TEXT,
  company_size TEXT,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE experiences IS 'Work experience records for alumni';
COMMENT ON COLUMN experiences.company IS 'Company name';
COMMENT ON COLUMN experiences.title IS 'Job title';
COMMENT ON COLUMN experiences.description IS 'Job description';
COMMENT ON COLUMN experiences.location IS 'Job location';
COMMENT ON COLUMN experiences.sort_index IS 'Order of experience (0 = most recent)';
COMMENT ON COLUMN experiences.company_industry IS 'Industry of the company';
COMMENT ON COLUMN experiences.company_size IS 'Company size range (e.g., "11-50", "1001-5000")';
COMMENT ON COLUMN experiences.is_current IS 'Whether this is the current job';

CREATE INDEX IF NOT EXISTS idx_experiences_person_id ON experiences(person_id);
CREATE INDEX IF NOT EXISTS idx_experiences_is_current ON experiences(person_id) WHERE is_current = TRUE;

-- ============================================================================
-- 3. CREATE educations TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS educations (
  edu_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
  school TEXT,
  degree TEXT,
  field TEXT,
  description TEXT,
  start_year INTEGER,
  end_year INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE educations IS 'Education records for alumni';
COMMENT ON COLUMN educations.school IS 'School/university name';
COMMENT ON COLUMN educations.degree IS 'Degree type (e.g., "MBA", "Bachelor''s degree")';
COMMENT ON COLUMN educations.field IS 'Field of study';

CREATE INDEX IF NOT EXISTS idx_educations_person_id ON educations(person_id);

-- ============================================================================
-- 4. CREATE skills TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS skills (
  skill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(person_id, skill_name)
);

COMMENT ON TABLE skills IS 'Skills for each person, extracted from LinkedIn profiles';
COMMENT ON COLUMN skills.skill_name IS 'Name of the skill (e.g., "Python", "Venture Capital")';

CREATE INDEX IF NOT EXISTS idx_skills_person_id ON skills(person_id);
CREATE INDEX IF NOT EXISTS idx_skills_skill_name ON skills(skill_name);

-- ============================================================================
-- 5. CREATE chunks TABLE (for semantic search)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
  chunk_type TEXT NOT NULL,
  text_raw TEXT NOT NULL,
  text_norm TEXT,
  text_hash TEXT NOT NULL,
  source_id UUID,
  embedding vector(2000),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE chunks IS 'Text chunks for semantic search with embeddings';
COMMENT ON COLUMN chunks.chunk_type IS 'Type of chunk: about, work, edu, skills';
COMMENT ON COLUMN chunks.text_raw IS 'Original text content';
COMMENT ON COLUMN chunks.text_norm IS 'Normalized text (lowercase, trimmed)';
COMMENT ON COLUMN chunks.text_hash IS 'SHA256 hash of text for deduplication';
COMMENT ON COLUMN chunks.embedding IS 'OpenAI text-embedding-3-large vector (2000 dimensions)';

CREATE INDEX IF NOT EXISTS idx_chunks_person_id ON chunks(person_id);
CREATE INDEX IF NOT EXISTS idx_chunks_chunk_type ON chunks(chunk_type);

-- HNSW vector index for fast semantic search (2000 dimensions to fit within limit)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- 6. CREATE search_chunks RPC FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding vector(2000),
  match_count int DEFAULT 200
)
RETURNS TABLE (
  chunk_id uuid,
  person_id uuid,
  chunk_type text,
  text_raw text,
  text_norm text,
  similarity float8
)
LANGUAGE sql STABLE
AS $$
  SELECT
    chunk_id,
    person_id,
    chunk_type,
    text_raw,
    text_norm,
    1 - (embedding <=> query_embedding) as similarity
  FROM chunks
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION search_chunks IS 'Performs vector similarity search on chunks using text-embedding-3-large (2000 dimensions). Returns top N most similar chunks with similarity scores.';
