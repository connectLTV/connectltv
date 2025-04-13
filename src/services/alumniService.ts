
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
}

// Function to search alumni from Supabase database
export const searchAlumni = async (query: string): Promise<Alumni[]> => {
  console.log("Searching alumni with query:", query);
  
  try {
    // Fetch alumni from Supabase
    const { data: alumniData, error } = await supabase
      .from('LTVAlumni Database (Spring 2025)')
      .select('*');
      
    if (error) {
      console.error("Error fetching alumni:", error);
      throw error;
    }

    if (!alumniData || alumniData.length === 0) {
      console.log("No alumni found in database");
      return [];
    }

    console.log(`Found ${alumniData.length} alumni records`);
    
    // Transform the data from Supabase format to our Alumni interface
    const transformedData = alumniData.map(record => ({
      id: record.User_ID?.toString() || Math.random().toString(),
      firstName: record['First Name'] || '',
      lastName: record['Last Name'] || '',
      currentTitle: record['Title'] || '',
      currentCompany: record['Company'] || '',
      workExperience: `${record['Title'] || 'Professional'} at ${record['Company'] || 'Company'}. ${record['Class Year'] ? `HBS Class of ${record['Class Year']}.` : ''} ${record['Location'] ? `Based in ${record['Location']}.` : ''}`,
      email: record['Email Address'] || '',
      linkedinUrl: record['LinkedIn URL'] || '#',
      relevanceReason: '', // We'll calculate this based on the query
      imageUrl: undefined
    }));
    
    // Implement semantic search using the query
    return rankAlumniByRelevance(transformedData, query);
  } catch (error) {
    console.error("Error in searchAlumni:", error);
    return [];
  }
};

// Function to rank alumni by relevance to the query
const rankAlumniByRelevance = (alumni: Alumni[], query: string): Alumni[] => {
  // Convert query to lowercase for case-insensitive matching
  const queryLower = query.toLowerCase();
  
  // Calculate relevance score for each alumni
  const scoredAlumni = alumni.map(person => {
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
      if (person.currentTitle.toLowerCase().includes('founder') || 
          person.currentTitle.toLowerCase().includes('ceo') ||
          person.currentTitle.toLowerCase().includes('chief')) {
        score += 50;
        relevanceReason = "Has founder experience, can provide insights on entrepreneurial career paths.";
      } else if (person.currentTitle.toLowerCase().includes('vp') || 
                person.currentTitle.toLowerCase().includes('head') ||
                person.currentTitle.toLowerCase().includes('director')) {
        score += 30;
        relevanceReason = "Has senior leadership experience in established companies.";
      }
    }
    
    // Check for industry or domain expertise
    for (const word of queryWords) {
      if (person.currentCompany.toLowerCase().includes(word) || 
          person.currentTitle.toLowerCase().includes(word)) {
        score += 40;
        relevanceReason = `Direct experience with ${word} in current role.`;
      }
    }
    
    // Check for specific company mentions
    for (const word of queryWords) {
      if (person.workExperience.toLowerCase().includes(word)) {
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
  return sortedAlumni.slice(0, 10);
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
