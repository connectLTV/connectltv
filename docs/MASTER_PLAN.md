# ConnectLTV Master Plan: Retrieval Overhaul and Explore Agent

Status: agreed with Vincent on 2026-10-02. This file is the source of truth for scope and decisions.
Tick boxes as work completes. Record deviations in the "Change log" at the bottom rather than silently editing decisions.

Companion file: `docs/structured-fields-backlog.md` (fields deliberately deferred).

---

## 1. Why we are doing this

User feedback on the current version (commit "MVP Optimization"):

1. Results feel incomplete. "Class of 2025" returned ~25 people when the class is far larger.
2. Categories such as "startups" vs "Fortune 500" cannot be searched or filtered. Use case: alumni who joined startups right after graduation.
3. Users want to browse and discover without a specific query.
4. Vincent has personally seen known matches go missing. Canonical example: Vincent Huang does not appear for "software engineers at McKinsey", although he is the only person in the data with an engineering title at McKinsey.

Decisions on how to respond:

- Items 1, 2, 4: overhaul retrieval (Phase 1).
- Item 3: do NOT ship a browsable full list (confidentiality). Instead build a separate Explore agent using the Claude Agent SDK (Phase 2) that can explore themes and trends.
- Sequence: retrieval first, agent later. The agent consumes the retrieval and structured layers as tools.

## 2. Verified facts about the current system (as of 2026-10-02)

### Locations
- Repo: `/Users/vincenthuang/Documents/connectLTV-project/connectltv` (branch `main`, PR-per-feature history).
- Data pipeline (NOT in git): `/Users/vincenthuang/Documents/connectLTV-project/proxycurl_enrichment/`
  - Raw LinkedIn scrape: `apify_results/apify_linkedin_results.json` and `apify_linkedin_results_spring_2025.json` (scraped Dec 2025 / Jan 2026).
  - Loader: `upload_apify_to_supabase.py` (`create_chunks()` at ~line 280). Embeddings: `generate_embeddings.py` (800 dims).
  - Source CSVs: `LTV Alumni_One Sheet_Final.csv`, `LTV Alumni_Spring 2025_Final.csv` (columns: User_ID, Last Name, First Name, Title, Company, Location, LinkedIn URL, Email Address, Class Year, LTV Instructor(s), LinkedIn URL Clean).
  - Has a `venv/`.
- Credentials (never print or commit values):
  - `proxycurl_enrichment/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `COHERE_API_KEY`. All tested working 2026-10-02.
  - `connectltv/supabase/.env`: also has `COHERE_API_KEY` (tested working).
  - Cohere key is a trial key (rate-limited). A production key plus `supabase secrets set COHERE_API_KEY=...` is needed only if the reranker is adopted.
- Supabase project ref: `bcpwjwfubnpchoscvrum`. Edge functions: `search` (live), `semantic-search` (dead v1 code, still deployed), `validate-password`. `verify_jwt = false` for search functions.

### Data volumes in production
- people 2,128 · experiences 19,671 · educations 6,379 · skills 11,548 · chunks 31,055.
- Embeddings: `text-embedding-3-large` truncated to 800 dims (confirmed in prod).
- The CSVs have ~2,380 rows. The gap is alumni whose LinkedIn scrape failed. DECISION: those people are excluded; the 2,128 in the DB are the population. Eval ground truth is computed from the DB, not the CSVs.

### Coverage in the raw scrape
- Per experience: `companyIndustry` 90%, `companySize` 90%, `jobStartedOn` 100%, `jobEndedOn` 84%, `jobDescription` 53%, `jobLocation` 68%, `employmentType` 32%, `companyWebsite` 93%. Also `jobLocationCountry`, `jobStillWorking`.
- Per person: `about` 44%, current `companyIndustry` 79%, `headline` 92%, skills 81%, educations 92%.
- `companySize` values: `0-1`, `2-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001-5000`, `5001-10000`, `10001-0` (means 10,001+).
- Company names are not canonical (e.g. "Boston Consulting Group (BCG)" 116 people and "The Boston Consulting Group" 63).

### Current pipeline (`supabase/functions/search/index.ts`)
query -> embed (800 dims) -> `search_chunks` RPC, top 200 chunks globally (HNSW) -> aggregate per person (`0.80*max + 0.20*mean(top 3)`, skills chunks weighted 0.5) -> top 50 people -> drop score < 0.35 -> GPT `gpt-4.1-mini` rerank, streamed, max 30, returns `{person_id, why_relevant}` -> SSE events `start` / `result` / `complete` / `error` to the client (`src/services/alumniService.ts`, `src/pages/ResultsPage.tsx`).

Chunk types: `about` (summary; plus a current-role synthesis chunk), `work` (one per experience), `edu` (one per education), `skills` (all concatenated).

### Diagnosed defects
0. **(Found during execution) HNSW row cap:** pgvector HNSW returns at most `hnsw.ef_search` (default 40) rows regardless of LIMIT. v1's "top 200 chunks" is really ~40 chunks, i.e. 30-40 people per query. This is the single biggest cause of missed matches. See `docs/benchmarks/embedding-benchmark.md`.
1. Structured attributes are routed through vectors. `class_year` and `section` appear in no chunk text, so class-year queries retrieve arbitrary chunks. Biggest issue.
2. Funnel too narrow: global top-200 chunks -> 50 people -> max 30. Verbose profiles crowd out sparse ones. Hard ceiling of 30 on every query.
3. Thin chunks: many work chunks are just "Title at Company (Industry)". No person-level document, so cross-chunk queries (school + job) have nothing to match.
4. Dense-only retrieval; no keyword channel for exact tokens (company names, rare terms).
5. Scoring blend and 0.35 floor are uncalibrated.
6. 800 dims: probably a minor loss; to be measured.
7. Repo drift: committed migration declares `vector(2000)` and `search_chunks(vector(2000))`; production is 800.
8. `extractFunction` in `src/services/alumniService.ts` substring-matches keywords: "cto" matches "Dire**cto**r" (all Directors become Engineering), "pm" matches "Develo**pm**ent".
9. No query logging exists (only `console.log`).
10. Supporting numbers for the canonical miss: 275 people have McKinsey experience, 138 have a software-engineer title, exactly 1 has both.

## 3. Standing decisions and constraints

- **Confidentiality:** no browsable full roster. Agent caps are enforced in the tool layer, never only in the prompt. Do not commit alumni PII to git (see eval storage rules).
- **Existing pages:** preserve Landing and Results pages as they are. No result-count or pagination redesign. Post-result filter dropdowns stay populated from the returned results (Vincent is happy with this). The only change: the Function filter reads stored values instead of `extractFunction`.
- **Streaming UX:** keep the current behaviour (results stream in with explanations; partial JSON handled). Explanations are NOT lazily generated per page.
- **Name lookup:** out of scope; do not build or evaluate it.
- **Vector DB:** stay on pgvector in Supabase. No dedicated vector DB.
- **Embedding dimension / index type:** decide by benchmark (step 1.3), not by assumption. Note pgvector HNSW caps at 2000 dims for `vector`, 4000 for `halfvec`.
- **Reranker:** Cohere is approved in principle; adopt only if the A/B eval shows a win (step 1.6).
- **Contextual chunking (prepending name/class to chunks):** dropped. Replaced by a person-level profile document.
- **Debug mode:** lives in a separate edge function `search-eval`, not in the live `search` function.
- **Query logging:** all queries in live production are saved (table `search_logs`: query text, timestamp, result count, latency, route taken; no user identity).
- **Explore agent UX:** an entirely new page/route, alongside search (not replacing it), carrying over the styling of the existing pages.
- **DB budget:** Supabase tier decision deferred until the benchmark reports quality per megabyte.
- **Data staleness:** scrape is from Dec 2025 / Jan 2026. A re-enrichment cadence is an open question (section 7).

### Result behaviour by query type (agreed)
| Query type | Example | Matching | Ordering | Explanations |
|---|---|---|---|---|
| Purely structured | "Class of 2025" | SQL filters, ALL matches returned, no LLM | Profile richness score, richest first (deterministic, stored per person) | None. Card falls back to experience summary / headline (already implemented in `transformResult`) |
| Hybrid | "Class of 2025 working in fintech" | SQL prefilter, then semantic retrieval within the filtered set | By the semantic part (reranker / LLM) | LLM, streamed |
| Purely semantic | "founders in climate tech" | Hybrid dense + keyword retrieval, uncapped funnel | Reranker / LLM | LLM, streamed |

- For large explained result sets, run explanation calls as parallel batches of ~50 people, each streaming into the page, so time to first result stays low. Tune batch size and any ceiling using eval latency/cost.
- The LLM (or reranker threshold) decides relevance for semantic/hybrid queries, but no fixed cap of 30. Cutoff is adaptive.

## 4. Working conventions for autonomous execution

- **Git:** all work is committed on the existing `enhancements` branch. Vincent has granted full authority to create commits. No other branches. Do not merge to `main`.
- **Isolation instead of sign-off gates (agreed 2026-10-02):** production users stay on the live `search` function and the deployed frontend. All new backend work is deployed under new names (`search-v2`, `search-eval`, new RPC names, new tables/columns). Frontend changes stay local on `enhancements`, pointed at the v2 backend. With that isolation, no sign-off is needed to proceed through the phases. The final production cut-over (merging, deploying the frontend, deleting old functions) is left for Vincent.
- **Shared-database rules (the DB is the one thing v1 and v2 share):**
  - Additive changes only: new tables, columns, RPCs, indexes. Never alter or drop objects the live `search` function uses (`search_chunks`, `chunks.embedding`, existing `people` / `experiences` / `educations` columns).
  - The remote has no migration history recorded and the local `20251228` migration is unapplied-as-far-as-the-CLI-knows. Run `supabase migration repair --status applied 20251228` BEFORE any `supabase db push`, or the old migration would be re-run against production.
  - Check database size before adding embeddings or large indexes; the free tier limit is 500MB and exceeding it would affect the live app.
  - Run backfills in small batches.
- **Only change to the live function:** query logging (step 1.1). Test the identical change in `search-eval` first, then deploy to `search`.
- Tooling verified 2026-10-02: supabase CLI 2.48.3 (logged in, linked, DB reachable), deno, node 22, gh (logged in), psql, docker. Use system `python3` (has supabase, openai, dotenv); the `proxycurl_enrichment/venv` is broken.
- New edge-function secrets (e.g. `COHERE_API_KEY`, `ANTHROPIC_API_KEY`) must be set with `supabase secrets set`; currently set: APP_PASSWORD, OPENAI_API_KEY, SUPABASE_*.
- Never print secret values. Never commit `.env` files.
- **Keys and budget (set 2026-10-02):**
  - OpenAI: new account with **$20 credit total (raised from $10 on 2026-10-02), which is the hard ceiling for now**. Same key in both `.env` files. Keep a running spend ledger in the change log (tokens x price per job). Stop and flag Vincent at about $16. Embed once at 3072 dims and truncate + renormalise for the 1536/800 benchmark variants rather than embedding three times. Keep eval reruns economical (cache embeddings, rerun only affected cases while iterating, full suite at milestones).
  - The Supabase secret `OPENAI_API_KEY` used by the live `search` function belongs to the OLD account; leave it alone. Give `search-v2` / `search-eval` their own secret (e.g. `OPENAI_API_KEY_V2`) set to the new key so all new spend lands on the capped account.
  - Anthropic: key in both `.env` files works **without** the `anthropic-workspace-id` header (the key is workspace-scoped; sending `ANTHROPIC_WORKSPACE_ID` as a header makes it fail with 401). May be used for classification/judging to relieve the OpenAI budget; keep usage modest and logged.
  - Cohere: production key in both `.env` files, tested working.
  - App password for local browser testing: a temporary comment on line 3 of `supabase/.env`. Never print or commit it.
- **Database tier:** stay on the free tier (500MB). Monitor size at each step that adds data; flag Vincent if an upgrade looks warranted, with what it would buy.
- New enrichment and eval scripts live in the repo (`scripts/`, `eval/`), reading credentials from the existing `.env` files. Raw data stays outside git.
- Human review steps (mined eval cases, LLM-judge spot checks) are asynchronous: proceed on best-effort ground truth, leave the list for Vincent, apply corrections when they arrive.
- Keep LLM and embedding spend sensible: batch, cache results in tables, and log token/cost totals for each batch job in the change log.
- Report outcomes honestly in scorecards, including regressions.

---

## 5. Phase 1: Retrieval

### Step 1.1 Query logging (live function)
- [x] Migration: `search_logs` table (id, created_at, query text, route, result_count, time_to_first_result_ms, total_ms, error). No user identity. RLS on; service role writes only.
- [x] Add a non-blocking insert to `supabase/functions/search/index.ts` (must never fail or slow a search).
- [x] Test the identical change in `search-eval` first, then deploy to live `search`.
- [x] Verify rows appear after a test query.

### Step 1.2 Eval harness and baseline
Purpose: turn "doesn't feel complete" into numbers, and prove later versions are better on the same queries.

- [x] Create `supabase/functions/search-eval/`: a copy of the current pipeline with debug output reporting, per candidate person, the stage at which they were lost: `not_in_top_200_chunks`, `cut_at_top_50`, `below_0.35`, `dropped_by_llm`, or `returned` (with rank). Deploy as a separate function; live `search` untouched.
- [x] `eval/` layout:
  - `eval/queries.jsonl`: `{id, query, type, failure_class, expected_person_ids, expected_count, notes}`. Use person_id UUIDs only, no names or emails.
  - `eval/run_eval.py`: target is selectable (`search`, `search-eval`, `search-v2`, or a local `supabase functions serve`). Runs each query 2-3 times.
  - `eval/runs/` raw outputs: **gitignored** (contain alumni data).
  - `eval/scorecards/<date>-<label>.md`: aggregate metrics only; committed.
- [x] Case types:
  - Enumerable (exact answer set from DB columns) -> recall, count accuracy.
  - Known-item (specific people who must appear) -> hit rate, rank.
  - Open-ended (no exact answer) -> LLM-judged precision, spot-checked by Vincent; judgments frozen and reused.
- [x] Mine failure candidates from the DB / raw scrape across these classes (Vincent wants variety, not only conjunctions; a significant share may be conjunctive):
  - Conjunctive (title x company, school x industry, class year x location) with small exactly-known answer sets. Seed: "software engineers at McKinsey" -> Vincent Huang.
  - Aliases and abbreviations (BCG / Boston Consulting Group, Meta / Facebook, VC / venture capital).
  - High-cardinality sets (e.g. McKinsey alumni: 275 true matches).
  - Rare terms (companies, schools, skills appearing 1-3 times).
  - Sparse profiles (no about, no descriptions): findable by the few facts they have?
  - Cross-chunk facts (school in one chunk, job in another).
  - Current vs past ("currently at Google" vs ex-Google, via `is_current`).
  - Skills-only queries (skills chunks are down-weighted).
  - Paraphrase ("people who started companies" -> founders).
  - Structured attributes invisible to vectors (class year, instructor, location-only).
  - NOT name lookup (out of scope).
- [ ] Run candidates against the current system; keep the failures plus a sample of passes (so the suite can detect regressions). Target roughly 60-100 cases total.
- [ ] Give Vincent the mined list to skim (regex-based ground truth is imperfect); apply his corrections.
- [ ] Metrics on every run:
  - Recall@10, @30, @all · known-item hit rate and rank · count accuracy (enumerable)
  - Precision (LLM-judged) on open-ended
  - **Time to first result** (request -> first complete `result` event) — headline metric
  - Total time · cost per query (tokens) · stability across repeated runs
  - Per-stage loss attribution (baseline only, via `search-eval`)
- [ ] Produce and commit the baseline scorecard `eval/scorecards/<date>-baseline.md`. Freeze it.

### Step 1.3 Embedding and index benchmark
- [x] Offline, embed the chunk corpus (or a large sample) at 800, 1536, 3072 dims (`text-embedding-3-large`).
- [x] Compare exact scan vs HNSW at each size: recall vs exact-3072 ground truth, eval-set recall, latency, storage (MB), including `halfvec`.
- [x] Deliver one table: recall x megabytes x latency per config, with a recommendation (expectation: at ~31k chunks, exact scan may be fast enough to drop HNSW entirely).
- [ ] Get Vincent's decision on dimension / index / Supabase tier if the recommendation needs more storage. If it fits the current tier, proceed.

### Step 1.4 Structured field enrichment (37 fields)
Rule used to choose: include what is derivable from data we already hold; defer what needs external data or leans on job descriptions (only 53% coverage).

- [ ] Schema migration (additive): new columns on `people` / `experiences` / `educations`, plus a `companies` table (canonical name, aliases, size, size bucket, industry) and FK from experiences. Index filterable columns.
- [ ] Enrichment scripts in `scripts/enrichment/` (idempotent, resumable, results cached in DB; LLM classification in batches with a fixed prompt and versioned label set).
- [ ] Fields:

| Area | Fields | Derivation |
|---|---|---|
| Founder and startup (6) | ever_founded; currently_founder; companies_founded_count; founded_during_or_within_2y_of_HBS; early_employee (joined a company with <=50 people); technical vs non-technical founder | Titles (LLM is_founder per role), dates vs class_year, company size, technical flag |
| Investor (2) | is_investor; investor_type (VC, PE, growth, angel) | LLM over titles + firm industry |
| Career shape (7) | pre_HBS_archetype (consulting, banking, tech, military, medicine, nonprofit, other); post_HBS_path; industry_switcher; function_switcher; years_experience; current_seniority; pedigree groups (MBB, big tech, bulge bracket) | LLM classification + date arithmetic + canonical company lists |
| Role (5) | function; seniority; internship vs full-time; board/advisor role; stealth | LLM per experience (title, company, description, employmentType) |
| Company (4) | size; industry; canonical name; size bucket (startup / growth / large) | Present in data + normalisation (merge aliases such as the two BCGs) |
| Topics (1) | sector tags (AI, climate, fintech, health, crypto, ...) multi-label | LLM over company, industry, description, about |
| Education (4) | undergrad school (canonical); major category (STEM, economics/business, humanities, other); other advanced degrees (JD, MD, PhD, MS); Harvard joint degree | Normalisation of education rows |
| Geography (3) | metro; country and region; countries worked in | Normalise `location`, `jobLocation`, `jobLocationCountry` |
| LTV (2) | instructor (exists as `section`); years since graduation | Present / arithmetic |
| Outreach (1) | has_email | Present |
| Background (2) | technical background; military veteran | LLM over roles, education, skills |

- [ ] Supporting derived fields needed by the above: each experience tagged pre-HBS / during / post-HBS; first post-HBS role per person; `is_current` verified.
- [ ] Profile richness score per person (has about, number of roles with descriptions, skills present, educations present) for ordering purely structured results.
- [ ] Known limitation to document: company size is today's size, not size when the person joined (accurate enough for recent grads; proper fix needs founded-year data, which is in the backlog).
- [ ] Validation: sample 50 people per LLM-classified field, check accuracy, report in change log; fix prompt if a field is below ~90%.
- [ ] Replace client-side `extractFunction`: the search response returns the stored function of the current role; the Function filter uses it. No visual change.
- [ ] Add enumerable eval cases for the new fields (e.g. "joined a startup right after graduation", "founders", "VCs", "career switchers into product").
- [ ] Keep `docs/structured-fields-backlog.md` current.

### Step 1.5 New retrieval pipeline (`search-v2`)
- [ ] **Query translation:** small fast LLM call with structured output -> `{filters: {...}, semantic_text, route}` over the filterable fields (class year, instructor, location/metro/country, current and past company (canonical), school, industry, size bucket, function, seniority, founder/investor flags, sector tags, current-vs-past, pre/post-HBS timing, etc.). Run in parallel with the query embedding call. Include alias handling (BCG, Meta/Facebook). Fallback if latency regresses: skip translation for queries with no structured-looking terms.
- [ ] **Routing** per the table in section 3 (purely structured / hybrid / purely semantic).
- [ ] **Person-level profile document** per person (headline, current role, role history summary, education, skills, sector tags; include name for keyword index). Embed it and keyword-index it. Solves cross-chunk queries.
- [ ] **Keyword channel:** generated `tsvector` columns + GIN indexes on chunk text and profile documents; trigram index on company names. Consider true BM25 only if evals show Postgres FTS ranking is the bottleneck.
- [ ] **Hybrid fusion:** new RPC(s) combining dense + keyword via reciprocal rank fusion, accepting an optional person-id / filter restriction.
- [ ] **Funnel restructure:** per-person retrieval instead of global top-200 chunks; remove the 0.35 floor; replace the fixed 50/30 caps with an adaptive cutoff; apply the embedding/index choice from step 1.3. Re-tune or replace the 0.80/0.20 scoring blend against the eval set.
- [ ] **Explanations and streaming:** keep the SSE event contract (`start`, `result`, `complete`, `error`) so the frontend barely changes; parallel batches of ~50 for large sets; purely structured results stream without `why_relevant`.
- [ ] Query logging in `search-v2` (same table, with route).
- [ ] Frontend: minimal changes only (function field from server; tolerate results without explanations — already handled by fallback).
- [ ] Run the eval suite after each sub-change; commit scorecards; iterate until: enumerable recall ~100% with correct counts, known-item hit rate well above baseline, precision not worse, time to first result not materially worse than baseline.

### Step 1.6 Cohere reranker A/B
- [ ] Variant A: LLM does relevance + ordering + explanation (as built in 1.5).
- [ ] Variant B: Cohere `rerank-v3.5` scores a wide candidate set (hundreds); threshold/ordering from reranker; LLM only writes explanations for returned results.
- [ ] Compare on the full suite: recall, precision, time to first result, total time, cost. Mind trial-key rate limits when running the suite.
- [ ] Recommend; if B wins, Vincent creates a production Cohere key and it is set as a Supabase secret.

### Step 1.7 Local frontend integration and cut-over preparation
- [ ] Point the local frontend (on `enhancements`) at `search-v2`; verify the existing pages behave as before.
- [ ] Present final scorecard vs baseline.
- [ ] Write `docs/CUTOVER.md`: the exact steps for Vincent to cut production over (deploy frontend, optionally promote `search-v2` to `search`, delete `semantic-search` and `search-eval`, set production secrets). Do NOT perform these.
- [ ] Reconcile migrations with production (fix the `vector(2000)` drift; ensure all new schema is captured in committed migrations).
- [ ] Update `CLAUDE.md` (gitignored), `README.md`, `SEARCH_DEPLOYMENT.md`, and `ConnectLTV Search Guide.md` + `PromptingGuide.tsx` (the "Limitations" section changes: company characteristics, career transitions, and current-vs-past become supported).
- [ ] Remove the hardcoded duplicate Supabase URL/anon key in `alumniService.ts` in favour of the shared client config (low priority tidy-up).

---

## 6. Phase 2: Explore agent (Claude Agent SDK)

Goal: let users explore themes and trends ("what are 2023 grads doing now?", "which sectors are founders clustering in?") without exposing a browsable roster.

### Step 2.1 Design (resolve open questions first, see section 7)
- [ ] Decide hosting for the agent backend (the Agent SDK needs a Node or Python runtime; Supabase Edge/Deno may not be suitable — evaluate and propose to Vincent).
- [x] Anthropic API key: working (see section 4; do not send the workspace header).
- [ ] Until production hosting is decided, run the agent backend locally alongside the local frontend.
- [ ] Use the latest Claude models; pick per cost/latency.

### Step 2.2 Tools (shared with the search layer)
- [ ] `search_alumni(filters, semantic_text, limit)` — wraps the Phase 1 pipeline.
- [ ] `count_alumni(filters)`.
- [ ] `aggregate(group_by, filters)` — counts/distributions by any structured field (industry, function, sector tag, size bucket, metro, class year, ...).
- [ ] `get_profile(person_id)`.
- [ ] **Enforce confidentiality in the tool layer:** hard cap on people returned per call and per conversation, aggregates preferred over lists, no bulk export, minimum group size for aggregates if needed. A prompt instruction is not a control.
- [ ] Rate limiting and logging of agent sessions/tool calls (no user identity beyond what exists).

### Step 2.3 Explore page
- [ ] New route (e.g. `/explore`) behind the same `PasswordGate`; entry point from the landing page that does not disturb the existing layout.
- [ ] Conversational UI with streaming; carry over existing styling: Harvard crimson theme, shadcn components, `AlumniCard` / `AlumniProfile` for any people surfaced.
- [ ] Existing search pages unchanged.

### Step 2.4 Agent evals
- [ ] Small eval set for the agent: aggregate questions with ground truth from the DB (counts, top-N distributions), plus checks that caps cannot be bypassed (attempts to dump the roster must fail).
- [ ] Latency and cost per session.

### Step 2.5 Launch
- [ ] Vincent sign-off, deploy, update the user guide.

---

## 7. Open questions (ask Vincent when reached; do not block earlier work)

1. (Resolved) Commits: full authority, all on `enhancements`.
2. (Resolved) Supabase tier: stay free, monitor, flag if an upgrade is warranted.
3. (Resolved) Cohere production key is in place.
4. Agent hosting and Anthropic API key — step 2.1.
5. Re-enrichment cadence for the LinkedIn data (currently Dec 2025 / Jan 2026).
6. Any ceiling on the number of explained results for very large semantic result sets — decide from eval latency/cost data.

## 8. Change log

### Findings needing Vincent's attention
- **RLS is off on the alumni tables** (`people`, `experiences`, `educations`, `skills`, `chunks` and the legacy tables). The public anon key (in the frontend bundle and the repo) can read every row, including emails, directly through the REST API, bypassing the password gate, and has write grants. The frontend never reads tables directly, so enabling RLS should not break the live app, but it is a change to live production that was not authorized, so it has NOT been made. Proposed fix is in `docs/CUTOVER.md`. All new tables created by this work have RLS on and no anon access.
- The live `search` function itself is callable by anyone holding the anon key (the password gate is client-side only).

### Spend ledger (OpenAI account ceiling: $20)
| Job | Cost |
|---|---|
| Chunk embeddings at 3072 dims for the benchmark | $0.18 |
| Title classification (13,174 title x industry pairs) | $0.58 |
| Baseline eval run (search-eval) | ~$1.0 |

### Log

- 2026-10-02: Plan created.
- 2026-10-02: Replaced the cut-over sign-off gate with isolation (v2-named backend, local-only frontend). All commits on `enhancements`.
- 2026-10-02: Keys verified (OpenAI new account, $10 ceiling; Cohere production; Anthropic works without workspace header). Free DB tier retained.
