// search-v2: structured filters + hybrid retrieval + reranking (docs/MASTER_PLAN.md, Phase 1).
//
//   query -> [translate to filters | embed] in parallel
//     purely structured  -> SQL filter, every match returned, richest profiles first, no LLM
//     hybrid / semantic  -> SQL prefilter, dense + keyword retrieval fused per person,
//                           optional Cohere rerank, LLM judges relevance and writes explanations
//
// Emits the same SSE events as v1 (`start`, `result`, `complete`, `error`) so the frontend is unchanged.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTsQuery, sanitizeTranslation, TRANSLATE_SYSTEM, Translation } from "./translate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LLM_MODEL = "gpt-4.1-mini";
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMS = 800;
const RETRIEVE_COUNT = 180; // people fetched from hybrid retrieval
const BATCH_SIZE = 20; // candidates per LLM judging call
const FIRST_BATCH_SIZE = 10; // smaller first call so the first result appears sooner
const BATCHES_PER_ROUND = 3; // judged concurrently
const MAX_JUDGED = 180; // adaptive cutoff ceiling
const CONTINUE_MATCH_RATE = 0.5; // keep judging while the last batch of a round is still this relevant
const DOC_CHARS = 1200; // profile text shown to the judge per candidate
const PRICE = { llmIn: 0.4, llmOut: 1.6, embed: 0.13, cohereSearch: 0.002 }; // USD per 1M tokens / per search unit

interface Candidate {
  person_id: string;
  score: number;
  card: Record<string, unknown>;
  profile_doc: string;
  rerank_score?: number;
}

interface Options {
  reranker?: "none" | "cohere";
  keyword_weight?: number;
}

const openAiKey = () => Deno.env.get("OPENAI_API_KEY_V2") || Deno.env.get("OPENAI_API_KEY") || "";

const JUDGE_SYSTEM = (query: string, satisfied: string) =>
  `You decide which alumni profiles match a search query on a Harvard Business School LTV (Launching Tech Ventures) alumni directory.

Search query: "${query}"
${satisfied ? `Every candidate already satisfies these constraints (verified from structured data, do not re-check them): ${satisfied}\nJudge only the rest of the query.` : ""}

Rules:
- Return ONLY candidates who clearly match the query. Leave out anyone who does not; never list a candidate with a negative explanation.
- Be strict. The profile must show direct evidence for every part of the query. A loosely related profile, an adjacent industry, or a single passing mention is not a match.
- "working in / building / at" refers to what the person does now or did as a substantial role, not a brief internship, unless the query says otherwise.
- Order matches from most to least relevant.
- "why": one short sentence of positive, specific evidence from the profile.

Return ONLY a JSON object: {"results": [{"id": <candidate id>, "why": "<one sentence>"}, ...]}. Use {"results": []} if nobody matches.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  let query = "";
  const usage = { prompt_tokens: 0, completion_tokens: 0, embedding_tokens: 0, cohere_units: 0, cost_usd: 0 };
  const addUsage = (u?: { prompt_tokens?: number; completion_tokens?: number }) => {
    usage.prompt_tokens += u?.prompt_tokens || 0;
    usage.completion_tokens += u?.completion_tokens || 0;
  };
  const totalCost = () =>
    (usage.prompt_tokens * PRICE.llmIn + usage.completion_tokens * PRICE.llmOut + usage.embedding_tokens * PRICE.embed) / 1e6 +
    usage.cohere_units * PRICE.cohereSearch;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logSearch = async (row: Record<string, any>) => {
    try {
      await supabase.from("search_logs").insert({ function_name: "search-v2", query, ...row });
    } catch (e) {
      console.error("search_logs insert failed", e);
    }
  };

  try {
    const body = await req.json();
    if (body.warm) {
      // Cache warm-up (called when the search page loads): touch the vector tables so the first real search
      // does not pay the cold-read cost. No LLM or embedding calls.
      const unit = new Array(EMBEDDING_DIMS).fill(0);
      unit[0] = 1;
      await supabase.rpc("v2_hybrid_search", { query_embedding: JSON.stringify(unit), keyword_query: "", f: {}, match_count: 1, doc_chars: 1 });
      return new Response(JSON.stringify({ warmed: true, ms: Date.now() - startTime }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    query = String(body.query || "").trim();
    const stream: boolean = body.stream !== false;
    const trackIds: string[] = body.track_person_ids || [];
    const options: Options = body.options || {};
    const reranker = options.reranker || (Deno.env.get("SEARCH_RERANKER") as Options["reranker"]) || "none";
    if (!query) throw new Error("query is required");
    if (!openAiKey()) throw new Error("OPENAI_API_KEY is not configured");

    // ---- Step 1: translate the query and embed it, in parallel ---------------------------------
    const translate = async (): Promise<Translation> => {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openAiKey()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: LLM_MODEL,
            temperature: 0,
            max_tokens: 500,
            response_format: { type: "json_object" },
            messages: [{ role: "system", content: TRANSLATE_SYSTEM }, { role: "user", content: query }],
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        addUsage(data.usage);
        return sanitizeTranslation(JSON.parse(data.choices[0].message.content), query);
      } catch (e) {
        console.error("translation failed, falling back to plain semantic search", e);
        return { filters: {}, semantic: query, keywords: [] };
      }
    };
    const embed = async (): Promise<number[]> => {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: query, dimensions: EMBEDDING_DIMS }),
      });
      if (!res.ok) throw new Error(`Embedding API error: ${await res.text()}`);
      const data = await res.json();
      usage.embedding_tokens += data.usage?.total_tokens || 0;
      return data.data[0].embedding;
    };
    const [translation, queryEmbedding] = await Promise.all([translate(), embed()]);
    const hasFilters = Object.keys(translation.filters).length > 0;
    const route = hasFilters && !translation.semantic ? "structured" : hasFilters ? "hybrid" : "semantic";
    const translateMs = Date.now() - startTime;

    // ---- Shared output plumbing ---------------------------------------------------------------
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    let firstResultMs: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const send = (event: Record<string, any>) => controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    const emitResult = (card: Record<string, unknown>, why: string) => {
      const timestamp = Date.now() - startTime;
      if (firstResultMs === null) firstResultMs = timestamp;
      const result = { ...card, why_relevant: why };
      results.push(result);
      send({ type: "result", index: results.length, result, timestamp_ms: timestamp });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debug: Record<string, any> = { route, translation, translate_ms: translateMs, reranker };

    const run = async () => {
      // ---- Purely structured: every match, richest profiles first, no LLM ---------------------
      if (route === "structured") {
        const { data, error } = await supabase.rpc("v2_structured_search", { f: translation.filters });
        if (error) throw new Error(`Structured search error: ${error.message}`);
        send({ type: "start", total_candidates: data.length, route, timestamp_ms: Date.now() - startTime });
        for (const row of data) emitResult(row.card, "");
        if (trackIds.length) {
          const returned = new Set(results.map((r) => r.person_id));
          debug.attribution = Object.fromEntries(
            trackIds.map((id) => [id, returned.has(id) ? `returned:${results.findIndex((r) => r.person_id === id) + 1}` : "excluded_by_filter"]),
          );
        }
        return;
      }

      // ---- Hybrid / semantic: retrieve, optionally rerank, judge + explain ----------------------
      const { data: retrieved, error } = await supabase.rpc("v2_hybrid_search", {
        query_embedding: JSON.stringify(queryEmbedding),
        keyword_query: buildTsQuery(translation.keywords.length ? translation.keywords : [translation.semantic]),
        f: translation.filters,
        match_count: RETRIEVE_COUNT,
        keyword_weight: options.keyword_weight ?? 1.0,
        doc_chars: reranker === "cohere" ? 4000 : DOC_CHARS,
      });
      if (error) throw new Error(`Hybrid search error: ${error.message}`);
      let candidates: Candidate[] = retrieved || [];
      debug.filtered_total = candidates[0] ? (candidates[0] as unknown as { filtered_total: number }).filtered_total : 0;
      debug.retrieved = candidates.length;
      debug.retrieve_ms = Date.now() - startTime;

      if (reranker === "cohere" && candidates.length > 1) {
        try {
          const res = await fetch("https://api.cohere.com/v2/rerank", {
            method: "POST",
            headers: { Authorization: `Bearer ${Deno.env.get("COHERE_API_KEY")}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "rerank-v3.5",
              query: translation.semantic || query,
              documents: candidates.map((c) => c.profile_doc.slice(0, 4000)),
              top_n: candidates.length,
            }),
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          usage.cohere_units += data.meta?.billed_units?.search_units || 1;
          candidates = data.results.map((r: { index: number; relevance_score: number }) => ({
            ...candidates[r.index],
            rerank_score: r.relevance_score,
          }));
          debug.rerank_ms = Date.now() - startTime;
        } catch (e) {
          console.error("Cohere rerank failed; keeping fused order", e);
          debug.rerank_error = String(e);
        }
      }

      send({ type: "start", total_candidates: candidates.length, route, timestamp_ms: Date.now() - startTime });

      const satisfied = hasFilters ? JSON.stringify(translation.filters) : "";
      const judgedIds = new Set<string>();

      // One LLM call judges a batch; matches are reported through onItem as they stream in.
      const judgeBatch = async (batch: Candidate[], onItem: (c: Candidate, why: string) => void): Promise<number> => {
        const payload = batch.map((c, i) => ({ id: i + 1, profile: c.profile_doc.slice(0, DOC_CHARS) }));
        const requestBody = JSON.stringify({
          model: LLM_MODEL,
          temperature: 0.2,
          stream: true,
          stream_options: { include_usage: true },
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: JUDGE_SYSTEM(query, satisfied) },
            { role: "user", content: JSON.stringify({ candidates: payload }) },
          ],
        });
        let res: Response | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openAiKey()}`, "Content-Type": "application/json" },
            body: requestBody,
          });
          if (res.status !== 429 && res.status < 500) break;
          await res.body?.cancel();
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // rate limited: back off and retry
        }
        if (!res || !res.ok || !res.body) throw new Error(`LLM API error: ${res ? await res.text() : "no response"}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const pattern = /\{\s*"id"\s*:\s*"?(\d+)"?\s*,\s*"why"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
        let sse = "", json = "", matched = 0;
        const seen = new Set<number>();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sse += decoder.decode(value, { stream: true });
          const lines = sse.split("\n");
          sse = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const chunk = JSON.parse(data);
              if (chunk.usage) addUsage(chunk.usage);
              json += chunk.choices?.[0]?.delta?.content || "";
            } catch (_) { /* incomplete SSE line */ }
          }
          let m;
          while ((m = pattern.exec(json)) !== null) {
            const idx = parseInt(m[1], 10);
            if (seen.has(idx) || idx < 1 || idx > batch.length) continue;
            seen.add(idx);
            matched++;
            let why = m[2];
            try { why = JSON.parse(`"${m[2]}"`); } catch (_) { /* keep raw */ }
            onItem(batch[idx - 1], why);
          }
        }
        return matched;
      };

      // Rounds of concurrent batches. Results are emitted in rank order: the first batch streams live,
      // later batches are buffered until the batches before them finish.
      let offset = 0;
      while (offset < candidates.length && offset < MAX_JUDGED) {
        const batches: Candidate[][] = [];
        for (let b = 0; b < BATCHES_PER_ROUND && offset < candidates.length && offset < MAX_JUDGED; b++) {
          const size = offset === 0 ? FIRST_BATCH_SIZE : BATCH_SIZE;
          batches.push(candidates.slice(offset, offset + size));
          offset += size;
        }
        const buffers: Array<Array<[Candidate, string]>> = batches.map(() => []);
        const finished = batches.map(() => false);
        let live = 0;
        const matchCounts = await Promise.all(batches.map(async (batch, bi) => {
          batch.forEach((c) => judgedIds.add(c.person_id));
          let n = 0;
          try {
            n = await judgeBatch(batch, (c, why) => {
              if (bi === live) emitResult(c.card, why);
              else buffers[bi].push([c, why]);
            });
          } catch (e) {
            console.error("judge batch failed", e);
            debug.judge_errors = (debug.judge_errors || 0) + 1;
          }
          finished[bi] = true;
          while (live < batches.length && finished[live]) {
            live++;
            if (live < batches.length) {
              for (const [c, why] of buffers[live]) emitResult(c.card, why);
              buffers[live] = [];
            }
          }
          return n;
        }));
        const last = batches.length - 1;
        if (matchCounts[last] / batches[last].length < CONTINUE_MATCH_RATE) break;
      }
      debug.judged = judgedIds.size;

      if (trackIds.length) {
        const { data: allowed } = await supabase.rpc("v2_filter_people", { f: translation.filters });
        const allowedIds = new Set((allowed || []).map((r: { person_id: string }) => r.person_id));
        const retrievedIds = new Set(candidates.map((c) => c.person_id));
        const order = results.map((r) => r.person_id);
        debug.attribution = Object.fromEntries(trackIds.map((id) => {
          const rank = order.indexOf(id);
          if (rank >= 0) return [id, `returned:${rank + 1}`];
          if (!allowedIds.has(id)) return [id, "excluded_by_filter"];
          if (!retrievedIds.has(id)) return [id, "not_retrieved"];
          if (!judgedIds.has(id)) return [id, "not_judged"];
          return [id, "dropped_by_llm"];
        }));
      }
    };

    const finish = async () => {
      usage.cost_usd = Number(totalCost().toFixed(6));
      debug.usage = usage;
      await logSearch({
        route,
        result_count: results.length,
        time_to_first_result_ms: firstResultMs,
        total_ms: Date.now() - startTime,
        meta: { filters: translation.filters, semantic: translation.semantic, reranker, cost_usd: usage.cost_usd },
      });
    };

    if (stream) {
      const readable = new ReadableStream<Uint8Array>({
        async start(c) {
          controller = c;
          try {
            await run();
            await finish();
            send({ type: "complete", total_results: results.length, total_time_ms: Date.now() - startTime, route, debug });
          } catch (error) {
            console.error("search-v2 error", error);
            send({ type: "error", message: String(error), timestamp_ms: Date.now() - startTime });
            await logSearch({ route, result_count: results.length, total_ms: Date.now() - startTime, error: String(error) });
          }
          c.close();
        },
      });
      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    await run();
    await finish();
    debug.total_time_ms = Date.now() - startTime;
    return new Response(JSON.stringify({ results, debug }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error in search-v2:", error);
    await logSearch({ result_count: 0, total_ms: Date.now() - startTime, error: String(error) });
    return new Response(JSON.stringify({ error: String(error), results: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
