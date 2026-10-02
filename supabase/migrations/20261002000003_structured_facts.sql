-- Structured enrichment (MASTER_PLAN step 1.4). All new tables; nothing used by the v1 search is altered.
-- Kept in separate tables (not new columns on people/experiences) because v1 does select('*') on those.

CREATE TABLE IF NOT EXISTS companies (
  company_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_key TEXT NOT NULL UNIQUE,          -- 'li:<linkedin company id>' or 'name:<normalised name>'
  canonical_name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  size TEXT,                                 -- LinkedIn size range as of the scrape (today's size, not size at join)
  size_bucket TEXT,                          -- startup (<=50) | growth (51-1000) | large (>1000)
  industry TEXT,
  industry_group TEXT,
  website TEXT,
  pedigree_group TEXT,                       -- mbb | big_tech | bulge_bracket
  people_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS experience_facts (
  exp_id UUID PRIMARY KEY REFERENCES experiences(exp_id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES companies(company_id),
  function TEXT,
  seniority TEXT,
  role_type TEXT,                            -- full_time | internship | board_advisor | part_time_side | student_activity | volunteer
  is_founder BOOLEAN NOT NULL DEFAULT FALSE,
  is_founding_team BOOLEAN NOT NULL DEFAULT FALSE,
  investor_type TEXT,                        -- vc | pe | growth_equity | angel | hedge_fund | other_investing | NULL
  hbs_timing TEXT,                           -- pre | during | post
  is_first_post_hbs BOOLEAN NOT NULL DEFAULT FALSE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  location_country TEXT,
  employment_type TEXT,
  is_stealth BOOLEAN NOT NULL DEFAULT FALSE,
  industry_group TEXT,
  size_bucket TEXT
);
CREATE INDEX IF NOT EXISTS idx_experience_facts_person ON experience_facts(person_id);
CREATE INDEX IF NOT EXISTS idx_experience_facts_company ON experience_facts(company_id);
CREATE INDEX IF NOT EXISTS idx_experience_facts_function ON experience_facts(function);

CREATE TABLE IF NOT EXISTS education_facts (
  edu_id UUID PRIMARY KEY REFERENCES educations(edu_id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
  school_canonical TEXT,
  degree_level TEXT,                         -- bachelor | mba | master | jd | md | phd | high_school | other
  major_category TEXT,                       -- stem | economics_business | humanities_social | other
  is_harvard BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_education_facts_person ON education_facts(person_id);
CREATE INDEX IF NOT EXISTS idx_education_facts_school ON education_facts(school_canonical);

CREATE TABLE IF NOT EXISTS person_facts (
  person_id UUID PRIMARY KEY REFERENCES people(person_id) ON DELETE CASCADE,
  -- LTV
  instructors TEXT[] NOT NULL DEFAULT '{}',
  -- Geography
  metro TEXT,
  country TEXT,
  region TEXT,
  countries_worked TEXT[] NOT NULL DEFAULT '{}',
  -- Outreach
  has_email BOOLEAN NOT NULL DEFAULT FALSE,
  -- Founder and startup
  ever_founded BOOLEAN NOT NULL DEFAULT FALSE,
  currently_founder BOOLEAN NOT NULL DEFAULT FALSE,
  companies_founded_count INTEGER NOT NULL DEFAULT 0,
  founded_near_hbs BOOLEAN NOT NULL DEFAULT FALSE,   -- founded during HBS or within 2 years after
  early_employee BOOLEAN NOT NULL DEFAULT FALSE,     -- non-founder full-time role at a company of <=50 people, or a founding-team title
  founder_type TEXT,                                 -- technical | non_technical
  joined_startup_after_hbs BOOLEAN NOT NULL DEFAULT FALSE,
  -- Investor
  is_investor BOOLEAN NOT NULL DEFAULT FALSE,        -- current investing role
  ever_investor BOOLEAN NOT NULL DEFAULT FALSE,
  investor_type TEXT,
  -- Career shape
  pre_hbs_archetype TEXT,
  post_hbs_path TEXT,
  industry_switcher BOOLEAN,
  function_switcher BOOLEAN,
  years_experience NUMERIC,
  current_seniority TEXT,
  current_function TEXT,
  pedigree TEXT[] NOT NULL DEFAULT '{}',
  -- Role flags
  has_board_role BOOLEAN NOT NULL DEFAULT FALSE,
  in_stealth BOOLEAN NOT NULL DEFAULT FALSE,
  -- Company
  current_company_id BIGINT REFERENCES companies(company_id),
  current_size_bucket TEXT,
  current_industry_group TEXT,
  first_post_hbs_company_id BIGINT REFERENCES companies(company_id),
  first_post_hbs_size_bucket TEXT,
  first_post_hbs_function TEXT,
  -- Topics
  sector_tags TEXT[] NOT NULL DEFAULT '{}',
  -- Education
  undergrad_school TEXT,
  undergrad_major_category TEXT,
  advanced_degrees TEXT[] NOT NULL DEFAULT '{}',
  harvard_joint_degree TEXT,
  -- Background
  technical_background BOOLEAN NOT NULL DEFAULT FALSE,
  military_veteran BOOLEAN NOT NULL DEFAULT FALSE,
  -- Ordering for purely structured queries
  richness_score INTEGER NOT NULL DEFAULT 0,
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_person_facts_sector_tags ON person_facts USING gin (sector_tags);
CREATE INDEX IF NOT EXISTS idx_person_facts_instructors ON person_facts USING gin (instructors);
CREATE INDEX IF NOT EXISTS idx_person_facts_metro ON person_facts(metro);

-- Service role only: edge functions read these; the public anon key must not.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE companies, experience_facts, education_facts, person_facts FROM anon, authenticated;
