
import { supabase } from "@/integrations/supabase/client";

export interface Alumni {
  id: string;
  firstName: string;
  lastName: string;
  currentTitle: string;
  currentCompany: string;
  workExperience: string;
  relevanceReason: string;
  email: string;
  linkedinUrl: string;
  imageUrl?: string;
  location?: string;
  classYear?: string;
  instructor?: string;
  industry?: string;
  function?: string;

  headline?: string;
  education_summary?: string;
  experience_summary?: string;
  why_relevant?: string;
}

export interface SearchCallbacks {
  onStart?: (totalCandidates: number, timestampMs: number) => void;
  onResult?: (result: Alumni, index: number, timestampMs: number) => void;
  onComplete?: (totalResults: number, totalTimeMs: number) => void;
  onError?: (error: string) => void;
}

export type SearchPhase = 'idle' | 'searching' | 'streaming' | 'complete' | 'error';

// Helper function to extract function from title
const extractFunction = (title: string): string | undefined => {
  const functions: Record<string, string[]> = {
    engineering: ['Engineer', 'Developer', 'CTO', 'Technical', 'Architecture'],
    product: ['Product', 'PM', 'UX', 'User'],
    marketing: ['Marketing', 'Growth', 'Brand', 'CMO'],
    sales: ['Sales', 'Business Development', 'Account', 'Revenue'],
    operations: ['Operations', 'COO', 'Ops', 'Supply'],
    finance: ['Finance', 'CFO', 'Financial', 'Accounting'],
    founder: ['Founder', 'CEO', 'Owner', 'Entrepreneur'],
  };

  const titleLower = title.toLowerCase();

  for (const [func, keywords] of Object.entries(functions)) {
    if (keywords.some(keyword => titleLower.includes(keyword.toLowerCase()))) {
      return func.charAt(0).toUpperCase() + func.slice(1);
    }
  }

  return undefined;
};

// Transform raw result to Alumni interface
const transformResult = (alumni: Record<string, unknown>, index: number): Alumni => {
  const currentTitle = (alumni.current_title || alumni.headline || '') as string;
  return {
    id: (alumni.person_id || `result-${index}-${Math.random().toString(36).substring(2, 9)}`) as string,
    firstName: (alumni.first_name || '') as string,
    lastName: (alumni.last_name || '') as string,
    currentTitle: currentTitle,
    currentCompany: (alumni.current_company || '') as string,
    workExperience: (alumni.experience_summary || '') as string,
    email: (alumni.email || '') as string,
    linkedinUrl: (alumni.linkedin_url || '#') as string,
    location: (alumni.location || '') as string,
    classYear: (alumni.class_year || '') as string,
    instructor: (alumni.section || '') as string,
    industry: (alumni.current_industry || '') as string,
    function: extractFunction(currentTitle),
    relevanceReason: (alumni.why_relevant || alumni.experience_summary || alumni.headline || '') as string,
    headline: (alumni.headline || '') as string,
    education_summary: (alumni.education_summary || '') as string,
    experience_summary: (alumni.experience_summary || '') as string,
    why_relevant: (alumni.why_relevant || '') as string
  };
};

// Streaming search function with incremental result loading
export const searchAlumniStreaming = async (
  query: string,
  callbacks: SearchCallbacks
): Promise<void> => {
  console.log("Searching alumni with streaming, query:", query);

  try {
    // Get the Supabase URL and anon key for direct fetch
    const supabaseUrl = "https://bcpwjwfubnpchoscvrum.supabase.co";
    const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcHdqd2Z1Ym5wY2hvc2N2cnVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1ODgyMDEsImV4cCI6MjA3NTE2NDIwMX0.yTegOVlV_yy1rsVorfBLbURcxuUBApNrpFsi8-P5bJA";

    const response = await fetch(`${supabaseUrl}/functions/v1/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ query, stream: true })
    });

    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete event in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'start') {
              console.log(`[${event.timestamp_ms}ms] GPT streaming started, ${event.total_candidates} candidates`);
              callbacks.onStart?.(event.total_candidates, event.timestamp_ms);
            } else if (event.type === 'result') {
              console.log(`[${event.timestamp_ms}ms] Result ${event.index}: ${event.result.first_name} ${event.result.last_name}`);
              const transformed = transformResult(event.result, event.index - 1);
              callbacks.onResult?.(transformed, event.index, event.timestamp_ms);
            } else if (event.type === 'complete') {
              console.log(`[${event.total_time_ms}ms] Search complete, ${event.total_results} results`);
              callbacks.onComplete?.(event.total_results, event.total_time_ms);
            } else if (event.type === 'error') {
              console.error("Search error:", event.message);
              callbacks.onError?.(event.message);
            }
          } catch (e) {
            console.error("Failed to parse SSE event:", e, jsonStr);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in searchAlumniStreaming:", error);
    callbacks.onError?.(error instanceof Error ? error.message : 'Unknown error');
  }
};

// Non-streaming search function (fallback/legacy)
export const searchAlumni = async (query: string): Promise<Alumni[]> => {
  console.log("Searching alumni with query:", query);

  try {
    console.log("Calling /search edge function with query:", query);
    const { data: searchResponse, error: functionError } = await supabase.functions.invoke('search', {
      body: { query, stream: false }
    });

    if (functionError) {
      console.error("Error calling search function:", functionError);
      throw functionError;
    }

    console.log("Search response received:", searchResponse);
    console.log("Results count:", searchResponse.results?.length || 0);

    // Log debug info if present
    if (searchResponse.debug) {
      console.log("==== DEBUG INFO ====");
      console.log("Total time:", searchResponse.debug.total_time_ms, "ms");
      console.log("Steps:");
      searchResponse.debug.steps?.forEach((step: { elapsed_ms: number; step: string; data?: unknown }) => {
        console.log(`  [${step.elapsed_ms}ms] ${step.step}`, step.data || '');
      });
      console.log("====================");
    }

    if (searchResponse.error) {
      console.error("Search function returned an error:", searchResponse.error);
      console.error("Debug info:", searchResponse.debug);
    }

    if (!searchResponse.results || !Array.isArray(searchResponse.results)) {
      console.error("Invalid results format received:", searchResponse);
      return [];
    }

    const transformedResults = searchResponse.results.map(transformResult);
    console.log("==== SEARCH COMPLETE ====");
    return transformedResults;
  } catch (error) {
    console.error("Error in searchAlumni:", error);
    return [];
  }
};

// Function to generate an email template
export const generateIntroEmail = (alumni: Alumni): string => {
  return `Subject: Harvard Business School LTV Connection

Dear ${alumni.firstName},

I hope this email finds you well. I'm a current student in Harvard Business School's Launching Tech Ventures course, and I found your profile through our alumni network.

I'm particularly interested in your experience with ${alumni.currentCompany} as ${alumni.currentTitle}. I'm working on a project related to your field and would greatly appreciate the opportunity to connect for a brief conversation to gain insights from your expertise.

Would you be available for a 15-minute call in the coming weeks? I'm flexible with scheduling and would be grateful for any time you could spare.

Thank you for considering my request. I look forward to potentially connecting.

Best regards,
[Your Name]
Harvard Business School, Class of [Your Year]
[Your Contact Information]`;
};
