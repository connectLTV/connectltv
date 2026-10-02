# Cohere reranker A/B (step 1.6)

Run 2026-10-02 on the eval classes a reranker can affect (open-ended, paraphrase, cross-chunk, alias; 44 cases).
Purely structured queries never reach the reranker, so they are identical in both variants.

- **Variant A (`v2-llm-judge`)**: hybrid retrieval (dense chunk + dense profile + keyword, fused), then the LLM judges
  relevance and writes explanations in rank order.
- **Variant B (`v2-cohere`)**: same, but the 180 retrieved people are first reordered by Cohere `rerank-v3.5`
  before the LLM judges them. Selected per request with `options.reranker = "cohere"` or the `SEARCH_RERANKER` secret.

| | A: LLM judge only | B: + Cohere rerank |
|---|---|---|
| Open-ended precision (judged by gpt-4.1) | 94% | 93% |
| Relevant people returned across 11 comparable open-ended queries | 367 | 392 (+7%) |
| Time to first result, open-ended queries | 3.5 s | 3.7 s |
| Mean cost per query on these classes | lower | about 2-3x (one Cohere search unit per 100 documents plus more judged candidates) |

One open-ended query ("product managers ... at Google or Meta") is excluded from the count because the query
translator routed it differently in the two runs, which has nothing to do with the reranker.

Per query the picture is mixed: B found more for "machine learning and AI" (107 vs 63) and "climate tech founders"
(31 vs 24), fewer for "edtech" (23 vs 45) and "robotics or hardware" (63 vs 75). With one run per variant these
differences are within run-to-run noise.

## Decision

Do not adopt the reranker for now. It adds a vendor, cost and a little latency for a gain that is not clearly
distinguishable from noise, and the LLM judge already holds precision at the baseline's level or better.
The code path stays in `search-v2` behind the option, so it can be re-tested as the corpus or query mix changes.
The Cohere key is set as a Supabase secret but unused by default.
