
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
}

// Function to search alumni from Supabase database with semantic search capabilities
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
      imageUrl: undefined,
      location: record['Location'] || undefined,
      classYear: record['Class Year'] || undefined,
      instructor: record['LTV Instructor(s)'] || undefined,
      industry: extractIndustry(record['Company'] || '', record['Title'] || ''),
      function: extractFunction(record['Title'] || '')
    }));
    
    // Parse the query for better semantic understanding
    const parsedQuery = parseQuery(query);
    console.log("Parsed query:", parsedQuery);
    
    // Perform semantic search using the parsed query
    return semanticSearch(transformedData, query, parsedQuery);
  } catch (error) {
    console.error("Error in searchAlumni:", error);
    return [];
  }
};

// Parse the natural language query into searchable components
const parseQuery = (query: string) => {
  const queryLower = query.toLowerCase();
  const result: Record<string, any> = {
    keywords: [],
    location: null,
    year: null,
    industry: null,
    role: null,
    concepts: []
  };
  
  // Extract location info
  const locationPatterns = [
    /\bin\s+([a-z\s]+)/i,
    /\bfrom\s+([a-z\s]+)/i,
    /\bbased\s+in\s+([a-z\s]+)/i,
    /\bliving\s+in\s+([a-z\s]+)/i
  ];
  
  for (const pattern of locationPatterns) {
    const match = queryLower.match(pattern);
    if (match && match[1]) {
      result.location = match[1].trim();
      break;
    }
  }
  
  // Extract year info
  const yearPattern = /\b(20\d{2})\b|\bclass\s+of\s+(20\d{2})\b/i;
  const yearMatch = queryLower.match(yearPattern);
  if (yearMatch) {
    result.year = yearMatch[1] || yearMatch[2];
  }
  
  // Extract industry keywords
  const industries = ['tech', 'finance', 'healthcare', 'retail', 'media', 'ai', 'startup'];
  industries.forEach(industry => {
    if (queryLower.includes(industry)) {
      result.industry = industry;
    }
  });
  
  // Extract role/function keywords
  const roles = ['ceo', 'founder', 'engineer', 'product', 'marketing', 'sales', 'operations', 'finance'];
  roles.forEach(role => {
    if (queryLower.includes(role)) {
      result.role = role;
    }
  });
  
  // Extract key concepts
  const conceptPatterns = [
    /\bexpert(s|ise)?\s+in\s+([a-z\s]+)/i,
    /\bspecialist(s)?\s+in\s+([a-z\s]+)/i,
    /\bexperience\s+with\s+([a-z\s]+)/i,
    /\bknowledge\s+of\s+([a-z\s]+)/i
  ];
  
  for (const pattern of conceptPatterns) {
    const match = queryLower.match(pattern);
    if (match && match[2]) {
      result.concepts.push(match[2].trim());
    }
  }
  
  // Extract remaining keywords (excluding common words)
  const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'as', 'to', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'of', 'from']);
  const words = queryLower
    .replace(/[.,?!;:()\[\]{}]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  result.keywords = [...new Set(words)];
  
  return result;
};

// Helper function to extract industry from company and title
const extractIndustry = (company: string, title: string): string | undefined => {
  const industries = {
    tech: ['Google', 'Apple', 'Microsoft', 'Amazon', 'Facebook', 'Meta', 'Tech', 'Software', 'AI', 'Data'],
    finance: ['Bank', 'Capital', 'Invest', 'Finance', 'Financial', 'Fund', 'Asset', 'Venture'],
    healthcare: ['Health', 'Care', 'Medical', 'Pharma', 'Hospital', 'Bio', 'Life Sciences'],
    retail: ['Retail', 'Consumer', 'Shop', 'Store', 'Brand', 'Fashion'],
    media: ['Media', 'Entertainment', 'News', 'Film', 'TV', 'Television', 'Studio'],
  };
  
  const companyTitle = `${company} ${title}`.toLowerCase();
  
  for (const [industry, keywords] of Object.entries(industries)) {
    if (keywords.some(keyword => companyTitle.includes(keyword.toLowerCase()))) {
      return industry.charAt(0).toUpperCase() + industry.slice(1);
    }
  }
  
  return undefined;
};

// Helper function to extract function from title
const extractFunction = (title: string): string | undefined => {
  const functions = {
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

// Fuzzy search function to check if a string contains a search term with some tolerance
const fuzzyMatch = (source: string, term: string): number => {
  if (!source || !term) return 0;
  source = source.toLowerCase();
  term = term.toLowerCase();
  
  // Exact match has highest score
  if (source.includes(term)) return 1;
  
  // Check for partial matches
  const words = source.split(/\s+/);
  for (const word of words) {
    // If word starts with the term
    if (word.startsWith(term)) return 0.8;
    
    // If word contains the term
    if (word.includes(term)) return 0.6;
    
    // Levenshtein-like similarity for small edits (simple version)
    if (term.length > 3 && word.length > 3) {
      let matches = 0;
      for (let i = 0; i < term.length - 1; i++) {
        const bigram = term.substring(i, i + 2);
        if (word.includes(bigram)) {
          matches++;
        }
      }
      const similarity = matches / (term.length - 1);
      if (similarity > 0.5) return 0.4 * similarity;
    }
  }
  
  return 0;
};

// Enhanced semantic search with relevance ranking
const semanticSearch = (alumni: Alumni[], originalQuery: string, parsedQuery: Record<string, any>): Alumni[] => {
  // Calculate relevance score for each alumni
  const scoredAlumni = alumni.map(person => {
    let score = 0;
    let reasons: string[] = [];
    const fullDetails = `${person.firstName} ${person.lastName} ${person.currentTitle} ${person.currentCompany} ${person.workExperience} ${person.location || ''} ${person.classYear || ''} ${person.instructor || ''} ${person.industry || ''} ${person.function || ''}`.toLowerCase();
    
    // Check explicit location matches
    if (parsedQuery.location && person.location) {
      const matchScore = fuzzyMatch(person.location, parsedQuery.location);
      if (matchScore > 0) {
        score += 40 * matchScore;
        reasons.push(`Based in ${person.location}, matching your location interest.`);
      }
    }
    
    // Check year matches
    if (parsedQuery.year && person.classYear) {
      const matchScore = fuzzyMatch(person.classYear, parsedQuery.year);
      if (matchScore > 0) {
        score += 30 * matchScore;
        reasons.push(`From class of ${person.classYear}, matching your year preference.`);
      }
    }
    
    // Check industry matches
    if (parsedQuery.industry && person.industry) {
      const matchScore = fuzzyMatch(person.industry, parsedQuery.industry);
      if (matchScore > 0) {
        score += 50 * matchScore;
        reasons.push(`Works in the ${person.industry} industry as specified.`);
      }
    }
    
    // Check role/function matches
    if (parsedQuery.role && person.function) {
      const matchScore = fuzzyMatch(person.function, parsedQuery.role);
      if (matchScore > 0) {
        score += 45 * matchScore;
        reasons.push(`Has experience in ${person.function} role as requested.`);
      }
    }
    
    // Check for specific concept matches in work experience
    if (parsedQuery.concepts.length > 0) {
      for (const concept of parsedQuery.concepts) {
        const matchScore = fuzzyMatch(person.workExperience, concept);
        if (matchScore > 0) {
          score += 35 * matchScore;
          reasons.push(`Has expertise related to ${concept}.`);
          break;
        }
      }
    }
    
    // Check keywords throughout all fields
    for (const keyword of parsedQuery.keywords) {
      if (keyword.length < 3) continue; // Skip very short keywords
      
      const matchScore = fuzzyMatch(fullDetails, keyword);
      if (matchScore > 0) {
        score += 20 * matchScore;
        // Don't add redundant keyword reasons if we already have specific reasons
        if (reasons.length === 0) {
          reasons.push(`Profile matches "${keyword}" from your search.`);
        }
      }
    }
    
    // Check context-aware patterns for certain types of queries
    const queryLower = originalQuery.toLowerCase();
    
    // For career guidance queries
    if (queryLower.includes('career') || queryLower.includes('advice') || queryLower.includes('path')) {
      if ((person.currentTitle || '').toLowerCase().includes('founder') || 
          (person.currentTitle || '').toLowerCase().includes('ceo')) {
        score += 25;
        reasons.push(`As a ${person.currentTitle}, can offer valuable career guidance and entrepreneurial insights.`);
      }
    }
    
    // For industry expertise queries
    if (queryLower.includes('expert') || queryLower.includes('specialist') || queryLower.includes('experience')) {
      if ((person.currentTitle || '').toLowerCase().includes('head') || 
          (person.currentTitle || '').toLowerCase().includes('director') ||
          (person.currentTitle || '').toLowerCase().includes('vp')) {
        score += 20;
        reasons.push(`Senior-level expertise as ${person.currentTitle} at ${person.currentCompany}.`);
      }
    }
    
    // Add some randomness for diversity (very small factor)
    score += Math.random() * 2;
    
    // Select the most relevant reason if we have multiple
    let relevanceReason = reasons.length > 0 
      ? reasons[0] 
      : `Experience at ${person.currentCompany} as ${person.currentTitle} might relate to your search.`;
    
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
