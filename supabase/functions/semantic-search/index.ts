
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
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: "text-embedding-ada-002",
        input: query
      })
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("OpenAI Embedding API error:", errorText);
      throw new Error(`Embedding API error: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    console.log("Embedding generation successful");
    const embedding = embeddingData.data[0].embedding;

    // Step 2: Perform vector search to find similar alumni
    console.log("Performing vector search with the generated embedding");
    
    const { data: alumniData, error } = await supabase.rpc(
      'match_alumni_embeddings',
      {
        query_embedding: embedding,
        match_threshold: 0.5, // Adjust as needed
        match_count: 20 // Get top 20 candidates for reranking
      }
    ).catch(error => {
      console.error("Vector search error:", error);
      return { data: null, error };
    });

    if (error || !alumniData) {
      console.error("Vector search failed:", error);
      // Fallback to direct database query if vector search fails
      console.log("Falling back to direct database query");
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('LTV Alumni Database Enriched with Embeddings')
        .select('*')
        .limit(20);
        
      if (fallbackError) {
        throw new Error(`Database query error: ${fallbackError.message}`);
      }
      
      alumniData = fallbackData || [];
    }

    if (alumniData.length === 0) {
      console.log("No alumni found matching the query");
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${alumniData.length} alumni records for reranking`);

    // Step 3: Rerank and enrich the results using GPT
    console.log("Preparing GPT reranking request");
    
    // Prepare data for GPT reranking
    const alumniForReranking = alumniData.map(alumni => ({
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

    const gptRequestBody = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an assistant that filters and refines alumni search matches for a user query.

Task:
- Read the user query carefully.
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
    "class_year": 2022,
    "location": "Boston, MA",
    "linkedin_url": "https://linkedin.com/in/alicesmith",
    "email": "alice@example.com",
    "education_summary": "MIT. Harvard Business School.",
    "experience_summary": "Software Engineer at Google. Founder at AI Innovators."
  }
]

If no alumni are relevant, return an empty array [].

Do not add any explanation outside the JSON. Only return the JSON array.`
        },
        {
          role: "user",
          content: `User query: "${query}"
          
Alumni candidates:
${JSON.stringify(alumniForReranking, null, 2)}`
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    console.log("Sending reranking request to GPT");
    
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
      throw new Error("GPT API unavailable");
    }

    const gptResult = await gptResponse.json();
    console.log("GPT reranking completed");
    
    let rerankedResults;
    try {
      // Parse GPT's response to get the final ranked results
      const gptContent = gptResult.choices[0].message.content;
      console.log("GPT response content:", gptContent);
      
      // Parse the JSON content - it should be a JSON array inside a JSON object
      const parsedContent = JSON.parse(gptContent);
      
      // Check if the parsed content contains results property
      if (Array.isArray(parsedContent)) {
        rerankedResults = parsedContent;
      } else if (parsedContent.results && Array.isArray(parsedContent.results)) {
        rerankedResults = parsedContent.results;
      } else {
        // Look for any array property
        const arrayProperty = Object.keys(parsedContent).find(key => Array.isArray(parsedContent[key]));
        rerankedResults = arrayProperty ? parsedContent[arrayProperty] : [];
      }
    } catch (error) {
      console.error("Error parsing GPT response:", error);
      console.log("Falling back to raw alumni data");
      
      // Simple fallback transformation of alumni data
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
      })).slice(0, 10);
    }
    
    console.log(`Returning ${rerankedResults.length} alumni after reranking`);
    console.log("Final search results:", JSON.stringify(rerankedResults, null, 2));

    return new Response(JSON.stringify({ results: rerankedResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in semantic search function:', error);
    return new Response(JSON.stringify({ error: error.message, results: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 even on error, with error info in the response
    });
  }
});

// We need a database function in Supabase to perform the vector search
// This is the SQL for that function (to be executed separately):
/*
CREATE OR REPLACE FUNCTION match_alumni_embeddings(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) 
RETURNS TABLE (
  "User_ID" bigint,
  "Last Name" text,
  "First Name" text,
  "LinkedIn URL" text,
  "Email Address" text,
  "Class Year" text,
  "LTV Instructor(s)" text,
  "Occupation" text,
  "Headline" text,
  "Summary" text,
  "Location" text,
  "Experiences" text,
  "Education" text,
  "Company" text,
  "Title" text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e."User_ID",
    e."Last Name",
    e."First Name",
    e."LinkedIn URL",
    e."Email Address",
    e."Class Year",
    e."LTV Instructor(s)",
    e."Occupation",
    e."Headline",
    e."Summary",
    e."Location",
    e."Experiences",
    e."Education",
    a."Company",
    a."Title",
    1 - (e.embedding_vec <=> query_embedding) AS similarity
  FROM
    "LTV Alumni Database Enriched with Embeddings" e
  LEFT JOIN
    "LTVAlumni Database (Spring 2025)" a ON e."User_ID" = a."User_ID"
  WHERE
    1 - (e.embedding_vec <=> query_embedding) > match_threshold
  ORDER BY
    e.embedding_vec <=> query_embedding
  LIMIT match_count;
END;
$$;
*/
