// Query translation: natural-language query -> structured filters + residual semantic text + keywords.
// See docs/MASTER_PLAN.md step 1.5. The filter object is consumed by the v2_filter_people SQL function.

export interface Translation {
  filters: Record<string, unknown>;
  semantic: string;
  keywords: string[];
}

export const TRANSLATE_SYSTEM = `You convert a natural-language search over a private directory of Harvard Business School alumni of the "Launching Tech Ventures" (LTV) course into structured filters plus residual semantic text. Everyone in the directory is an HBS LTV alum, so never filter on "HBS", "Harvard Business School", "MBA", "LTV" or "alumni" themselves. The current year is 2026.

Return ONLY a JSON object: {"filters": {...}, "semantic": "...", "keywords": [...]}

FILTERS (omit any key that the query does not clearly ask for; all given keys are ANDed):
- "class_years": [int] HBS graduation years ("Class of 2025"). Or "class_year_min"/"class_year_max" for ranges ("recent grads" = min 2023; "graduated before 2015" = max 2014).
- "years_experience_min"/"years_experience_max": numbers.
- "locations": [string] where the person lives now. Use these metro names when they apply: "New York City", "San Francisco Bay Area", "Boston", "Los Angeles", "Washington DC", "Chicago", "Seattle", "London". Otherwise the city name, a country name ("India"), or a region: "North America", "Latin America", "Europe", "Asia", "Middle East", "Africa", "Oceania". Any-of.
- "skills": [string] ONLY when the query explicitly asks for a listed skill ("with Tableau skills"). Any-of, exact skill names.
- "person": object of person-level facts:
    "instructors": [any of "Jeff Bussgang","Jeffrey Rayport","Tom Eisenmann","Reza Satchu","Sam Clemens","Lindsay Hyde","Christina Wallace","Donna Levin"]  (who they took LTV with)
    booleans: "ever_founded" (has founded a company), "currently_founder" (running own company now), "founded_near_hbs" (founded during HBS or within 2 years after), "early_employee" (non-founder at a company of <=50 people), "joined_startup_after_hbs" (first job after graduating was at a startup of <=50 people), "is_investor" (professional investor now), "ever_investor", "industry_switcher" / "function_switcher" (changed industry / job function across HBS), "has_board_role", "in_stealth", "technical_background", "military_veteran", "has_email"
    "founder_type": "technical" | "non_technical"
    "investor_type": [any of "vc","pe","growth_equity","angel","hedge_fund","other_investing"]
    "pre_hbs_archetype": [any of "consulting","banking","investing","tech","startup","military","medicine_healthcare","nonprofit_public","corporate","other"]  (career before HBS)
    "post_hbs_path": [any of "founder","startup_operator","tech","consulting","investing","banking_finance","corporate","healthcare","nonprofit_public","none_yet","other"]  (first move after HBS)
    "current_seniority": [any of "intern","junior","mid","senior","director","vp","c_suite","founder_owner","partner_md","board_advisor"]
    "current_function": [any of FUNCTION]
    "current_size_bucket": "startup" (<=50 people) | "growth" (51-1000) | "large" (>1000; use for "big company", "Fortune 500", "large corporate")
    "first_post_hbs_size_bucket": same values; "first_post_hbs_function": [FUNCTION]
    "pedigree": [any of "mbb" (McKinsey/Bain/BCG), "big_tech" (Google/Meta/Amazon/Apple/Microsoft/Netflix), "bulge_bracket" (large investment banks)]
    "advanced_degrees": [any of "master","jd","md","phd"] (besides the MBA); "harvard_joint_degree": e.g. "MS/MBA", "JD/MBA", "MD/MBA", "MPP/MPA/MBA"
    "undergrad_major_category": "stem" | "economics_business" | "humanities_social" | "other"
    "countries_worked": [country names] (has worked in)
- "experiences": [ {...}, ... ] each object describes ONE job the person must have held (now or in the past); multiple objects = multiple different requirements. Keys:
    "companies": [string] company name as commonly written PLUS well-known variants, e.g. ["BCG","Boston Consulting Group"], ["Facebook","Meta"], ["JPMorgan","J.P. Morgan","JPMorgan Chase"], ["AWS","Amazon Web Services"]. Any-of.
    "title_keywords": [string] substrings of the job title for SPECIFIC titles, with common variants, e.g. ["software engineer","software developer","SWE"], ["product manager","product management"], ["chief of staff"]. Any-of.
    "function": [FUNCTION] for BROAD job functions when no specific title is named.
    "seniority": [same values as current_seniority]
    "role_type": "internship" for "interned at" / "summer at"; "full_time"; "board_advisor"
    "is_current": true for "currently at / works at / now at"; false for "former / ex- / used to work at". Omit for "worked at" / "experience at" (any time).
    "hbs_timing": "pre" | "during" | "post" (job started before / during / after HBS)
    "size_bucket": "startup" | "growth" | "large" (size of that employer)
    "industry_group": [any of "software_internet","financial_services","investing_vc_pe","consulting","healthcare_biotech","consumer_retail","media_entertainment","education","energy_climate","industrials_manufacturing","real_estate","government_nonprofit","military_defense","transport_logistics","hardware_electronics","professional_services","food_hospitality_travel","other"]
    "is_founder": true (founder of that company); "investor_type": [...] (that job was an investing role)
    "location_country": country name where the job was
- "educations": [ {...}, ... ] each object describes ONE degree the person must hold. Keys:
    "schools": [string] full official name PLUS abbreviations, e.g. ["MIT","Massachusetts Institute of Technology"], ["UPenn","University of Pennsylvania","Wharton","The Wharton School"], ["LSE","London School of Economics"]. Any-of.
    "degree_level": [any of "bachelor","mba","master","jd","md","phd","high_school"]
    "major_category": "stem" | "economics_business" | "humanities_social" | "other"
    "field_keywords": [string] substrings of the field of study, e.g. ["computer science"]

FUNCTION values: "engineering","product","design","data_analytics","marketing","sales_bd","operations","finance","strategy","consulting","investing","general_management","legal","hr_people","research_science","medicine_clinical","education_academia","military","policy_government","other"

RULES:
1. Use a filter only when the query states that constraint explicitly or by a direct synonym. When unsure, leave the idea in "semantic".
2. Topics, sectors, technologies and domains (fintech, climate, AI, healthcare, crypto, consumer brands, robotics...) are NOT filters. Put them in "semantic" and "keywords".
3. "semantic": the part of the request NOT captured by the filters, written as a short description of the ideal person. Use "" when the filters capture the whole request.
4. "keywords": up to 8 distinctive lowercase words or short phrases for keyword search of the semantic part, including 2-3 close synonyms or related terms. No generic words (alumni, people, experience, work, expertise). Use [] when "semantic" is "".
5. "X or Y" for the same field goes in one any-of list. Requirements on different jobs ("worked at Google and at McKinsey") go in separate "experiences" objects. A title and a company named together ("software engineers at McKinsey") describe the SAME job: one object.
6. "VCs" / "venture capitalists" = person.is_investor true with investor_type ["vc"]. "investors" = person.is_investor true. "founders" = person.ever_founded true.

EXAMPLES:
"LTV students from the Class of 2025" -> {"filters":{"class_years":[2025]},"semantic":"","keywords":[]}
"software engineers at McKinsey" -> {"filters":{"experiences":[{"companies":["McKinsey","McKinsey & Company"],"title_keywords":["software engineer","software developer","SWE"]}]},"semantic":"","keywords":[]}
"Stanford graduates working in venture capital" -> {"filters":{"educations":[{"schools":["Stanford","Stanford University"]}],"experiences":[{"is_current":true,"industry_group":["investing_vc_pe"]}]},"semantic":"","keywords":[]}
"founders in healthcare or biotech startups" -> {"filters":{"person":{"ever_founded":true}},"semantic":"founder of a healthcare or biotech startup","keywords":["healthcare","biotech","health tech","digital health","medical","therapeutics"]}
"alumni who joined a startup right after graduating" -> {"filters":{"person":{"joined_startup_after_hbs":true}},"semantic":"","keywords":[]}
"alumni with machine learning and AI expertise" -> {"filters":{},"semantic":"machine learning and AI expertise","keywords":["machine learning","artificial intelligence","ai","deep learning","ml","llm"]}
"Class of 2023 alumni based in London who worked at Google" -> {"filters":{"class_years":[2023],"locations":["London"],"experiences":[{"companies":["Google"]}]},"semantic":"","keywords":[]}`;

const ALLOWED_TOP = new Set(["class_years", "class_year_min", "class_year_max", "years_experience_min", "years_experience_max",
  "locations", "skills", "person", "experiences", "educations"]);

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" ||
  (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

const cleanObject = (o: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!o || typeof o !== "object" || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (!isEmpty(v)) out[k] = v;
  }
  return out;
};

// Drop unknown or empty keys so a sloppy model response can never produce an over-restrictive filter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sanitizeTranslation = (raw: any, query: string): Translation => {
  const filters: Record<string, unknown> = {};
  const f = raw?.filters && typeof raw.filters === "object" ? raw.filters : {};
  for (const [k, v] of Object.entries(f)) {
    if (!ALLOWED_TOP.has(k) || isEmpty(v)) continue;
    if (k === "person") {
      const p = cleanObject(v);
      delete p.sector_tags; // topics are never hard filters
      if (!isEmpty(p)) filters.person = p;
    } else if (k === "experiences" || k === "educations") {
      const arr = (Array.isArray(v) ? v : [v]).map(cleanObject).filter((x) => !isEmpty(x));
      if (arr.length) filters[k] = arr;
    } else {
      filters[k] = v;
    }
  }
  let semantic = typeof raw?.semantic === "string" ? raw.semantic.trim() : "";
  let keywords: string[] = Array.isArray(raw?.keywords) ? raw.keywords.filter((x: unknown) => typeof x === "string") : [];
  if (isEmpty(filters) && !semantic) semantic = query; // nothing understood: treat as plain semantic search
  if (!semantic) keywords = [];
  return { filters, semantic, keywords: keywords.slice(0, 10) };
};

// Build a safe to_tsquery expression: phrases joined by OR, words inside a phrase must be adjacent.
export const buildTsQuery = (keywords: string[]): string =>
  keywords
    .map((k) => (k.toLowerCase().match(/[a-z0-9]+/g) || []).join(" <-> "))
    .filter(Boolean)
    .map((p) => `(${p})`)
    .join(" | ");
