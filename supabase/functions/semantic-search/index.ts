
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    console.log("==== SEMANTIC SEARCH REQUEST ====");
    console.log("Received search query:", query);
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Step 1: Generate embedding for the query using OpenAI's embeddings API
    console.log("Generating embedding for query:", query);
    console.log("Using OpenAI Embedding API with model: text-embedding-ada-002");
    const embeddingPayload = {
      model: "text-embedding-ada-002",
      input: query
    };
    console.log("OpenAI embedding request payload:", JSON.stringify(embeddingPayload));
    
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify(embeddingPayload)
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("OpenAI Embedding API error:", errorText);
      throw new Error(`Embedding API error: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    console.log("Embedding generation successful");
    console.log("Embedding dimensions:", embeddingData.data[0].embedding.length);
    const embedding = embeddingData.data[0].embedding;
    const stringifiedEmbedding = JSON.stringify(embedding);

    // Step 2: Query the database with embedding similarity
    console.log("==== DIRECT QUERY SEARCH ====");
    console.log("Performing direct query search with the generated embedding");
    
    let alumniData;
    try {
      console.log("Querying alumni database with embedding");
      
      // Execute SQL query with embedding similarity calculation using string interpolation
      const { data: directData, error: directError } = await supabase.rpc(
        'query_alumni_with_similarity',
        { query_embedding: embedding }
      ).catch(async (e) => {
        console.log("RPC failed, using direct query instead:", e);
        
        // Fallback to raw SQL query with string interpolation for the embedding
        return await supabase
          .from('LTV Alumni Database Enriched with Embeddings')
          .select(`*, 1 - (embedding_vec <=> ${stringifiedEmbedding}) as similarity`)
          .order('similarity', { ascending: false })
          .limit(15);
      });
        
      if (directError) {
        console.error("Direct database query error:", directError);
        throw new Error(`Database query error: ${directError.message}`);
      }
      
      alumniData = directData || [];
      console.log(`Direct query returned ${alumniData.length} records`);
      console.log("Sample similarity score:", alumniData[0]?.similarity);
    } catch (error) {
      console.error("Database query error:", error);
      throw new Error(`Database query error: ${error.message}`);
    }

    if (alumniData.length === 0) {
      console.log("No alumni found in the database query");
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${alumniData.length} alumni records for processing`);

    // Step 3: Prepare data for GPT - no text trimming now
    console.log("==== DATA PREPARATION FOR GPT ====");
    
    // Keep full text fields without trimming
    const alumniForGPT = alumniData.map(alumni => ({
      first_name: alumni['First Name'] || '',
      last_name: alumni['Last Name'] || '',
      headline: alumni['Headline'] || '',
      class_year: alumni['Class Year'] || '',
      location: alumni['Location'] || '',
      linkedin_url: alumni['LinkedIn URL'] || '',
      email: alumni['Email Address'] || '',
      summary: alumni['Summary'] || '',
      experiences: alumni['Experiences'] || '',
      education: alumni['Education'] || ''
    }));
    
    console.log("Prepared data for GPT processing");
    console.log("Number of alumni prepared for GPT:", alumniForGPT.length);
    console.log("Sample prepared alumni data:", JSON.stringify(alumniForGPT[0], null, 2));

    // Step 4: Use GPT-4-mini for reranking
    console.log("==== GPT RERANKING ====");
    console.log("Preparing GPT reranking request with model: gpt-4o-mini");
    
    const systemPrompt = `You are an assistant that filters and refines alumni search matches for a user query.

Task:
- Read the user query carefully: "${query}"
- Review the list of alumni candidates provided.
- Select only alumni that are meaningfully relevant to the user's query.
- For each selected alumnus:
  - Use existing headline if available; otherwise, generate a brief professional headline based on their Summary and Experience.
  - Summarize Education into a few short words (e.g., "Yale College. Harvard Business School.").
  - Summarize key Experiences into a few short words (e.g., "Summer Consultant at BCG. Founding Engineer at Lido.").

Return ONLY a structured JSON array with objects for each matched alumnus.

JSON format example:
[
  {
    "first_name": "Alice",
    "last_name": "Smith",
    "headline": "Founder at AI Innovators",
    "class_year": "2022",
    "location": "Boston, MA",
    "linkedin_url": "https://linkedin.com/in/alicesmith",
    "email": "alice@example.com",
    "education_summary": "MIT. Harvard Business School.",
    "experience_summary": "Software Engineer at Google. Founder at AI Innovators."
  }
]

If no alumni are relevant, return an empty array [].
Be concise in your summaries to keep the output small.`;

    console.log("System prompt for GPT reranking:", systemPrompt);
    
    const gptRequestBody = {
      model: "gpt-4o-mini", // Using smaller model to avoid rate limits
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(alumniForGPT) }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    console.log("Sending reranking request to GPT with model:", gptRequestBody.model);
    console.log("Request payload size (approximation):", JSON.stringify(gptRequestBody).length, "characters");
    
    try {
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
        throw new Error("GPT API error: " + errorText);
      }

      const gptResult = await gptResponse.json();
      console.log("GPT reranking completed successfully");
      console.log("GPT response finish_reason:", gptResult.choices[0].finish_reason);
      
      // Parse GPT's response to get the final ranked results
      const gptContent = gptResult.choices[0].message.content;
      console.log("GPT response content:", gptContent);
      
      let rerankedResults;
      try {
        const parsedContent = JSON.parse(gptContent);
        
        if (Array.isArray(parsedContent)) {
          rerankedResults = parsedContent;
          console.log("Using direct array from parsed content");
        } else if (parsedContent.results && Array.isArray(parsedContent.results)) {
          rerankedResults = parsedContent.results;
          console.log("Using results array from parsed content");
        } else {
          const arrayProperty = Object.keys(parsedContent).find(key => Array.isArray(parsedContent[key]));
          if (arrayProperty) {
            rerankedResults = parsedContent[arrayProperty];
            console.log(`Found array property: ${arrayProperty}`);
          } else {
            rerankedResults = [];
            console.log("No array found in parsed content, using empty array");
          }
        }
      } catch (error) {
        console.error("Error parsing GPT response:", error);
        console.log("Raw GPT response:", gptResult.choices[0].message.content);
        
        // Create fallback results from the raw alumni data
        rerankedResults = alumniData.map(alumni => ({
          first_name: alumni['First Name'] || '',
          last_name: alumni['Last Name'] || '',
          headline: alumni['Headline'] || `${alumni['Title'] || 'Professional'} at ${alumni['Company'] || ''}`,
          class_year: alumni['Class Year'] || '',
          location: alumni['Location'] || '',
          linkedin_url: alumni['LinkedIn URL'] || '',
          email: alumni['Email Address'] || '',
          education_summary: "HBS" + (alumni['Class Year'] ? ` Class of ${alumni['Class Year']}` : ''),
          experience_summary: `${alumni['Title'] || ''} at ${alumni['Company'] || ''}`
        })).slice(0, 5);
        console.log("Created fallback results from raw alumni data");
      }
      
      console.log(`Returning ${rerankedResults.length} alumni after reranking`);
      console.log("==== SEARCH COMPLETE ====");

      return new Response(JSON.stringify({ results: rerankedResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch (error) {
      console.error('Error in GPT processing:', error);
      
      // If GPT processing fails, return basic alumni data as fallback
      const fallbackResults = alumniData.map(alumni => ({
        first_name: alumni['First Name'] || '',
        last_name: alumni['Last Name'] || '',
        headline: alumni['Headline'] || `${alumni['Title'] || ''} ${alumni['Company'] ? 'at ' + alumni['Company'] : ''}`,
        class_year: alumni['Class Year'] || '',
        location: alumni['Location'] || '',
        linkedin_url: alumni['LinkedIn URL'] || '',
        email: alumni['Email Address'] || '',
        education_summary: "Harvard Business School" + (alumni['Class Year'] ? ` Class of ${alumni['Class Year']}` : ''),
        experience_summary: alumni['Experiences'] ? 
          alumni['Experiences'].split('.')[0].substring(0, 200) + (alumni['Experiences'].length > 200 ? '...' : '') : 
          `${alumni['Title'] || ''} ${alumni['Company'] ? 'at ' + alumni['Company'] : ''}`
      })).slice(0, 10);
      
      console.log("GPT processing failed. Using fallback results from raw alumni data.");
      console.log(`Returning ${fallbackResults.length} alumni as fallback`);
      
      return new Response(JSON.stringify({ 
        results: fallbackResults,
        error: "GPT processing failed: " + error.message,
        fallback: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Return 200 with fallback results
      });
    }
  } catch (error) {
    console.error('Error in semantic search function:', error);
    return new Response(JSON.stringify({ error: error.message, results: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 even on error, with error info in the response
    });
  }
});
