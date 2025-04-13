
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
    
    // Initialize Supabase client using environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://qqpduzxikexqqniqhwrb.supabase.co';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch alumni data
    const { data: alumniData, error } = await supabase
      .from('LTVAlumni Database (Spring 2025)')
      .select('*');
      
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    // Process alumni data similar to the frontend
    const transformedData = alumniData.map(record => ({
      id: record.User_ID?.toString() || Math.random().toString(),
      firstName: record['First Name'] || '',
      lastName: record['Last Name'] || '',
      currentTitle: record['Title'] || '',
      currentCompany: record['Company'] || '',
      workExperience: `${record['Title'] || 'Professional'} at ${record['Company'] || 'Company'}. ${record['Class Year'] ? `HBS Class of ${record['Class Year']}.` : ''} ${record['Location'] ? `Based in ${record['Location']}.` : ''}`,
      email: record['Email Address'] || '',
      linkedinUrl: record['LinkedIn URL'] || '#',
      relevanceReason: '',
    }));
    
    // Perform the semantic search (simplified version)
    const queryLower = query.toLowerCase();
    
    // Calculate relevance score for each alumni
    const scoredAlumni = transformedData.map(person => {
      let score = 0;
      let relevanceReason = "";
      
      // Keywords from the query
      const queryWords = queryLower
        .split(/\s+/)
        .filter(word => word.length > 2)
        .map(word => word.replace(/[.,?!;:()]/g, ''));
        
      // Check for career guidance queries
      if (queryLower.includes('career') || 
          queryLower.includes('joining') || 
          queryLower.includes('founding') || 
          queryLower.includes('founder') ||
          queryLower.includes('path')) {
        // Look for people with founder experience or senior roles
        if ((person.currentTitle || '').toLowerCase().includes('founder') || 
            (person.currentTitle || '').toLowerCase().includes('ceo') ||
            (person.currentTitle || '').toLowerCase().includes('chief')) {
          score += 50;
          relevanceReason = "Has founder experience, can provide insights on entrepreneurial career paths.";
        } else if ((person.currentTitle || '').toLowerCase().includes('vp') || 
                  (person.currentTitle || '').toLowerCase().includes('head') ||
                  (person.currentTitle || '').toLowerCase().includes('director')) {
          score += 30;
          relevanceReason = "Has senior leadership experience in established companies.";
        }
      }
      
      // Check for industry or domain expertise
      for (const word of queryWords) {
        if ((person.currentCompany || '').toLowerCase().includes(word) || 
            (person.currentTitle || '').toLowerCase().includes(word)) {
          score += 40;
          relevanceReason = `Direct experience with ${word} in current role.`;
        }
      }
      
      // Check for specific company mentions
      for (const word of queryWords) {
        if ((person.workExperience || '').toLowerCase().includes(word)) {
          score += 20;
          relevanceReason = relevanceReason || `Has experience related to ${word}.`;
        }
      }
      
      // If no specific relevance was found, create a generic one
      if (!relevanceReason && person.currentCompany) {
        relevanceReason = `Experience at ${person.currentCompany} as ${person.currentTitle} might provide valuable perspective.`;
      }
      
      // Add some randomness to avoid same-score clustering
      score += Math.random() * 10;
      
      return {
        ...person,
        relevanceScore: score,
        relevanceReason
      };
    });
    
    // Sort by relevance score (descending)
    const sortedAlumni = scoredAlumni
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .map(({ relevanceScore, ...alumni }) => alumni); // Remove the score from the final result
    
    // Return top 10 results
    const results = sortedAlumni.slice(0, 10);
    
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
