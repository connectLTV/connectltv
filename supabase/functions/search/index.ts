import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Chunk type weights for relevance scoring
const CHUNK_TYPE_WEIGHTS: Record<string, number> = {
  about: 1.0,
  work: 1.0,
  edu: 1.0,
  skills: 0.5,
};

interface ChunkResult {
  chunk_id: string;
  person_id: string;
  chunk_type: string;
  text_raw: string;
  text_norm: string;
  similarity: number;
}

interface PersonAggregation {
  person_id: string;
  chunks: ChunkResult[];
  max_similarity: number;
  avg_similarity: number;
  relevance_score: number;
}

// Helper function to generate education summary locally
const generateEducationSummary = (educations: Array<{school?: string; degree?: string; field?: string}>): string => {
  const summary = educations
    .slice(0, 3)
    .map(e => e.school || '')
    .filter(Boolean)
    .join('. ');
  return summary ? summary + '.' : '';
};

// Helper function to generate experience summary locally
const generateExperienceSummary = (experiences: Array<{title?: string; company?: string}>): string => {
  const summary = experiences
    .slice(0, 3)
    .map(e => `${e.title || ''} at ${e.company || ''}`.trim())
    .filter(e => e !== 'at')
    .join('. ');
  return summary ? summary + '.' : '';
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, stream = true } = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debug: Record<string, any> = { steps: [] };
    const startTime = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logStep = (step: string, data?: any) => {
      const elapsed = Date.now() - startTime;
      console.log(`[${elapsed}ms] ${step}`, data || '');
      debug.steps.push({ step, elapsed_ms: elapsed, ...(data && { data }) });
    };

    logStep("START", { query, stream });

    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    logStep("Clients initialized");

    // STEP 1: Generate embedding for the query
    logStep("STEP 1: Generating query embedding...");
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: "text-embedding-3-large",
        input: query,
        dimensions: 800
      })
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      logStep("STEP 1 FAILED: OpenAI Embedding API error", { error: errorText });
      throw new Error(`Embedding API error: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    logStep("STEP 1 COMPLETE: Query embedding generated", { dimensions: queryEmbedding.length });

    // STEP 2: Vector search on chunks (top 200)
    logStep("STEP 2: Starting vector search on chunks...");
    const { data: chunks, error: chunksError } = await supabase.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_count: 200
    });

    if (chunksError) {
      logStep("STEP 2 FAILED: Chunks search error", { error: chunksError });
      throw new Error(`Chunks search error: ${chunksError.message}`);
    }

    logStep("STEP 2 COMPLETE: Vector search done", { chunk_count: chunks?.length || 0 });

    // STEP 3: Aggregate chunks by person
    logStep("STEP 3: Aggregating chunks by person...");
    const peopleMap = new Map<string, PersonAggregation>();

    for (const chunk of chunks as ChunkResult[]) {
      if (!peopleMap.has(chunk.person_id)) {
        peopleMap.set(chunk.person_id, {
          person_id: chunk.person_id,
          chunks: [],
          max_similarity: 0,
          avg_similarity: 0,
          relevance_score: 0
        });
      }

      const personAgg = peopleMap.get(chunk.person_id)!;
      personAgg.chunks.push(chunk);
      personAgg.max_similarity = Math.max(personAgg.max_similarity, chunk.similarity);
    }

    // Calculate weighted similarity and relevance score
    const peopleAggregations = Array.from(peopleMap.values()).map(person => {
      const weightedSims = person.chunks.map(c => {
        const weight = CHUNK_TYPE_WEIGHTS[c.chunk_type] ?? 1.0;
        return c.similarity * weight;
      }).sort((a, b) => b - a);

      const maxSim = weightedSims[0] ?? 0;
      const k = Math.min(3, weightedSims.length);
      const meanTopK = k ? (weightedSims.slice(0, k).reduce((s, x) => s + x, 0) / k) : 0;

      person.relevance_score = 0.80 * maxSim + 0.20 * meanTopK;
      return person;
    });

    const topPeople = peopleAggregations
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 50);

    logStep("STEP 3 COMPLETE: Aggregated chunks", { unique_people: peopleMap.size });

    // STEP 4: Fetch full person data
    logStep("STEP 4: Fetching full person data...");
    const personIds = topPeople.map(p => p.person_id);

    const [peopleResult, experiencesResult, educationsResult] = await Promise.all([
      supabase.from('people').select('*').in('person_id', personIds),
      supabase.from('experiences').select('*').in('person_id', personIds).order('sort_index', { ascending: true }),
      supabase.from('educations').select('*').in('person_id', personIds).order('start_year', { ascending: false })
    ]);

    if (peopleResult.error) throw new Error(`People fetch error: ${peopleResult.error.message}`);
    if (experiencesResult.error) throw new Error(`Experiences fetch error: ${experiencesResult.error.message}`);
    if (educationsResult.error) throw new Error(`Educations fetch error: ${educationsResult.error.message}`);

    logStep("STEP 4 COMPLETE: Fetched person data", { people_count: peopleResult.data.length });

    // STEP 5: Enrich people with their data
    logStep("STEP 5: Enriching people data...");
    const enrichedPeople = topPeople.map(personAgg => {
      const person = peopleResult.data.find(p => p.person_id === personAgg.person_id);
      const experiences = experiencesResult.data.filter(e => e.person_id === personAgg.person_id);
      const educations = educationsResult.data.filter(e => e.person_id === personAgg.person_id);

      const topChunks = personAgg.chunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(c => ({ type: c.chunk_type, text: c.text_raw, similarity: c.similarity }));

      return {
        person_id: personAgg.person_id,
        full_name: person?.full_name || 'Unknown',
        email: person?.email,
        linkedin_url: person?.linkedin_url,
        headline: person?.headline,
        summary: person?.summary,
        class_year: person?.class_year,
        section: person?.section,
        location: person?.location,
        current_company: person?.current_company,
        current_title: person?.current_title,
        current_industry: person?.current_industry,
        experiences: experiences.map(exp => ({
          company: exp.company,
          title: exp.title,
          description: exp.description,
          location: exp.location,
          start_date: exp.start_date,
          end_date: exp.end_date
        })),
        educations: educations.map(edu => ({
          school: edu.school,
          degree: edu.degree,
          field: edu.field,
          description: edu.description,
          start_year: edu.start_year,
          end_year: edu.end_year
        })),
        relevance_score: personAgg.relevance_score,
        top_chunks: topChunks
      };
    });

    logStep("STEP 5 COMPLETE: Enriched people", { enriched_count: enrichedPeople.length });

    // Create lookup map for enriched people
    const enrichedPeopleMap = new Map(enrichedPeople.map(p => [p.person_id, p]));

    // Helper to transform enriched person to result format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toResultFormat = (p: any, whyRelevant = '') => {
      const [firstName, ...lastNameParts] = p.full_name.split(' ');
      return {
        person_id: p.person_id,
        first_name: firstName,
        last_name: lastNameParts.join(' ') || '',
        email: p.email,
        linkedin_url: p.linkedin_url,
        headline: p.headline || 'LTV Alumni',
        class_year: p.class_year?.toString() || '',
        section: p.section || '',
        location: p.location || '',
        current_company: p.current_company || '',
        current_title: p.current_title || '',
        current_industry: p.current_industry || '',
        education_summary: generateEducationSummary(p.educations),
        experience_summary: generateExperienceSummary(p.experiences),
        why_relevant: whyRelevant
      };
    };

    // STEP 6: GPT Reranking with streaming
    logStep("STEP 6: Starting GPT reranking...");

    const systemPrompt = `You are an expert at matching people to search queries for a Harvard Business School LTV (Launching Tech Ventures) alumni network.

Your task:
1. Carefully read the user's search query: "${query}"
2. Review the candidate alumni profiles provided
3. Intelligently rerank them based on relevance to the query
4. Return ONLY people who actually match the query. Maximum 30 results.

Important guidelines:
- Consider semantic relevance, not just keyword matching
- ONLY include people who genuinely match the query criteria
- DO NOT include people who don't match - don't return them with "excluded" or "not relevant" explanations
- Intent understanding & matching: First interpret the query to uncover its dominant intent. Treat explicit or strongly implied constraints as primary signals when ranking.
- If fewer than 30 people are relevant, return only those who truly match. It's better to return 5 great matches than 30 poor ones.
- STRICT LIMIT: Maximum 30 results. Do not exceed this limit under any circumstances.

For each person, return ONLY:
- person_id: The exact person_id from the input (REQUIRED)
- why_relevant: A brief explanation of why they MATCH the query (1 sentence, positive reasoning only)

Return ONLY a JSON object with a "results" array. Maximum 30 results, ordered by relevance.
Example: {"results": [{"person_id": "uuid-here", "why_relevant": "Worked at OpenAI as ML engineer"}, ...]}`;

    const filteredCandidates = enrichedPeople.filter(p => p.relevance_score >= 0.35);

    const compactCandidates = filteredCandidates.map(p => {
      const [firstName, ...lastNameParts] = p.full_name.split(' ');
      const top2Chunks = p.top_chunks.slice(0, 2).map(c => ({
        type: c.type,
        text: c.text.substring(0, 200),
        score: Math.round(c.similarity * 1000) / 1000
      }));

      const eduRollup = p.educations
        .map(e => `${e.degree || ''} ${e.field ? 'in ' + e.field : ''} from ${e.school || ''}`.trim())
        .filter(Boolean)
        .join('; ');

      const expRollup = p.experiences
        .slice(0, 4)
        .map(e => `${e.title || ''} at ${e.company || ''}`.trim())
        .filter(e => e !== 'at')
        .join('; ');

      return {
        person_id: p.person_id,
        full_name: p.full_name,
        first_name: firstName,
        last_name: lastNameParts.join(' ') || '',
        headline: p.headline,
        class_year: p.class_year?.toString() || '',
        vector_score: Math.round(p.relevance_score * 1000) / 1000,
        chunks: top2Chunks,
        education: eduRollup,
        experience: expRollup
      };
    });

    const gptRequestBody = {
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({ query, candidates: compactCandidates })
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      stream: true  // Enable streaming
    };

    logStep("STEP 6: Sending to GPT (streaming)", { candidate_count: compactCandidates.length });

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gptRequestBody),
    });

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      logStep("STEP 6 FAILED: GPT API error", { error: errorText });
      throw new Error(`GPT API error: ${errorText}`);
    }

    // Streaming mode - parse GPT response incrementally and emit results one-by-one
    if (stream) {
      logStep("Using incremental streaming mode");

      const encoder = new TextEncoder();
      const gptReader = gptResponse.body?.getReader();

      if (!gptReader) {
        throw new Error("No GPT response body");
      }

      const readableStream = new ReadableStream({
        async start(controller) {
          // Send initial event to indicate search is starting GPT phase
          const startEvent = {
            type: 'start',
            total_candidates: compactCandidates.length,
            timestamp_ms: Date.now() - startTime
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));

          const decoder = new TextDecoder();
          let gptBuffer = '';  // Buffer for GPT streaming chunks
          let jsonBuffer = ''; // Buffer for accumulating JSON content
          let resultCount = 0;
          const emittedPersonIds = new Set<string>();

          // Regex to match complete result objects
          // Matches: {"person_id": "...", "why_relevant": "..."}
          const resultPattern = /\{\s*"person_id"\s*:\s*"([^"]+)"\s*,\s*"why_relevant"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*\}/g;

          try {
            while (true) {
              const { done, value } = await gptReader.read();

              if (done) {
                logStep("GPT stream ended");
                break;
              }

              gptBuffer += decoder.decode(value, { stream: true });

              // Process complete SSE lines from GPT
              const lines = gptBuffer.split('\n');
              gptBuffer = lines.pop() || ''; // Keep incomplete line

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();

                  if (data === '[DONE]') {
                    logStep("GPT signaled [DONE]");
                    continue;
                  }

                  try {
                    const chunk = JSON.parse(data);
                    const content = chunk.choices?.[0]?.delta?.content || '';

                    if (content) {
                      jsonBuffer += content;

                      // Try to extract complete result objects
                      let match;
                      while ((match = resultPattern.exec(jsonBuffer)) !== null) {
                        const personId = match[1];
                        // Unescape the why_relevant string
                        const whyRelevant = match[2].replace(/\\"/g, '"').replace(/\\n/g, '\n');

                        // Avoid duplicates
                        if (emittedPersonIds.has(personId)) {
                          continue;
                        }
                        emittedPersonIds.add(personId);

                        const enrichedPerson = enrichedPeopleMap.get(personId);
                        if (enrichedPerson) {
                          resultCount++;
                          const timestamp = Date.now() - startTime;

                          logStep(`RESULT ${resultCount} received`, {
                            person_id: personId,
                            name: enrichedPerson.full_name,
                            timestamp_ms: timestamp
                          });

                          const resultEvent = {
                            type: 'result',
                            index: resultCount,
                            result: toResultFormat(enrichedPerson, whyRelevant),
                            timestamp_ms: timestamp
                          };
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultEvent)}\n\n`));
                        } else {
                          logStep(`WARNING: person_id not found: ${personId}`);
                        }
                      }

                      // Keep only unprocessed part of buffer (after last complete match)
                      // Find the last closing brace of a result object to trim buffer
                      const lastCompleteIndex = jsonBuffer.lastIndexOf('}');
                      if (lastCompleteIndex > 0) {
                        // Check if we're inside the results array still
                        const remaining = jsonBuffer.substring(lastCompleteIndex + 1);
                        if (remaining.includes('{')) {
                          // There's a new object starting, keep from there
                          const nextObjectStart = jsonBuffer.indexOf('{', lastCompleteIndex + 1);
                          if (nextObjectStart > 0) {
                            jsonBuffer = jsonBuffer.substring(nextObjectStart);
                          }
                        }
                      }
                    }
                  } catch (e) {
                    // Ignore JSON parse errors for incomplete chunks
                  }
                }
              }
            }

            // Send completion event
            const completeEvent = {
              type: 'complete',
              total_results: resultCount,
              total_time_ms: Date.now() - startTime
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`));
            logStep("SEARCH COMPLETE", { total_results: resultCount, total_time_ms: Date.now() - startTime });

          } catch (error) {
            logStep("Streaming error", { error: String(error) });
            const errorEvent = {
              type: 'error',
              message: String(error),
              timestamp_ms: Date.now() - startTime
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          }

          controller.close();
        }
      });

      return new Response(readableStream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming mode - collect all results then return
    logStep("Using non-streaming mode");

    const gptText = await gptResponse.text();
    // Parse SSE format to extract content
    let fullContent = '';
    for (const line of gptText.split('\n')) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try {
          const chunk = JSON.parse(line.slice(6));
          fullContent += chunk.choices?.[0]?.delta?.content || '';
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    const parsedContent = JSON.parse(fullContent);
    const gptResults = parsedContent.results || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalResults = gptResults.map((gptPerson: any) => {
      const enrichedPerson = enrichedPeopleMap.get(gptPerson.person_id);
      if (!enrichedPerson) return null;
      return toResultFormat(enrichedPerson, gptPerson.why_relevant || '');
    }).filter(Boolean);

    logStep("SEARCH COMPLETE", { final_result_count: finalResults.length });
    debug.total_time_ms = Date.now() - startTime;

    return new Response(JSON.stringify({ results: finalResults, debug }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in search function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      results: [],
      debug: { error: String(error), message: error.message }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
