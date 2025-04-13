
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

// Mock data for demonstration purposes
const mockAlumniData: Alumni[] = [
  {
    id: "1",
    firstName: "Sarah",
    lastName: "Johnson",
    currentTitle: "Founder & CEO",
    currentCompany: "TechFlow AI",
    workExperience: "Previously Product Lead at Google, MBA from Harvard Business School (2015). 8+ years building AI products and founding startups.",
    relevanceReason: "Founded an enterprise SaaS company that automates workflows for the construction industry. Perfect match for your enterprise SaaS interests.",
    email: "sarah.johnson@techflow.ai",
    linkedinUrl: "https://linkedin.com/in/sarahjohnson",
    imageUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "2",
    firstName: "Michael",
    lastName: "Chen",
    currentTitle: "VP of Product",
    currentCompany: "Stripe",
    workExperience: "Previously at McKinsey, MBA from Harvard Business School (2016). 7 years in fintech and payments innovation.",
    relevanceReason: "Extensive experience in both founding and joining startups. Can provide insights on both career paths you're considering.",
    email: "michael.chen@stripe.com",
    linkedinUrl: "https://linkedin.com/in/michaelchen",
    imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "3",
    firstName: "Alexandra",
    lastName: "Rodriguez",
    currentTitle: "Chief Operations Officer",
    currentCompany: "BuildTech Solutions",
    workExperience: "Previously Operations Director at Autodesk, MBA from Harvard Business School (2014). 10 years specializing in construction technology.",
    relevanceReason: "Leads operations at a construction workflow software company. Direct experience with workflow automation in construction.",
    email: "alex.rodriguez@buildtech.com",
    linkedinUrl: "https://linkedin.com/in/alexrodriguez",
    imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "4",
    firstName: "David",
    lastName: "Park",
    currentTitle: "Founder",
    currentCompany: "FounderPath",
    workExperience: "Serial entrepreneur, previously founder at TechStars, MBA from Harvard Business School (2013). Founded 3 successful startups.",
    relevanceReason: "Has founded multiple startups after HBS and mentors recent graduates on founder vs. joiner decisions.",
    email: "david.park@founderpath.com",
    linkedinUrl: "https://linkedin.com/in/davidpark",
    imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "5",
    firstName: "Priya",
    lastName: "Patel",
    currentTitle: "Senior Director of Finance",
    currentCompany: "OpenTable",
    workExperience: "Previously at Goldman Sachs and CFO of a restaurant chain, MBA from Harvard Business School (2012). 12 years in restaurant finance.",
    relevanceReason: "Senior leader in restaurant finance with extensive network in the industry. Perfect for your invoice automation partnership goals.",
    email: "priya.patel@opentable.com",
    linkedinUrl: "https://linkedin.com/in/priyapatel",
    imageUrl: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "6",
    firstName: "James",
    lastName: "Wilson",
    currentTitle: "Head of Product",
    currentCompany: "Amazon Web Services",
    workExperience: "Previously PM at Microsoft, MBA from Harvard Business School (2017). 6 years leading cloud infrastructure products.",
    relevanceReason: "Experience at both startups and Big Tech can provide valuable perspective on your career path options.",
    email: "james.wilson@aws.com",
    linkedinUrl: "https://linkedin.com/in/jameswilson",
    imageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "7",
    firstName: "Emma",
    lastName: "Thompson",
    currentTitle: "Co-Founder & CTO",
    currentCompany: "WorkflowGenius",
    workExperience: "Previously Engineering Lead at Slack, MBA from Harvard Business School (2018). Built workflow automation products for 5+ industries.",
    relevanceReason: "Technical co-founder with deep expertise in workflow automation across multiple industries, including construction.",
    email: "emma.thompson@workflowgenius.com",
    linkedinUrl: "https://linkedin.com/in/emmathompson",
    imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "8",
    firstName: "Robert",
    lastName: "Sanchez",
    currentTitle: "VP of Finance",
    currentCompany: "ChefTable Group",
    workExperience: "Previously at JP Morgan and restaurant startup advisor, MBA from Harvard Business School (2014). Expert in restaurant financial operations.",
    relevanceReason: "Senior leader in restaurant finance who has implemented several automation solutions. Great potential partner for your invoice startup.",
    email: "robert.sanchez@cheftable.com",
    linkedinUrl: "https://linkedin.com/in/robertsanchez",
    imageUrl: "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "9",
    firstName: "Lisa",
    lastName: "Kim",
    currentTitle: "Founder & CEO",
    currentCompany: "Joiner to Founder",
    workExperience: "Previously early employee at Airbnb, MBA from Harvard Business School (2012). 10+ years advising on startup career paths.",
    relevanceReason: "Started as an early employee then founded her own company. Now coaches HBS grads on founder vs. joiner decisions.",
    email: "lisa.kim@joinertofound.com",
    linkedinUrl: "https://linkedin.com/in/lisakim",
    imageUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=256&h=256&auto=format&fit=crop"
  },
  {
    id: "10",
    firstName: "Marcus",
    lastName: "Brown",
    currentTitle: "Head of Construction Tech",
    currentCompany: "BuildersVC",
    workExperience: "Previously founder of a construction management platform, MBA from Harvard Business School (2015). 9 years in construction technology.",
    relevanceReason: "Deep expertise in enterprise SaaS for the construction industry, particularly in workflow automation.",
    email: "marcus.brown@buildersvc.com",
    linkedinUrl: "https://linkedin.com/in/marcusbrown",
    imageUrl: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?q=80&w=256&h=256&auto=format&fit=crop"
  }
];

// Function to simulate a search through alumni database
export const searchAlumni = (query: string): Promise<Alumni[]> => {
  // In a real implementation, this would query the backend
  // For now, we're just returning mock data
  console.log("Searching alumni with query:", query);
  
  // Simulate API delay
  return new Promise((resolve) => {
    setTimeout(() => {
      // For simplicity, always return the same mock alumni for now
      // In a real implementation, this would filter based on the query
      resolve(mockAlumniData);
    }, 1500);
  });
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
