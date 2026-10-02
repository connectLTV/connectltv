# Embedding dimension and index benchmark (step 1.3)

Run 2026-10-02. Scripts: `scripts/benchmark/embed_chunks.py`, `scripts/benchmark/dimension_benchmark.py`.
Corpus: 31,055 chunks, embedded once at 3072 dims with `text-embedding-3-large`; smaller sizes derived by
truncating and renormalising. Queries: the 119 eval cases that have ground truth.

## 1. Dimension size (exact search, offline)

"Expected people in top N" = for each eval case, rank people by their best chunk similarity and measure the share of
the true answer set that lands in the top N people (against min(N, true count)).

| Dims | Storage as vector | Storage as halfvec | Top-200 chunk agreement with 3072 | Expected people in top 50 | in top 200 | in top 500 |
|---|---|---|---|---|---|---|
| 3072 | 382 MB | 191 MB | 100% | 65.3% | 77.5% | 85.9% |
| 1536 | 191 MB | 95 MB | 89% | 63.9% | 74.8% | 85.3% |
| 800 (current) | 99 MB | 50 MB | 81% | 64.0% | 75.2% | 85.0% |
| 256 | 32 MB | 16 MB | 56% | 60.0% | 70.7% | 79.7% |

Findings:
- 800 vs 3072 changes eval retrieval recall by about 1-2 points. The 3072 -> 800 reduction cost almost nothing.
- Dense retrieval alone tops out around 85% even when 500 people are kept. The remaining misses are structured
  queries (class year, instructor) that embeddings cannot see. More dimensions do not fix that.

## 2. HNSW vs exact search (live database, 800 dims)

| | Rows returned when asking for 200 | Warm latency (incl. network) | Recall of true top 200 |
|---|---|---|---|
| `search_chunks` (HNSW index, v1) | **40-41** | ~570-690 ms | at most ~20% |
| `v2_search_chunks_exact` (full scan) | 200 | ~340-420 ms | 100% |

Findings:
- **v1 bug:** pgvector's HNSW returns at most `hnsw.ef_search` rows (default 40) regardless of `LIMIT`. The v1
  "top 200 chunks" was really about 40 chunks, i.e. 30-40 people considered per query. Asking for 1,000 also returns 40.
- Exact scan is as fast as the index at this corpus size when the cache is warm, with perfect recall.
- Caveat: the first exact scan after a cold start took ~5 s (vectors are stored out-of-line and must be read from disk).
  Mitigation for v2: keep vectors in a compact dedicated table so the scan is small and stays cached.

## Decision

- Keep 800 dimensions. No re-embedding of chunks, no extra storage, no tier upgrade needed.
- Use exact search in v2; do not depend on the HNSW index. (The index stays until cut-over because v1 uses it;
  dropping it afterwards frees ~118 MB.)
- Database size at time of test: ~290 MB of the 500 MB free tier (chunks table 145 MB + its indexes 118 MB).
- What Pro would buy: nothing measurable for retrieval quality at this corpus size.

Embedding cost of this benchmark: 1.37M tokens, about $0.18.
