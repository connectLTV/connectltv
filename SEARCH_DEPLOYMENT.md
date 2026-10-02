# Search: architecture and deployment

Two search functions are deployed. Production still uses v1 until the cut-over in `docs/CUTOVER.md`.

| Function | Status | Notes |
|---|---|---|
| `search` | live (v1) | Vector search over chunks + GPT rerank. Unchanged apart from query logging. |
| `search-v2` | deployed, used by the `enhancements` frontend | Structured filters + hybrid retrieval. Described below. |
| `search-eval` | eval only | Copy of v1 that reports where expected people are lost. |
| `semantic-search` | dead | Original MVP function; delete at cut-over. |

## search-v2 pipeline

```
query
  |-- translate (gpt-4.1-mini): filters + "complete" flag + semantic text + keywords     } in parallel
  |-- embed (text-embedding-3-large, 800 dims)                                           }
  v
route
  structured (filters cover the whole request)
      v2_structured_search(filters) -> every match, richest profiles first, no LLM
  hybrid / semantic
      v2_hybrid_search(embedding, keywords, filters)
          SQL prefilter -> best-chunk similarity + profile-document similarity + keyword rank,
          fused per person with reciprocal rank fusion (exact scan, no ANN index)
      optional Cohere rerank (off by default)
      LLM judges relevance and writes explanations, in rank order, in concurrent batches;
      keeps going while batches are still mostly relevant (up to 180 people judged)
  v
SSE events: start, result (one per person), complete, error   (same contract as v1)
```

Key files:
- `supabase/functions/search-v2/index.ts` — pipeline
- `supabase/functions/search-v2/translate.ts` — translation prompt, sanitiser, keyword query builder
- `supabase/migrations/2026100200000*` — tables and SQL functions
- `scripts/enrichment/` — builds the structured facts and search documents
- `eval/` — eval harness; `docs/benchmarks/` — benchmark write-ups

## Data model added for v2

| Table | Purpose |
|---|---|
| `companies`, `schools` | Canonical names and aliases (merges e.g. the BCG name variants), size bucket, industry group |
| `experience_facts` | Per role: function, seniority, role type, founder / investing flags, investor type, timing relative to HBS |
| `education_facts` | Per degree: canonical school, degree level, major category |
| `person_facts` | Per person: founder / investor flags, career archetypes, geography, sector tags, richness score, ... |
| `person_search` | One document per person: keyword index, embedding, ready-to-return result card |
| `chunk_vectors` | Compact half-precision copy of chunk embeddings for fast exact scans |
| `search_logs` | One row per search (query, route, counts, timings; no user identity) |

All new tables have row-level security on with no anon access; edge functions use the service role.

## Deploying

```bash
supabase db push                      # apply migrations
supabase functions deploy search-v2
```

Secrets (`supabase secrets list`): `OPENAI_API_KEY_V2` (falls back to `OPENAI_API_KEY`), `COHERE_API_KEY` (only used
when the reranker is switched on), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `SEARCH_RERANKER=cohere`.

## Testing

```bash
python3 eval/query.py "climate tech founders"            # one query with routing and timing breakdown
python3 eval/translation_eval.py                         # translation only (cheap)
python3 eval/run_eval.py --target search-v2 --label my-change --judge
python3 eval/inspect_run.py my-change                    # cases that still miss or over-return
```

Scorecards are written to `eval/scorecards/`. Raw runs (`eval/runs/`) and data caches are gitignored because they
contain alumni data.

## Performance and cost (eval suite, 131 queries)

| | v1 baseline | search-v2 |
|---|---|---|
| Time to first result, median / p95 | 1.8 s / 2.6 s | 1.2 s / 3.2 s |
| Total time, median / p95 | 3.3 s / 13.3 s | 1.3 s / 7.0 s |
| Mean LLM cost per query | $0.0036 | $0.0021 |

Structured queries are fastest (about 1 s, a fraction of a cent). Topic queries take about 3.5 s to the first result
and cost 1-3 cents when many people are judged.

The first search after a quiet period can be several seconds slower while the database reads the vector table from
disk; the landing page sends a warm-up request to hide this.

## Refreshing data

See "Refreshing data later" in `docs/CUTOVER.md`.
