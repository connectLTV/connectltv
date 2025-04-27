
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
    
    // Initialize OpenAI API call to understand the search criteria
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that analyzes search queries and extracts key search criteria. Consider criteria like: industry, role/title, location, year, skills, company type, and any other relevant factors. Return ONLY a JSON object with the extracted criteria, no other text."
          },
          {
            role: "user",
            content: `Extract search criteria from this query: "${query}"`
          }
        ],
        temperature: 0.3
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${await openaiResponse.text()}`);
    }

    const aiResult = await openaiResponse.json();
    const searchCriteria = JSON.parse(aiResult.choices[0].message.content);
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch alumni data
    const { data: alumniData, error } = await supabase
      .from('LTVAlumni Database (Spring 2025)')
      .select('*');
      
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Transform alumni data
    const transformedData = alumniData.map(record => ({
      id: record.User_ID?.toString() || Math.random().toString(),
      firstName: record['First Name'] || '',
      lastName: record['Last Name'] || '',
      currentTitle: record['Title'] || '',
      currentCompany: record['Company'] || '',
      workExperience: `${record['Title'] || 'Professional'} at ${record['Company'] || 'Company'}. ${record['Class Year'] ? `HBS Class of ${record['Class Year']}.` : ''} ${record['Location'] ? `Based in ${record['Location']}.` : ''}`,
      email: record['Email Address'] || '',
      linkedinUrl: record['LinkedIn URL'] || '#',
      location: record['Location'] || '',
      classYear: record['Class Year'] || '',
      industry: record['Industry'] || '',
      function: record['Function'] || '',
      relevanceReason: ''
    }));

    // Score and rank alumni based on search criteria
    const scoredAlumni = transformedData.map(alumni => {
      let score = 0;
      let matchReasons = [];

      // Location matching
      if (searchCriteria.location && alumni.location) {
        if (alumni.location.toLowerCase().includes(searchCriteria.location.toLowerCase())) {
          score += 30;
          matchReasons.push(`Based in ${alumni.location}`);
        }
      }

      // Industry matching
      if (searchCriteria.industry && alumni.industry) {
        if (alumni.industry.toLowerCase().includes(searchCriteria.industry.toLowerCase())) {
          score += 30;
          matchReasons.push(`Works in ${alumni.industry}`);
        }
      }

      // Role/Title matching
      if (searchCriteria.role && alumni.currentTitle) {
        if (alumni.currentTitle.toLowerCase().includes(searchCriteria.role.toLowerCase())) {
          score += 25;
          matchReasons.push(`Current role: ${alumni.currentTitle}`);
        }
      }

      // Year matching
      if (searchCriteria.year && alumni.classYear) {
        if (alumni.classYear.toString() === searchCriteria.year.toString()) {
          score += 20;
          matchReasons.push(`Class of ${alumni.classYear}`);
        }
      }

      // Company type matching
      if (searchCriteria.companyType && alumni.currentCompany) {
        if (alumni.currentCompany.toLowerCase().includes(searchCriteria.companyType.toLowerCase())) {
          score += 20;
          matchReasons.push(`Works at ${alumni.currentCompany}`);
        }
      }

      // Add some randomness to prevent same-score clustering
      score += Math.random() * 5;

      return {
        ...alumni,
        relevanceScore: score,
        relevanceReason: matchReasons.length > 0 
          ? matchReasons.join('. ')
          : `Profile may be relevant to your search for ${query}`
      };
    });

    // Sort by relevance score and return top matches
    const results = scoredAlumni
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 10)
      .map(({ relevanceScore, ...alumni }) => alumni);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in semantic search function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
