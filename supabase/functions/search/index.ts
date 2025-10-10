import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    console.log("==== NEW SEARCH REQUEST ====");
    console.log("Query:", query);

    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // STEP 1: Generate embedding for the query
    console.log("\n=== STEP 1: Generate Query Embedding ===");
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: "text-embedding-3-large",
        input: query,
        dimensions: 3072
      })
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("OpenAI Embedding API error:", errorText);
      throw new Error(`Embedding API error: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    console.log("✓ Query embedding generated (3072 dimensions)");

    // STEP 2: Vector search on chunks (top 200)
    console.log("\n=== STEP 2: Vector Search on Chunks ===");
    const { data: chunks, error: chunksError } = await supabase.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_count: 200
    });

    if (chunksError) {
      console.error("Error searching chunks:", chunksError);
      throw new Error(`Chunks search error: ${chunksError.message}`);
    }

    console.log(`✓ Found ${chunks.length} relevant chunks`);
    console.log(`  Top similarity: ${chunks[0]?.similarity.toFixed(4)}`);
    console.log(`  Lowest similarity: ${chunks[chunks.length - 1]?.similarity.toFixed(4)}`);

    // STEP 3: Aggregate chunks by person
    console.log("\n=== STEP 3: Aggregate Chunks by Person ===");
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

    // Calculate average similarity and relevance score for each person
    const peopleAggregations = Array.from(peopleMap.values()).map(person => {
      // person.avg_similarity = person.chunks.reduce((sum, c) => sum + c.similarity, 0) / person.chunks.length;

      // // Relevance score: weighted combination of max and average similarity
      // // Max similarity (70%) + Avg similarity (30%)
      // person.relevance_score = (person.max_similarity * 0.7) + (person.avg_similarity * 0.3);

      // chunks already have .similarity ∈ [0,1]
      const sims = person.chunks.map(c => c.similarity).sort((a,b)=>b-a);
      const maxSim = sims[0] ?? 0;

      // trimmed mean over top 3 (or fewer)
      const k = Math.min(3, sims.length);
      const meanTopK = k ? (sims.slice(0, k).reduce((s,x)=>s+x,0) / k) : 0;

      person.relevance_score = 0.80 * maxSim + 0.20 * meanTopK;

      return person;
    });

    // Sort by relevance score and take top 50 for GPT reranking
    const topPeople = peopleAggregations
      .sort((a, b) => b.relevance_score - a.relevance_score)
      // .slice(0, 50); // TODO: restore
      .slice(0, 20);

    console.log(`✓ Aggregated to ${peopleMap.size} unique people`);
    // console.log(`  Top 50 people selected for reranking`); // TODO: restore
    console.log(`  Top 20 people selected for reranking`);
    console.log(`  Best relevance score: ${topPeople[0]?.relevance_score.toFixed(4)}`);

    // STEP 4: Fetch full person data
    console.log("\n=== STEP 4: Fetch Full Person Data ===");
    const personIds = topPeople.map(p => p.person_id);

    const [peopleResult, experiencesResult, educationsResult] = await Promise.all([
      supabase.from('people').select('*').in('person_id', personIds),
      supabase.from('experiences').select('*').in('person_id', personIds).order('sort_index', { ascending: true }),
      supabase.from('educations').select('*').in('person_id', personIds).order('start_year', { ascending: false })
    ]);

    if (peopleResult.error) throw new Error(`People fetch error: ${peopleResult.error.message}`);
    if (experiencesResult.error) throw new Error(`Experiences fetch error: ${experiencesResult.error.message}`);
    if (educationsResult.error) throw new Error(`Educations fetch error: ${educationsResult.error.message}`);

    console.log(`✓ Fetched data:`);
    console.log(`  People: ${peopleResult.data.length}`);
    console.log(`  Experiences: ${experiencesResult.data.length}`);
    console.log(`  Educations: ${educationsResult.data.length}`);

    // STEP 5: Enrich people with their data
    console.log("\n=== STEP 5: Enrich People Data ===");
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

    console.log(`✓ Enriched ${enrichedPeople.length} people profiles`);

    // STEP 6: GPT Reranking
    console.log("\n=== STEP 6: GPT Reranking ===");

    const systemPrompt = `You are an expert at matching people to search queries for a Harvard Business School LTV (Launching Tech Ventures) alumni network.

Your task:
1. Carefully read the user's search query: "${query}"
2. Review the candidate alumni profiles provided
3. Intelligently rerank them based on relevance to the query
4. Select the TOP 20 most relevant matches
5. For each selected person, create concise summaries of their education and experience

Important guidelines:
- Consider semantic relevance, not just keyword matching
- Be selective - only include truly relevant matches
- Summaries must be SHORT (1-2 sentences max) and factual
- Do not invent information
- Intent understanding & matching: First interpret the query to uncover its dominant intent — what the user is really seeking (e.g., particular organizations, roles, fields, or contexts). Treat those explicit or strongly implied constraints as primary signals when ranking candidates. Only after satisfying those, use other profile evidence to refine order. Do not up-rank candidates that miss clear intent signals, even if they seem generally related.
- If fewer than 20 people are relevant, only return those who are truly good matches.

For each person, provide:
- All their basic info (first_name, last_name, email, linkedin_url, headline, class_year, section)
- education_summary: A brief, readable summary (e.g., "Harvard Business School. Yale College.")
- experience_summary: A brief, readable summary of key roles (e.g., "Founder at TechCo. Product Manager at Google.")
- why_relevant: A brief explanation of why this person is relevant to the query

Return ONLY a JSON object with a "results" array containing the top 20 matches, ordered by relevance (most relevant first).`;

    // Filter candidates by minimum vector score threshold
    const filteredCandidates = enrichedPeople.filter(p => p.relevance_score >= 0.35);

    console.log(`Filtered to ${filteredCandidates.length} candidates with score >= 0.35`);

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
      model: "gpt-5",
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
      temperature: 0.2,
      response_format: { type: "json_object" }
    };

    console.log(`Sending ${compactCandidates.length} candidates to GPT-4o for reranking...`);

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
      console.error(`GPT API error: ${errorText}`);

      // Fallback: return top people without GPT reranking
      console.log("Using fallback: returning top 20 by relevance score");
      const fallbackResults = enrichedPeople.slice(0, 20).map(p => {
        const [firstName, ...lastNameParts] = p.full_name.split(' ');
        return {
          first_name: firstName,
          last_name: lastNameParts.join(' ') || '',
          email: p.email,
          linkedin_url: p.linkedin_url,
          headline: p.headline || 'LTV Alumni',
          class_year: p.class_year?.toString() || '',
          section: p.section || '',
          education_summary: p.educations.map(e => e.school).filter(Boolean).join('. '),
          experience_summary: p.experiences.map(e => `${e.title} at ${e.company}`).filter(e => e !== ' at ').slice(0, 3).join('. ')
        };
      });

      return new Response(JSON.stringify({
        results: fallbackResults,
        fallback: true,
        error: "GPT reranking failed, using relevance score fallback"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const gptResult = await gptResponse.json();
    console.log("✓ GPT reranking completed");

    // Parse GPT response
    const gptContent = gptResult.choices[0].message.content;
    let rerankedResults;

    try {
      const parsedContent = JSON.parse(gptContent);
      rerankedResults = parsedContent.results || parsedContent.matches || parsedContent.alumni || [];

      if (!Array.isArray(rerankedResults)) {
        throw new Error("GPT response does not contain a valid results array");
      }

      console.log(`✓ Returning ${rerankedResults.length} reranked results`);
    } catch (error) {
      console.error("Error parsing GPT response:", error);
      console.log("GPT response:", gptContent);

      // Fallback
      const fallbackResults = enrichedPeople.slice(0, 20).map(p => {
        const [firstName, ...lastNameParts] = p.full_name.split(' ');
        return {
          first_name: firstName,
          last_name: lastNameParts.join(' ') || '',
          email: p.email,
          linkedin_url: p.linkedin_url,
          headline: p.headline || 'LTV Alumni',
          class_year: p.class_year?.toString() || '',
          section: p.section || '',
          education_summary: p.educations.map(e => e.school).filter(Boolean).join('. '),
          experience_summary: p.experiences.map(e => `${e.title} at ${e.company}`).filter(e => e !== ' at ').slice(0, 3).join('. ')
        };
      });

      rerankedResults = fallbackResults;
    }

    console.log("\n==== SEARCH COMPLETE ====");
    console.log(`Final result count: ${rerankedResults.length}`);

    return new Response(JSON.stringify({ results: rerankedResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in search function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      results: []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
