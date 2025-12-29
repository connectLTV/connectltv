import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Chunk type weights for relevance scoring
// Skills are weighted lower (0.5) to prevent skill-heavy profiles from dominating
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debug: Record<string, any> = { steps: [] };
    const startTime = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logStep = (step: string, data?: any) => {
      const elapsed = Date.now() - startTime;
      console.log(`[${elapsed}ms] ${step}`, data || '');
      debug.steps.push({ step, elapsed_ms: elapsed, ...(data && { data }) });
    };

    logStep("START", { query });

    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    logStep("Clients initialized", { hasOpenAiKey: !!openAiApiKey, hasSupabaseUrl: !!supabaseUrl });

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
        dimensions: 2000
      })
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      logStep("STEP 1 FAILED: OpenAI Embedding API error", { error: errorText });
      throw new Error(`Embedding API error: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    logStep("STEP 1 COMPLETE: Query embedding generated", { dimensions: queryEmbedding.length, expected: 2000 });

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

    logStep("STEP 2 COMPLETE: Vector search done", {
      chunk_count: chunks?.length || 0,
      top_similarity: chunks?.[0]?.similarity?.toFixed(4),
      lowest_similarity: chunks?.[chunks.length - 1]?.similarity?.toFixed(4)
    });

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

    // Calculate weighted similarity and relevance score for each person
    // Apply chunk type weights (skills = 0.5, others = 1.0)
    const peopleAggregations = Array.from(peopleMap.values()).map(person => {
      // Apply chunk type weights to similarities
      const weightedSims = person.chunks.map(c => {
        const weight = CHUNK_TYPE_WEIGHTS[c.chunk_type] ?? 1.0;
        return c.similarity * weight;
      }).sort((a, b) => b - a);

      const maxSim = weightedSims[0] ?? 0;

      // Trimmed mean over top 3 (or fewer) weighted similarities
      const k = Math.min(3, weightedSims.length);
      const meanTopK = k ? (weightedSims.slice(0, k).reduce((s, x) => s + x, 0) / k) : 0;

      person.relevance_score = 0.80 * maxSim + 0.20 * meanTopK;

      return person;
    });

    // Sort by relevance score and take top 30 for GPT reranking
    const topPeople = peopleAggregations
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 50);

    logStep("STEP 3 COMPLETE: Aggregated chunks", {
      unique_people: peopleMap.size,
      top_50_selected: true,
      best_relevance_score: topPeople[0]?.relevance_score.toFixed(4)
    });

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

    logStep("STEP 4 COMPLETE: Fetched person data", {
      people_count: peopleResult.data.length,
      experiences_count: experiencesResult.data.length,
      educations_count: educationsResult.data.length
    });

    // STEP 5: Enrich people with their data
    logStep("STEP 5: Enriching people data...");
    const enrichedPeople = topPeople.map(personAgg => {
      const person = peopleResult.data.find(p => p.person_id === personAgg.person_id);
      const experiences = experiencesResult.data.filter(e => e.person_id === personAgg.person_id);
      const educations = educationsResult.data.filter(e => e.person_id === personAgg.person_id);

      // Get the most relevant chunks for context (top 5)
      const topChunks = personAgg.chunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(c => ({
          type: c.chunk_type,
          text: c.text_raw,
          similarity: c.similarity
        }));

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

    // STEP 6: GPT Reranking
    logStep("STEP 6: Starting GPT reranking...");

    const systemPrompt = `You are an expert at matching people to search queries for a Harvard Business School LTV (Launching Tech Ventures) alumni network.

Your task:
1. Carefully read the user's search query: "${query}"
2. Review the candidate alumni profiles provided
3. Intelligently rerank them based on relevance to the query
4. Select the TOP 30 most relevant matches

Important guidelines:
- Consider semantic relevance, not just keyword matching
- Be selective - only include truly relevant matches
- Intent understanding & matching: First interpret the query to uncover its dominant intent — what the user is really seeking (e.g., particular organizations, roles, fields, or contexts). Treat those explicit or strongly implied constraints as primary signals when ranking candidates. Only after satisfying those, use other profile evidence to refine order. Do not up-rank candidates that miss clear intent signals, even if they seem generally related.
- If fewer than 30 people are relevant, only return those who are truly good matches.

For each person, return ONLY:
- person_id: The exact person_id from the input (REQUIRED for matching)
- why_relevant: A brief explanation (1 sentence) of why this person is relevant to the query

Return ONLY a JSON object with a "results" array containing the top 30 matches, ordered by relevance (most relevant first). Example format:
{"results": [{"person_id": "uuid-here", "why_relevant": "Reason here"}, ...]}`;

    // Filter candidates by minimum vector score threshold
    const filteredCandidates = enrichedPeople.filter(p => p.relevance_score >= 0.35);

    logStep("STEP 6: Filtered candidates", {
      filtered_count: filteredCandidates.length,
      threshold: 0.35
    });

    // Prepare compact candidate data for GPT
    const compactCandidates = filteredCandidates.map(p => {
      const [firstName, ...lastNameParts] = p.full_name.split(' ');

      // Get top 2 chunks only, truncated to 200 chars
      const top2Chunks = p.top_chunks.slice(0, 2).map(c => ({
        type: c.type,
        text: c.text.substring(0, 200),
        score: Math.round(c.similarity * 1000) / 1000
      }));

      // Create short education rollup
      const eduRollup = p.educations
        .map(e => `${e.degree || ''} ${e.field ? 'in ' + e.field : ''} from ${e.school || ''}`.trim())
        .filter(Boolean)
        .join('; ');

      // Create short experience rollup
      const expRollup = p.experiences
        .slice(0, 4) // Only recent 4 experiences
        .map(e => `${e.title || ''} at ${e.company || ''}`.trim())
        .filter(e => e !== 'at')
        .join('; ');

      return {
        person_id: p.person_id,
        full_name: p.full_name,
        first_name: firstName,
        last_name: lastNameParts.join(' ') || '',
        email: p.email,
        linkedin_url: p.linkedin_url,
        headline: p.headline,
        class_year: p.class_year?.toString() || '',
        section: p.section || '',
        vector_score: Math.round(p.relevance_score * 1000) / 1000,
        chunks: top2Chunks,
        education: eduRollup,
        experience: expRollup
      };
    });

    const gptRequestBody = {
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            query: query,
            candidates: compactCandidates
          })
        }
      ],
      response_format: { type: "json_object" }
    };

    logStep("STEP 6: Sending to GPT", { candidate_count: compactCandidates.length });

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

      // Fallback: return top people without GPT reranking
      logStep("Using fallback: returning top 30 by relevance score");
      const fallbackResults = enrichedPeople.slice(0, 30).map(p => {
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
          why_relevant: ''
        };
      });

      debug.total_time_ms = Date.now() - startTime;
      return new Response(JSON.stringify({
        results: fallbackResults,
        fallback: true,
        error: "GPT reranking failed, using relevance score fallback",
        debug
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const gptResult = await gptResponse.json();
    logStep("STEP 6 COMPLETE: GPT reranking done");

    // Parse GPT response
    const gptContent = gptResult.choices[0].message.content;
    let rerankedResults;

    // Create a lookup map for enriched people by person_id
    const enrichedPeopleMap = new Map(enrichedPeople.map(p => [p.person_id, p]));

    try {
      const parsedContent = JSON.parse(gptContent);
      const gptResults = parsedContent.results || parsedContent.matches || parsedContent.alumni || [];

      if (!Array.isArray(gptResults)) {
        throw new Error("GPT response does not contain a valid results array");
      }

      // Merge GPT results (person_id + why_relevant) with full enriched data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rerankedResults = gptResults.map((gptPerson: any) => {
        const enrichedPerson = enrichedPeopleMap.get(gptPerson.person_id);
        if (!enrichedPerson) {
          logStep("WARNING: person_id not found in enriched data", { person_id: gptPerson.person_id });
          return null;
        }

        const [firstName, ...lastNameParts] = enrichedPerson.full_name.split(' ');

        return {
          person_id: gptPerson.person_id,
          first_name: firstName,
          last_name: lastNameParts.join(' ') || '',
          email: enrichedPerson.email,
          linkedin_url: enrichedPerson.linkedin_url,
          headline: enrichedPerson.headline,
          class_year: enrichedPerson.class_year?.toString() || '',
          section: enrichedPerson.section || '',
          location: enrichedPerson.location || '',
          current_company: enrichedPerson.current_company || '',
          current_title: enrichedPerson.current_title || '',
          current_industry: enrichedPerson.current_industry || '',
          education_summary: generateEducationSummary(enrichedPerson.educations),
          experience_summary: generateExperienceSummary(enrichedPerson.experiences),
          why_relevant: gptPerson.why_relevant || ''
        };
      }).filter(Boolean); // Remove any null entries

      logStep("GPT parsing complete", { result_count: rerankedResults.length });
    } catch (error) {
      logStep("GPT parsing failed", { error: String(error), gptContent: gptContent?.substring(0, 500) });

      // Fallback: use vector scores without GPT reranking
      rerankedResults = enrichedPeople.slice(0, 30).map(p => {
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
          why_relevant: ''
        };
      });
    }

    logStep("SEARCH COMPLETE", { final_result_count: rerankedResults.length });
    debug.total_time_ms = Date.now() - startTime;

    return new Response(JSON.stringify({ results: rerankedResults, debug }), {
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
