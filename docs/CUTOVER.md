# Production cut-over checklist

Everything built in Phase 1 is deployed next to the live system, not in place of it. Production users are still on the
`search` edge function and the currently deployed frontend. This file lists what Vincent needs to do to switch over.
Nothing here has been done.

## State before cut-over

| Piece | Live (v1) | New (v2) |
|---|---|---|
| Edge function | `search` (unchanged apart from query logging) | `search-v2` (deployed) |
| Frontend | deployed build from `main` | `enhancements` branch, points at `search-v2` by default |
| Database | `people`, `experiences`, `educations`, `skills`, `chunks`, `search_chunks()` | adds `companies`, `schools`, `experience_facts`, `education_facts`, `person_facts`, `person_search`, `chunk_vectors`, `search_logs`, and the `v2_*` functions |
| Secrets | `OPENAI_API_KEY` (old account) | `OPENAI_API_KEY_V2` (new account), `COHERE_API_KEY` |

## Steps

1. **Review** `eval/scorecards/` (baseline vs final) and try the app locally: `npm run dev` on `enhancements`.
2. **Decide which OpenAI account pays for production.** `search-v2` reads `OPENAI_API_KEY_V2` first and falls back to
   `OPENAI_API_KEY`. Either keep both, or set one key and remove the other:
   `supabase secrets set OPENAI_API_KEY_V2=<key>`.
3. **Merge** `enhancements` into `main` and deploy the frontend the way you normally do. That is the cut-over: the
   frontend calls `search-v2`. To roll back, set `VITE_SEARCH_FUNCTION=search` in the frontend build environment
   (v1 keeps working because nothing it uses was changed).
4. **After a few days without problems, clean up:**
   - Delete dead functions: `supabase functions delete semantic-search` and `supabase functions delete search-eval`;
     remove their folders and their `supabase/config.toml` entries. Optionally delete `search` as well.
   - Drop what only v1 used (frees roughly 260 MB of the 500 MB free tier):
     ```sql
     DROP FUNCTION IF EXISTS search_chunks(vector, int);
     DROP FUNCTION IF EXISTS v2_search_chunks_exact(vector, int);
     DROP FUNCTION IF EXISTS query_alumni_with_similarity(vector);
     DROP INDEX IF EXISTS idx_chunks_embedding;          -- 118 MB HNSW index
     ALTER TABLE chunks DROP COLUMN embedding;           -- ~100 MB; chunk_vectors holds the copy v2 uses
     ```
     Only drop `chunks.embedding` once you are sure you will not roll back. The legacy tables
     (`"LTV Alumni Database Enriched with Embeddings"`, `*_fall2024`, etc.) also look unused.
5. **Close the direct-read hole (recommended regardless of cut-over).** Row-level security is off on the alumni tables,
   so the public anon key can read every row, including emails, straight from the REST API. The frontend never reads
   tables directly (only edge functions, which use the service role), so this should not affect the app:
   ```sql
   ALTER TABLE people ENABLE ROW LEVEL SECURITY;
   ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
   ALTER TABLE educations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
   ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON TABLE people, experiences, educations, skills, chunks FROM anon, authenticated;
   -- and the same for the legacy tables if you keep them
   ```
   Keep the `keep_alive` table's policies as they are (the GitHub keep-alive workflow uses the anon key on it).
   Note also that the search functions themselves are callable with only the anon key; the password gate is enforced
   in the browser, not on the server.

## Explore agent (Phase 2)

The Explore page and its backend (`agent/`) are built but **have not been run end to end with the model**: the
Anthropic account ran out of credit during Phase 1 evaluation. The tool layer is tested against the live database
(`npm run test:tools` in `agent/`), and the server, streaming and UI are verified up to the model call.

To finish and launch it:
1. Add credit to the Anthropic account whose key is in `supabase/.env`.
2. `cd agent && npm install && npm start`, then `npm run eval` in a second terminal. Review the results and try
   `/explore` locally (`npm run dev` at the repo root).
3. Decide hosting and authentication for the backend (see "Not done here" in `agent/README.md`).
4. Build the frontend with `VITE_EXPLORE_API=<backend URL>`. Without that variable a production build hides the
   Explore button, so merging `enhancements` does not expose a broken page.
5. Model and cost: the default model is `claude-opus-5-5`; each message is capped at $0.75. Set `EXPLORE_MODEL`
   to a cheaper model if cost per question matters more than answer quality, and rerun the eval.

## Refreshing data later

When alumni are added or re-scraped, after loading `people` / `experiences` / `educations` / `skills` / `chunks`:

```bash
cd scripts/enrichment
python3 01_classify_titles.py            # labels new job titles only
python3 01b_classify_investor_firms.py   # labels new investment firms only
python3 02_classify_people.py            # labels new people only
python3 03_derive_facts.py               # rebuilds all structured facts
python3 04_build_person_search.py        # rebuilds documents; re-embeds only changed ones
```
`03_derive_facts.py` also refreshes the helper data (normalised company names, the schools list, the compact chunk vectors) by calling `v2_refresh_helpers()`.
